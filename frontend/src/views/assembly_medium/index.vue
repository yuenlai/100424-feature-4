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
            <button class="link" type="button" @click="openCard(row)">参数卡</button>
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
      <span v-if="noticeMessage" class="notice-text">{{ noticeMessage }}</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <div v-if="editing" class="card-mask" @click.self="closeCard">
      <div class="card-dialog">
        <header class="card-head">
          <h3>工艺参数卡 · {{ editing['组立编号'] }}</h3>
          <span v-if="controlled" class="tag locked">已受控</span>
          <span v-else class="tag">未受控</span>
        </header>
        <p v-if="!isOwner" class="card-tip">
          本卡由「{{ editing['焊工班组'] }}」维护，当前班组「{{ store.welderTeam }}」只读查看。
        </p>
        <p v-else-if="controlled" class="card-tip">参数已受控：已有取值不可改写，仅可补录空白项。</p>
        <div class="card-grid">
          <label v-for="field in cardFields" :key="field" class="card-item">
            <span>{{ field }}</span>
            <input v-model="form[field]" :disabled="fieldDisabled(field)" />
          </label>
          <label class="card-item">
            <span>共用胎架（只读）</span>
            <input v-model="form[SHARED_JIG_FIELD]" disabled />
          </label>
          <label class="card-item">
            <span>焊工班组</span>
            <input :value="editing['焊工班组']" disabled />
          </label>
        </div>
        <p class="card-tip">工艺结论预览：{{ conclusionPreview || '—' }}</p>
        <footer class="card-foot">
          <button class="btn" type="button" @click="closeCard">关闭</button>
          <button v-if="isOwner" class="btn primary" type="button" @click="saveCard">保存参数卡</button>
        </footer>
        <p v-if="cardError" class="error-text">{{ cardError }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  SHARED_JIG_FIELD,
  WELDING_CARD_FIELDS,
  buildProcessConclusion,
  downloadEntries,
  isWeldingCardControlled,
  listEntries,
  moduleMeta,
  runAction as applyAction,
  saveWeldingCard,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('assembly_medium')
const columns = ["组立编号", "关联分段", "焊接方法", "焊材牌号", "预热温度", "焊工班组", "共用胎架", "焊后处理", "组立状态"]
const actions = ["开始组立", "完成焊接", "提交NDT"]
const statuses = ["待组立", "组立中", "焊接中", "已完工", "待NDT"]
const stats = [{"label": "待组立分段", "value": 0}, {"label": "组立中分段", "value": 0}, {"label": "待NDT分段", "value": 0}]

const store = useSessionStore()
const cardFields = WELDING_CARD_FIELDS

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const noticeMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const editing = ref<EntryRow | null>(null)
const form = ref<Record<string, string>>({})
const cardError = ref('')

const isOwner = computed(
  () => editing.value !== null && String(editing.value['焊工班组']) === store.welderTeam,
)
const controlled = computed(() => (editing.value ? isWeldingCardControlled(editing.value) : false))
const conclusionPreview = computed(() =>
  editing.value ? buildProcessConclusion({ ...editing.value, ...form.value }) : '',
)

function fieldDisabled(field: string): boolean {
  if (!isOwner.value) {
    return true
  }
  // 已受控的旧参数不许被改写：已有取值的字段锁死，空白项可补录。
  return controlled.value && String(editing.value?.[field] ?? '').trim() !== ''
}

function openCard(row: EntryRow) {
  editing.value = row
  cardError.value = ''
  const next: Record<string, string> = {}
  for (const field of [...cardFields, SHARED_JIG_FIELD]) {
    next[field] = String(row[field] ?? '')
  }
  form.value = next
}

function closeCard() {
  editing.value = null
  cardError.value = ''
}

function saveCard() {
  if (!editing.value) {
    return
  }
  cardError.value = ''
  const result = saveWeldingCard(Number(editing.value.id), { ...form.value }, store.welderTeam)
  if (!result.ok) {
    cardError.value = result.message
    return
  }
  noticeMessage.value = result.message
  closeCard()
  reload()
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
  noticeMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  noticeMessage.value = result.message
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
}

onMounted(reload)
</script>
