# 船舶分段建造管理系统

面向船体分段下料加工、小组立装配、中组立焊接、大合拢搭载与涂装报验全流程的船舶分段建造管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 分段台账 | `block` | 船体分段 | 分段编号、分段名称、所属区域 |
| 钢板下料 | `cutting` | 下料任务 | 下料编号、关联分段、板厚规格 |
| 小组立装配 | `assembly_small` | 小组立构件 | 构件编号、关联分段、构件类型 |
| 中组立焊接 | `assembly_medium` | 中组立分段 | 组立编号、关联分段、焊接方法 |
| 无损检测 | `ndt` | 无损检测 | 检测编号、检测对象、检测方法 |
| 大合拢搭载 | `erection` | 搭载记录 | 搭载编号、搭载分段、搭载位置 |
| 焊材追溯 | `welding_trace` | 焊材批次 | 批次编号、焊材类型、焊材牌号 |
| 涂装预处理 | `blasting` | 预处理记录 | 预处理编号、处理对象、除锈等级 |
| 油漆涂装 | `painting` | 涂装记录 | 涂装编号、涂装对象、油漆类型 |
| 舾装作业 | `outfitting` | 舾装任务 | 舾装编号、关联分段、舾装类型 |
| 精度测量 | `dimension` | 精度测量 | 测量编号、测量对象、测量项目 |
| 管路预制 | `pipe_prefab` | 管路管段 | 管段编号、系统类别、管材规格 |
| 电缆敷设 | `cable_pull` | 电缆敷设 | 敷设编号、电缆型号、起点设备 |
| 下水准备 | `launch_prep` | 下水准备 | 准备编号、下水方式、滑道检查 |
| 质量报验 | `quality` | 质量报验 | 报验编号、报验对象、报验项目 |
| 建造计划 | `schedule` | 建造节点 | 节点编号、节点名称、计划开始 |
| 钢材管理 | `material` | 钢材批次 | 批次编号、钢材牌号、规格尺寸 |
| 脚手架搭设 | `scaffold` | 脚手架 | 脚手编号、搭设区域、搭设高度 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 中组立焊接页挂了「焊接工艺参数卡」：组立编号、焊接方法、焊材牌号、预热温度、焊后处理只有本焊工班组
  能维护（顶栏可切换班组体验），别的班组只读；共用胎架信息对所有人只读；已受控的旧参数任何人不得改写。
  越权保存由 `local-service.ts` 里的 `saveParamCard` 一律拒绝；补数走增量合并，未提交的字段保留既有取值；
  保存后工艺结论自动同步到无损检测页的检测委托单，「提交NDT」时没有委托单会自动开单并带上结论。
  字段权限定义集中在 `frontend/src/data/param-card.ts`。
- 想回到初始数据：清掉浏览器里 `ship-block-construction:entries` 这一项，或调用 `resetModule(模块)`。
