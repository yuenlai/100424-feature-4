import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// —— 中组立焊接工艺参数卡：班组权限 + 受控保护 + 检测委托单同步 ——
const ASSEMBLY_MEDIUM_KEY = 'assembly_medium'
const NDT_KEY = 'ndt'

// 只有本焊工班组能维护的参数；别的班组只能查看。
export const WELDING_CARD_FIELDS = ['组立编号', '焊接方法', '焊材牌号', '预热温度', '焊后处理']
// 共用胎架信息对所有班组只读。
export const SHARED_JIG_FIELD = '共用胎架'
// 卡片脱离「待组立」即视为已受控：旧参数只许补空，不许改写。
const CARD_UNCONTROLLED_STATUS = '待组立'

export function isWeldingCardControlled(row: EntryRow): boolean {
  return String(row.status) !== CARD_UNCONTROLLED_STATUS
}

// 工艺结论：由参数卡上的焊接方法、焊材牌号、预热温度、焊后处理拼出，空白项跳过。
export function buildProcessConclusion(row: EntryRow): string {
  const parts = [
    String(row['焊接方法'] ?? '').trim(),
    String(row['焊材牌号'] ?? '').trim() ? `焊材${String(row['焊材牌号']).trim()}` : '',
    String(row['预热温度'] ?? '').trim() ? `预热${String(row['预热温度']).trim()}` : '',
    String(row['焊后处理'] ?? '').trim() ? `焊后${String(row['焊后处理']).trim()}` : '',
  ]
  return parts.filter(Boolean).join('｜')
}

// 保存工艺参数卡。team 为当前操作班组；越权、改胎架、改受控旧参数一律拒绝。
export function saveWeldingCard(
  id: number,
  patch: Record<string, string>,
  team: string,
): ActionResult {
  const rows = listRows(ASSEMBLY_MEDIUM_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的中组立分段` }
  }
  const current = rows[index]
  if (String(current['焊工班组']) !== team) {
    return {
      ok: false,
      message: `越权保存已拒绝：参数卡由「${current['焊工班组']}」维护，当前班组「${team}」只能查看`,
    }
  }
  if (
    SHARED_JIG_FIELD in patch &&
    String(patch[SHARED_JIG_FIELD] ?? '') !== String(current[SHARED_JIG_FIELD] ?? '')
  ) {
    return { ok: false, message: '共用胎架信息为只读，拒绝保存' }
  }
  if (isWeldingCardControlled(current)) {
    for (const field of WELDING_CARD_FIELDS) {
      if (!(field in patch)) continue
      const oldValue = String(current[field] ?? '').trim()
      if (oldValue !== '' && String(patch[field] ?? '') !== String(current[field] ?? '')) {
        return {
          ok: false,
          message: `已受控的旧参数不许被改写：「${field}」已有取值「${current[field]}」`,
        }
      }
    }
  }
  // 补数时保留既有取值：只合并提交上来的参数字段，其余字段原样保留。
  const updated: EntryRow = { ...current }
  for (const field of WELDING_CARD_FIELDS) {
    if (field in patch) {
      updated[field] = patch[field]
    }
  }
  const next = [...rows]
  next[index] = updated
  saveRows(ASSEMBLY_MEDIUM_KEY, next)
  const synced = syncInspectionOrders(updated, String(current['组立编号'] ?? ''))
  return {
    ok: true,
    message: synced > 0 ? `参数卡已保存，已同步 ${synced} 份检测委托单的工艺结论` : '参数卡已保存',
  }
}

// 把工艺结论同步到无损检测页的检测委托单；组立编号变更时一并改委托单的检测对象。
function syncInspectionOrders(row: EntryRow, previousNo: string): number {
  const assemblyNo = String(row['组立编号'] ?? '')
  const conclusion = buildProcessConclusion(row)
  const rows = listRows(NDT_KEY)
  let touched = 0
  const next = rows.map((item) => {
    const target = String(item['检测对象'] ?? '')
    if (target !== assemblyNo && (previousNo === '' || target !== previousNo)) {
      return item
    }
    touched += 1
    return { ...item, '检测对象': assemblyNo, '工艺结论': conclusion }
  })
  if (touched > 0) {
    saveRows(NDT_KEY, next)
  }
  return touched
}

// 「提交NDT」后在无损检测页生成/更新检测委托单，并带上最新工艺结论。
function upsertInspectionOrder(row: EntryRow): void {
  const assemblyNo = String(row['组立编号'] ?? '')
  if (assemblyNo === '') {
    return
  }
  const conclusion = buildProcessConclusion(row)
  const rows = listRows(NDT_KEY)
  const index = rows.findIndex((item) => String(item['检测对象'] ?? '') === assemblyNo)
  if (index >= 0) {
    const next = [...rows]
    next[index] = { ...rows[index], '工艺结论': conclusion }
    saveRows(NDT_KEY, next)
    return
  }
  const id = rows.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
  const order: EntryRow = {
    id,
    status: '待检测',
    pending: true,
    abnormal: false,
    '检测编号': `NDT-${String(id).padStart(4, '0')}`,
    '检测对象': assemblyNo,
    '检测方法': '',
    '检测部位': '',
    '检测人员': '',
    '检测日期': new Date().toISOString().slice(0, 10),
    '缺陷等级': '',
    '工艺结论': conclusion,
    '检测状态': '待检测',
  }
  saveRows(NDT_KEY, [...rows, order])
}

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  if (key === ASSEMBLY_MEDIUM_KEY && action === '提交NDT') {
    upsertInspectionOrder(updated)
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
