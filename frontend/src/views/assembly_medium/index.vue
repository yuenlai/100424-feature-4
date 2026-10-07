<template>
  <section class="page" data-module="assembly_medium">
    <header class="page-head">
      <div>
        <h2>中组立焊接管理</h2>
        <p class="page-desc">维护中组立分段，围绕组立编号、关联分段、焊接方法、焊材牌号做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记中组立分段</button>
        <button class="btn" type="button" @click="exportRows">导出中组立焊接清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无中组立焊接数据，可先登记中组立分段</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条中组立焊接记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <section class="param-card-panel">
      <header class="page-head">
        <div>
          <h3>焊接工艺参数卡</h3>
          <p class="page-desc">
            组立编号、焊接方法、焊材牌号、预热温度、焊后处理仅本焊工班组可维护，别的班组只能查看；共用胎架信息只读；已受控的旧参数任何人不得改写。当前班组：{{ session.crew }}
          </p>
        </div>
        <div class="page-actions">
          <button class="btn primary" type="button" @click="registerCard">登记工艺参数卡</button>
        </div>
      </header>

      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in cardColumns" :key="column">{{ column }}</th>
            <th>受控状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="card in paramCards" :key="String(card.id)">
            <td v-for="column in cardColumns" :key="column">{{ card[column] || '—' }}</td>
            <td>{{ card.status }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openCard(card)">
                {{ canMaintain(card) ? '维护' : '查看' }}
              </button>
              <button
                v-if="canMaintain(card)"
                class="link"
                type="button"
                @click="controlCard(card)"
              >
                受控
              </button>
            </td>
          </tr>
          <tr v-if="!paramCards.length">
            <td :colspan="cardColumns.length + 2" class="empty-state">暂无工艺参数卡，可先登记</td>
          </tr>
        </tbody>
      </table>

      <form v-if="editingCard" class="card-form" @submit.prevent="saveCard">
        <p class="card-form-title">
          {{ formEditable ? '维护' : '查看' }}参数卡 #{{ editingCard.id }}（归属：{{ editingCard['焊工班组'] }}）
          <span v-if="editingCard.status === controlledStatus" class="locked-tag">已受控，参数锁定</span>
          <span v-else-if="!formEditable" class="locked-tag">非本班组，只读</span>
        </p>
        <label v-for="field in crewFields" :key="field" class="filter-item">
          <span>{{ field }}</span>
          <input v-model="form[field]" :disabled="!formEditable" :placeholder="`填写${field}`" />
        </label>
        <label v-for="field in readonlyFields" :key="field" class="filter-item">
          <span>{{ field }}（只读）</span>
          <input :value="editingCard[field]" disabled />
        </label>
        <div class="card-form-actions">
          <button v-if="formEditable" class="btn primary" type="submit">保存参数卡</button>
          <button class="btn ghost" type="button" @click="closeCard">关闭</button>
        </div>
      </form>

      <footer class="page-foot">
        <span>共 {{ paramCards.length }} 张工艺参数卡</span>
        <span v-if="cardMessage" :class="cardMessageOk ? '' : 'error-text'">{{ cardMessage }}</span>
      </footer>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  controlParamCard,
  createParamCard,
  downloadEntries,
  listEntries,
  listParamCards,
  moduleMeta,
  runAction as applyAction,
  saveParamCard,
} from '@/api/local-service'
import {
  CONTROLLED_STATUS,
  CREW_FIELDS,
  PARAM_CARD_COLUMNS,
  READONLY_FIELDS,
} from '@/data/param-card'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('assembly_medium')
const columns = ["组立编号", "关联分段", "焊接方法", "焊材牌号", "预热温度", "焊工班组", "焊后处理", "组立状态"]
const actions = ["开始组立", "完成焊接", "提交NDT"]
const statuses = ["待组立", "组立中", "焊接中", "已完工", "待NDT"]
const stats = [{"label": "待组立分段", "value": 0}, {"label": "组立中分段", "value": 0}, {"label": "待NDT分段", "value": 0}]

const session = useSessionStore()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 工艺参数卡：列定义与字段权限来自 data/param-card.ts，保存一律走服务层校验。
const cardColumns = PARAM_CARD_COLUMNS
const crewFields = CREW_FIELDS
const readonlyFields = READONLY_FIELDS
const controlledStatus = CONTROLLED_STATUS
const paramCards = ref<EntryRow[]>([])
const editingId = ref<number | null>(null)
const form = ref<Record<string, string>>({})
const cardMessage = ref('')
const cardMessageOk = ref(false)

const editingCard = computed(
  () => paramCards.value.find((card) => Number(card.id) === editingId.value) ?? null,
)
// 本班组且未受控才可维护；已受控或非本班组一律只读，服务层还会再拦一道。
const formEditable = computed(() => editingCard.value !== null && canMaintain(editingCard.value))

function canMaintain(card: EntryRow): boolean {
  return card.status !== CONTROLLED_STATUS && String(card['焊工班组']) === session.crew
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '中组立分段登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '中组立焊接列表读取失败'
  }
  reloadCards()
}

function reloadCards() {
  paramCards.value = listParamCards().items
}

function openCard(card: EntryRow) {
  editingId.value = Number(card.id)
  // 表单预填既有取值：补数时只改要补的，没动的字段原样提交，不会丢值。
  const next: Record<string, string> = {}
  for (const field of CREW_FIELDS) {
    next[field] = String(card[field] ?? '')
  }
  form.value = next
  cardMessage.value = ''
}

function closeCard() {
  editingId.value = null
  cardMessage.value = ''
}

function saveCard() {
  if (editingId.value === null) {
    return
  }
  // 只提交班组可维护字段；共用胎架信息不进表单提交，服务层对只读字段仍会兜底拒绝。
  const result = saveParamCard(editingId.value, { ...form.value }, session.crew)
  cardMessageOk.value = result.ok
  cardMessage.value = result.message
  reloadCards()
}

function registerCard() {
  const result = createParamCard(session.crew)
  cardMessageOk.value = result.ok
  cardMessage.value = result.message
  reloadCards()
}

function controlCard(card: EntryRow) {
  const result = controlParamCard(Number(card.id), session.crew)
  cardMessageOk.value = result.ok
  cardMessage.value = result.message
  reloadCards()
}

onMounted(reload)
</script>
