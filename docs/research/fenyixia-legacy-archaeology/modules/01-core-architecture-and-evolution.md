# 01 - 核心架构与 7 大演进时代编年史

本文档深度梳理《分一下 (fenyixia)》从第一个 Git 提交到现行最新版本所经历的 7 个完整技术时代、架构重构分水岭以及被丢弃/封存的实验性功能考古。

---

## 1. 7 大演化时代里程碑编年史

基于对代码库全量提交记录（根提交 `e4ddf3e` 至最新提交 `36d5ae9`）的深度代码考古，系统的架构演化可严格划分为以下 7 个关键时期：

### 时代 1：React Native 原型与物理动效实验（2026-02-22 ~ 2026-02-27）
- **核心命题**：探索移动端卡片层叠与物理阻尼手感。
- **标志性 Commits**：
  - `e4ddf3e` (2026-02-22) `init:fenyixia project`：最初工程采用 React Native + Expo 脚手架（包含 `HomeScreen.js`、`CarouselCards.js`、`BillCard.js`）。
  - `6462f6a` (2026-02-22) `change into html`：**重大战略转向**。因 React Native 在快速调试物理阻尼和复杂贝塞尔缓动曲线时构建开销大，作者决断将整个工程推平重构为单一 HTML 文件。
  - `ab44a00` (2026-02-26) `add power curve easing for card carousel`：放弃线性插值，引入指数幂曲线（Power Curve Easing）模拟现实纸牌在手中的散开阻尼。
  - `c45845d` (2026-02-27) `add inertia momentum on drag release before snap`：引入基于触控释放瞬间速度（Velocity）的物理动量投影算法，并开发浮动调试控制台（Debug Panel）。
  - `8bbeec5` (2026-02-27) `embed 3 built-in swipe sound effects as base64`：将 3 款滑动音效以 base64 嵌入源码，实现卡片跨越整数边界时的 Web Audio API 硬件级触发。
  - `66e8f79` & `695a06f` (2026-02-27)：实验“活页夹/图钉”月度账单聚类与爆炸飞出动效。

### 时代 2：Supabase 数据持久层接入与 OCR 原型（2026-03-02 ~ 2026-03-06）
- **核心命题**：告别纯前端本地 Mock 数据，确立云端多租户数据库与小票智能识别。
- **标志性 Commits**：
  - `1c31f1e` & `02dae2c` (2026-03-02)：引入 Supabase BaaS，设计首版核心关系模型（`users`, `friendships`, `bills`, `bill_items`, `bill_item_members`）。
  - `a94ecf5` (2026-03-02) `feat: add receipt scan saving to Supabase + Edge Function for Claude API`：上线首个服务端无服务器函数 `scan-receipt`，通过 Claude API 识别纸质小票结构化文本。
  - `2c2a939` (2026-03-03) `feat: add bill detail view and Ontario HST tax rules`：在分摊规则中确立加拿大安大略省 13% HST 单价内嵌税则，杜绝单独列出税行导致无人认领的难题。
  - `159c958` (2026-03-03) `feat: add payment proof upload, protest/anger system, and bill editing`：引入转账截图凭证存储与“😡 怒气”轻互动反馈体系。
  - `877c68e` & `ca33c23` (2026-03-05)：设计四象限财务概览看板（已收回、待收回、已还款、待还款），并在结算中精确剔除已上传凭证金额。

### 时代 3：React 19 SPA 全面重写与组件现代化（2026-03-07 ~ 2026-03-16）
- **核心命题**：告别 1.1 万行单文件巨石原型，拥抱现代工程化。
- **标志性 Commits**：
  - `5a6eba2` (2026-03-07) `feat: SPA feature completion - routes, settings, friends, create bill, month view`：**架构分水岭**。彻底弃用单文件 HTML 原型，全面迁移为基于 React 19 + TypeScript + Vite + Framer Motion 的现代单页应用。
  - `b391ffe` (2026-03-08) `feat: dual-axis view mode - data filter × display mode`：建立双轴视图矩阵（数据过滤：全部/我的待付；展现模式：卡片轮播/平铺列表）。
  - `bd8742b` (2026-03-08) `feat: global Toast notification system`：封装全局轻量交互吐司。
  - `4c91c2e` (2026-03-14) `feat: add statistics dashboard with charts and category classification`：上线基于 SVG 的环形甜甜圈图与日级柱状图财务分析看板。
  - `f225276` (2026-03-14) `feat: add Google OAuth login and identity linking/unlinking`：打通 Supabase Google 身份绑定与解绑机制。
  - `eaaab48` (2026-03-16) `chore: archive legacy code and unused components out of project root`：将所有早期原型代码封装归档进 `legacy/` 目录。

