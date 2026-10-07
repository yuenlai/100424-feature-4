// 中组立焊接「工艺参数卡」的字段权限与状态定义：页面和服务层共用这一份，规则只在这里写一遍。
export const PARAM_CARD_KEY = 'weld_param_card'
export const PARAM_CARD_ENTITY = '焊接工艺参数卡'

// 只有本焊工班组能维护的字段，别的班组一律只读；工艺结论随参数卡同步到检测委托单。
export const CREW_FIELDS = ['组立编号', '焊接方法', '焊材牌号', '预热温度', '焊后处理', '工艺结论']

// 共用胎架信息对所有角色只读，任何人提交改动都算越权。
export const READONLY_FIELDS = ['共用胎架信息']

// 列表与表单的展示顺序：班组维护字段在前，只读与归属信息在后。
export const PARAM_CARD_COLUMNS = [
  '组立编号',
  '焊接方法',
  '焊材牌号',
  '预热温度',
  '焊后处理',
  '共用胎架信息',
  '焊工班组',
  '工艺结论',
]

// 参数卡状态：草稿可维护；受控后旧参数任何人不得改写。
export const PARAM_CARD_STATUSES = ['草稿', '已受控']
export const CONTROLLED_STATUS = '已受控'
