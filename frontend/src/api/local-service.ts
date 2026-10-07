import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import {
  CONTROLLED_STATUS,
  CREW_FIELDS,
  PARAM_CARD_ENTITY,
  PARAM_CARD_KEY,
  READONLY_FIELDS,
} from '@/data/param-card'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

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
  // 中组立「提交NDT」时联动检测委托单：找到该组立的参数卡，把工艺结论同步过去，没有委托单就开一张。
  if (key === 'assembly_medium' && action === '提交NDT') {
    const card = listRows(PARAM_CARD_KEY).find((item) => item['组立编号'] === updated['组立编号'])
    if (card) {
      ensureInspectionOrder(card)
    }
  }
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

// ---------- 中组立焊接工艺参数卡：权限与同步规则只在服务层强制，页面禁用控件只是体验 ----------

export function listParamCards(filters: Record<string, string> = {}): PageResult {
  return listEntries(PARAM_CARD_KEY, filters)
}

// 保存参数卡（补数走这里）：patch 里没带的字段保留既有取值；越权保存一律拒绝。
export function saveParamCard(id: number, patch: Record<string, string>, crew: string): ActionResult {
  const rows = listRows(PARAM_CARD_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${PARAM_CARD_ENTITY}` }
  }
  const current = rows[index]
  // 已受控的旧参数任何人不得改写，本班组也一样。
  if (current.status === CONTROLLED_STATUS) {
    return { ok: false, message: `${PARAM_CARD_ENTITY}已受控，旧参数不许改写，如需调整请走工艺变更` }
  }
  // 只有本焊工班组能维护，别的班组越权保存一律拒绝。
  if (String(current['焊工班组']) !== crew) {
    return {
      ok: false,
      message: `越权保存被拒绝：该${PARAM_CARD_ENTITY}归「${String(current['焊工班组'])}」维护，当前班组「${crew}」只能查看`,
    }
  }
  // 共用胎架信息只读，提交不一样的值就算越权。
  for (const field of READONLY_FIELDS) {
    if (field in patch && patch[field] !== String(current[field] ?? '')) {
      return { ok: false, message: `「${field}」为共用信息，只读，不允许在参数卡上改动` }
    }
  }
  // 只认班组可维护字段，其余键忽略；未提交的字段保留既有取值。
  const updated: EntryRow = { ...current }
  for (const field of CREW_FIELDS) {
    if (field in patch) {
      updated[field] = patch[field]
    }
  }
  const next = [...rows]
  next[index] = updated
  saveRows(PARAM_CARD_KEY, next)
  const synced = syncInspectionOrders(updated)
  const suffix = synced > 0 ? `，已同步 ${synced} 份检测委托单的工艺结论` : ''
  return { ok: true, message: `${PARAM_CARD_ENTITY}已保存${suffix}` }
}

// 登记新参数卡：归属当前班组，从草稿起步。
export function createParamCard(crew: string): ActionResult {
  const rows = listRows(PARAM_CARD_KEY)
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const card: EntryRow = {
    id,
    status: '草稿',
    pending: true,
    abnormal: false,
    组立编号: '',
    焊接方法: '',
    焊材牌号: '',
    预热温度: '',
    焊后处理: '',
    共用胎架信息: '',
    焊工班组: crew,
    工艺结论: '',
  }
  saveRows(PARAM_CARD_KEY, [...rows, card])
  return { ok: true, message: `${PARAM_CARD_ENTITY}已登记，归属「${crew}」，请补录工艺参数` }
}

// 受控：只有本班组能把本班组的卡置为已受控；受控后 saveParamCard 一律拒绝改写。
export function controlParamCard(id: number, crew: string): ActionResult {
  const rows = listRows(PARAM_CARD_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${PARAM_CARD_ENTITY}` }
  }
  const current = rows[index]
  if (current.status === CONTROLLED_STATUS) {
    return { ok: false, message: `${PARAM_CARD_ENTITY}已经是「${CONTROLLED_STATUS}」，不用重复操作` }
  }
  if (String(current['焊工班组']) !== crew) {
    return {
      ok: false,
      message: `越权操作被拒绝：只有「${String(current['焊工班组'])}」能受控本班组的${PARAM_CARD_ENTITY}`,
    }
  }
  const next = [...rows]
  next[index] = { ...current, status: CONTROLLED_STATUS, pending: false }
  saveRows(PARAM_CARD_KEY, next)
  return { ok: true, message: `${PARAM_CARD_ENTITY}已受控，旧参数锁定，任何人不得改写` }
}

// 把参数卡的工艺结论同步到检测委托单（无损检测页）：按来源卡ID匹配，只动结论与组立编号，其余保留。
function syncInspectionOrders(card: EntryRow): number {
  const rows = listRows('ndt')
  let synced = 0
  const next = rows.map((row) => {
    if (Number(row['来源卡ID']) !== Number(card.id)) {
      return row
    }
    synced += 1
    return { ...row, 检测对象: card['组立编号'], 工艺结论: card['工艺结论'] ?? '' }
  })
  if (synced > 0) {
    saveRows('ndt', next)
  }
  return synced
}

// 提交NDT时调用：已有委托单就刷新结论，没有就按参数卡开一张待检测的委托单。
function ensureInspectionOrder(card: EntryRow): void {
  const rows = listRows('ndt')
  const index = rows.findIndex((row) => Number(row['来源卡ID']) === Number(card.id))
  if (index >= 0) {
    const next = [...rows]
    next[index] = { ...rows[index], 检测对象: card['组立编号'], 工艺结论: card['工艺结论'] ?? '' }
    saveRows('ndt', next)
    return
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id)), 0) + 1
  const order: EntryRow = {
    id,
    status: '待检测',
    pending: true,
    abnormal: false,
    检测编号: `NDT-${String(id).padStart(4, '0')}`,
    检测对象: card['组立编号'],
    检测方法: '',
    检测部位: '',
    检测人员: '',
    检测日期: '',
    缺陷等级: '',
    检测状态: '',
    工艺结论: card['工艺结论'] ?? '',
    来源卡ID: card.id,
  }
  saveRows('ndt', [...rows, order])
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