### 时代 4：微信式社交图谱与 SWR 缓存重构（2026-03-16 ~ 2026-03-18）
- **核心命题**：将粗糙的好友列表升级为媲美微信通讯录的高性能社交网络。
- **标志性 Commits**：
  - `bb1df85` (2026-03-14) `feat: email invite service + registration verification`：打通 Resend 邮件服务与未注册好友邀请码闭环。
  - `08eb81a` (2026-03-17) `feat: implement friend request system with email search`：引入 Postgres RPC 存储过程，落地规范序（Canonical Ordering）双向好友申请机制。
  - `9ac67e4` (2026-03-17) `feat: implement WeChat-style contacts with A-Z index, groups, and tags`：落地通讯录 A-Z 索引快跳、群聊管理与私有彩色标签。
  - `4478f26` (2026-03-17) `feat(contacts): cache pinyin initial and sort keys to eliminate render lag`：通过在数据拉取层预计算 `_pinyinInitial` 与 `_pinyinSortKey`，彻底消除百人通讯录滑动掉帧。
  - `bf0c36b` & `9294bb5` (2026-03-17) `feat: migrate all data fetching to SWR for instant cached rendering`：全面拥抱 SWR 缓存，实现页面切换零延迟秒开。
  - `bc25a8b` (2026-03-18) `feat(bills): add 3-module member picker (groups/tags/friends A-Z) to bill creation flow`：上线分账选人器。

### 时代 5：争议仲裁、折扣平摊与底栏弹窗统一（2026-03-21 ~ 2026-03-28）
- **核心命题**：解决复杂分摊痛点与 UI 容器重复构建。
- **标志性 Commits**：
  - `cab82a6` (2026-03-22) `feat: add bill dispute & AI arbitration system`：推出由大模型介入的公正分摊裁决引擎。
  - `558208b` (2026-03-22) `refactor: unify all bottom sheets into shared BottomSheet component`：抽离底层组件 `BottomSheet.tsx`，将全站 4 套重复的底栏抽屉手势动画统一。
  - `c110239` (2026-03-28) `feat: show dispute suggestion to all members, allow challenger to edit`：实现争议建议全员透明公开与实时 Diff 比对。
  - `855cb20` (2026-03-28) `feat: spread discount items proportionally across positive bill items`：攻克负数满减折扣平摊算法，保障分钱总额严格守恒。
  - `8beddfd` (2026-03-28) `fix: resolve group_members RLS recursion preventing non-owners from seeing members`：利用 `SECURITY DEFINER` 破解 RLS 无限递归死锁。
  - `a6452bd` (2026-03-28) `feat: add admin panel with user list, impersonation, and email tracking`：上线管理后台，支持 Magic Link 登录模拟。

### 时代 6：全收齐流转、多图扫描与财务体验收口（2026-04-01 ~ 2026-05-18）
- **核心命题**：闭环支付全状态流转与高频操作极速化。
- **标志性 Commits**：
  - `152ba88` (2026-04-01) `fix: show 已收齐 banner when all non-payer members have paid`：补齐所有人完成支付时的自动提示闭环。
  - `96e4864` & `7f6300f` (2026-04-18 ~ 2026-04-20)：OCR 支持长小票多图分段合并上传。
  - `051bda5` & `34800e1` (2026-04-20)：垫付人卡片与 Banner 实时呈现待收差额（`pendingTotal`）与未付人数。
  - `d0bf419` (2026-05-18) `feat: add 待收回 filter mode — see bills pending collection`：首页过滤轮转扩展为三态（全部 $\to$ 待付 $\to$ 待收回）。
  - `35e12c0` (2026-05-18) `feat: paste clipboard image as payment proof (Ctrl+V)`：支持剪贴板图片全局粘贴极速完成支付上传。
  - `b360104`, `5c36d9f`, `1caf80c`, `92bc0dd` (2026-05-18)：手工标记付款（`manual_payments`）与看板各模块精确对齐。

### 时代 7：Token 经济学监控与开放 AI API（2026-04-20 & 2026-06-16）
- **核心命题**：商业化成本追踪与平台开放能力。
- **标志性 Commits**：
  - `fe2f5ec` (2026-04-20) `feat: track AI token usage per user with admin stats`：在 `token_usage` 表记录每次调用 Claude 的 Input/Output Tokens 及模型版本。
  - `1f9477a` (2026-04-20) `fix: use claude-sonnet-4-6 for scanning, update cost rates`：升级默认 OCR 模型为最新 Sonnet 4.6，校准成本计费单价。
  - `36d5ae9` (2026-06-16) `feat: add AI API with token auth — bills, summary, contacts, create, mark-paid`：
    - 新增 `api_tokens` 表，发放 `fyx_<48位hex>` 个人长效 Bearer Token。
    - 新建 Edge Function `bill-api`，对外开放 RESTful 接口，正式使系统成为可被外部 AI Agent 调用的开放财务中枢。

---

## 2. 现代架构拓扑 (`src/`)

### 2.1 构建与类型环境
- 核心配置文件：
  - [`package.json`](file:///Users/robin/Desktop/fenyixia/package.json)：明确声明 ES Module 规范 (`"type": "module"`)。
  - [`vite.config.ts`](file:///Users/robin/Desktop/fenyixia/vite.config.ts)：配置 `@` 路径别名与 GitHub Pages 部署路径基准 `/fenyixia/`。
  - [`tsconfig.app.json`](file:///Users/robin/Desktop/fenyixia/tsconfig.app.json)：启用严格类型校验与 `noUncheckedIndexedAccess`。

### 2.2 路由与页面映射表
全站共 12 个页面组件（[`src/pages/`](file:///Users/robin/Desktop/fenyixia/src/pages/)），由 [`src/App.tsx:21-134`](file:///Users/robin/Desktop/fenyixia/src/App.tsx#L21-L134) 统一挂载：

| 路由路径 | 页面组件 | 鉴权要求 | 业务职责 |
|---|---|---|---|
| `/login` | `LoginPage` | 公开 | 邮箱/PIN、Google OAuth、新用户资料完善引导 |
| `/` | `HomePage` | 受保护 | 账单流卡片轮播/平铺、收支总览卡、状态筛选 |
| `/contacts` | `ContactsPage` | 受保护 | 微信式 A-Z 拼音联系人主目录、搜索加好友 |
| `/contacts/new` | `NewFriendsPage` | 受保护 | 好友申请流转中心（收到的申请/发出的邀请） |
| `/contacts/groups` | `GroupsPage` | 受保护 | 群聊列表展示与新建群组抽屉 |
| `/contacts/tags` | `TagsPage` | 受保护 | 好友分类彩色标签管理与成员打标 |
| `/stats` | `StatsPage` | 受保护 | 财务多维数据看板（支出/收入对比、分类占比） |
| `/scan` | `ScanPage` | 受保护 | 纸质/电子小票多图上传、透视矫正与智能提取 |
| `/quick-bill` | `QuickBillPage` | 受保护 | 自然语言一句话大模型快捷录单 |
| `/settings` | `SettingsPage` | 受保护 | 个人中心、Google 账号绑定、开放 AI API Token |
| `/admin` | `AdminPage` | 管理员白名单 | 平台用户总览、邮件配额监控、Magic Link 账号伪装 |
| `/friends` | 重定向 | - | 永久重定向至 `/contacts`（向前兼容） |

---

## 3. 被丢弃/封存的实验性功能考古发掘

在从 `legacy/` 原生单文件原型向现代 SPA 迁移的过程中，有数项极其前卫但也极具复杂性的实验性功能被暂时封存或简化：

### 3.1 月份图钉堆叠夹 (Month Pile Mode)
- **源码出处**：[`legacy/aa-split-v4.html:61-65`](file:///Users/robin/Desktop/fenyixia/legacy/aa-split-v4.html#L61-L65)、[`legacy/app.js:842-920`](file:///Users/robin/Desktop/fenyixia/legacy/app.js#L842-L920)
- **机制原理**：
  在原生原型中，顶部存在一枚“图钉按钮” (`📌`)。点击后，所有账单按月份聚拢收缩为具有真实厚度感的纸堆卡片（`.month-pile`）。每个月份堆自身拥有一套平行的轮播物理方程；点击某一月份，纸张以粒子爆炸方式散开呈现当月细单。
- **封存原因**：交互层级过深，不符合快速核对近期账单的高频心智，在 SPA 重构时被简化为全局统计页 (`StatsPage`) 与平铺列表模式 (`BillListView`)。

### 3.2 循环无限穿越轮播 (Modulo Cycle Wrap)
- **源码出处**：[`legacy/app.js:223-233`](file:///Users/robin/Desktop/fenyixia/legacy/app.js#L223-L233)
- **机制原理**：
  通过模运算 `wrapN(v) = ((v % N) + N) % N`，卡片首尾相连，向左滑动到头会自动穿越回末尾。
- **弃用原因**：财务账单具备极强的时间递减属性（最新账单在最前）。无限循环破坏了时间线起点与终点的心理锚点，因此在现代版本中被改造为有限边界的物理弹性阻尼吸附。
