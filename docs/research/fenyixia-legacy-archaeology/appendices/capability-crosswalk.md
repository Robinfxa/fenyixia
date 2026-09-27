# 附录：全景能力与 OpenSpec 规范映射对照表 (Capability Crosswalk)

本文档将《分一下》全部 26 个活体领域规范（`openspec/specs/`）以及 5 个最新变更（`openspec/changes/`）与底层代码资产、数据库表、Edge Functions 进行一一映射，作为开发 Agent 在代码库中按图索骥的唯一交叉索引。

---

## 1. 26 个核心 OpenSpec 规范全景映射矩阵

| 规范名称 (Spec Name) | 核心领域能力与需求目标 | 涉及数据表 / 存储 | 核心前端组件与 Hooks | 服务端接口 / 工具 | 关键源码行数坐标 (file:line) | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`anger-storm`** | 详情页异议点击飘起表情，3连击全屏怒气广播 | `bill_reactions` | `useAngerStorm.ts` | RPC (待补齐) | [`src/hooks/useAngerStorm.ts:8-134`](file:///Users/robin/Desktop/fenyixia/src/hooks/useAngerStorm.ts#L8-L134) | 现成 (RPC虚报) |
| **`auth-flow`** | 邮箱+PIN/Google登录，注册后强制完善Profile | `users` | `LoginPage.tsx`, `useAuth.ts` | Supabase Auth | [`src/pages/LoginPage.tsx:1-406`](file:///Users/robin/Desktop/fenyixia/src/pages/LoginPage.tsx#L1-L406) | 生产就绪 |
| **`bill-carousel`** | 3D幂曲线物理阻尼轮播，惯性动量与超调吸附 | - | `BillCardCarousel.tsx` | - | [`BillCardCarousel.tsx:39-95`](file:///Users/robin/Desktop/fenyixia/src/components/BillCardCarousel/BillCardCarousel.tsx#L39-L95) | 核心资产 |
| **`bill-member-picker`** | 3模块选人抽屉（群聊/标签批量选入，A-Z点选） | `groups`, `user_tags` | `MemberPickerSheet.tsx` | `friends.ts` | [`MemberPickerSheet.tsx:66-89`](file:///Users/robin/Desktop/fenyixia/src/components/MemberPicker/MemberPickerSheet.tsx#L66-L89) | 生产就绪 |
| **`bill-sort-order`** | 首页账单按 `created_at` 严格降序排列 | `bills` | `useBills.ts` | `bills.ts` | [`src/lib/api/bills.ts:25`](file:///Users/robin/Desktop/fenyixia/src/lib/api/bills.ts#L25) | 生产就绪 |
| **`category-classification`** | 根据账单 Emoji 自动映射餐饮/交通等 8 大财务分类 | `bills.icon` | `useBillStats.ts` | `constants.ts` | [`src/lib/constants.ts:2-37`](file:///Users/robin/Desktop/fenyixia/src/lib/constants.ts#L2-L37) | 生产就绪 |
| **`contact-directory-ui`** | 微信级通讯录界面，右侧 A-Z 滑动快跳导航条 | `friendships` | `ContactsPage.tsx` | `pinyin.ts` | [`src/pages/ContactsPage.tsx:1-435`](file:///Users/robin/Desktop/fenyixia/src/pages/ContactsPage.tsx#L1-L435) | 生产就绪 |
| **`contact-groups`** | 群聊实体，支持成员展示并对外暴露用于分账 | `groups`, `group_members`| `GroupsPage.tsx`, `useGroups.ts` | `groups.ts` | [`src/pages/GroupsPage.tsx:1-280`](file:///Users/robin/Desktop/fenyixia/src/pages/GroupsPage.tsx#L1-L280) | 生产就绪 |
| **`contact-requests`** | 邮箱精准搜索，发起双向申请，自动接受交叉互申 | `friend_requests` | `NewFriendsPage.tsx` | `RPC accept_friend_req`| [`friend_requests.sql:59-63`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/friend_requests.sql#L59-L63) | 生产就绪 |
| **`contact-tags`** | 用户私有彩色标签管理，好友多标签分类 | `user_tags`, `friend_tags`| `TagsPage.tsx`, `useTags.ts` | `tags.ts` | [`src/pages/TagsPage.tsx:1-249`](file:///Users/robin/Desktop/fenyixia/src/pages/TagsPage.tsx#L1-L249) | 生产就绪 |
| **`debug-console`** | 悬浮可拖拽参数面板，实时滑块调节物理与动效曲线 | `DebugContext` | `DebugConsole.tsx` | - | [`src/components/Debug/DebugConsole.tsx`](file:///Users/robin/Desktop/fenyixia/src/components/Debug/DebugConsole.tsx) | 开发者工具 |
| **`dynamic-carousel-config`**| 轮播动效参数动态 Context 注入与阴影纸张纹理开关 | `DebugContext` | `BillCardCarousel.tsx` | - | [`src/contexts/DebugContext.tsx:1-85`](file:///Users/robin/Desktop/fenyixia/src/contexts/DebugContext.tsx#L1-L85) | 生产就绪 |
| **`email-service`** | 对接 Resend API 发送邮件邀请与系统提醒 | `admin_email_log` | - | Edge: `send-email` | [`send-email/index.ts:25-45`](file:///Users/robin/Desktop/fenyixia/supabase/functions/send-email/index.ts#L25-L45) | 生产就绪 |
| **`email-verification`** | 邮箱有效性验证，未验证用户限制核心功能访问 | `users` | `LoginPage.tsx` | Supabase Auth | [`src/pages/LoginPage.tsx:180-220`](file:///Users/robin/Desktop/fenyixia/src/pages/LoginPage.tsx#L180-L220) | 生产就绪 |
| **`fps-counter`** | 实时 30 帧滑动窗口 FPS 性能监控仪表盘 | - | `useFps.ts`, `DebugConsole` | - | [`src/hooks/useFps.ts:1-58`](file:///Users/robin/Desktop/fenyixia/src/hooks/useFps.ts#L1-L58) | 开发者工具 |
| **`friend-invitation`** | 邀请未注册好友生成 32 字节 Hex 令牌邮件，建号自绑定 | `invitations` | `ContactsPage.tsx` | `send-email` | [`invitations.sql:2-9`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/invitations.sql#L2-L9) | 生产就绪 |
| **`google-oauth`** | Google OAuth 一键授权，设置页多身份绑定/解绑 | `auth.identities` | `useGoogleIdentity.ts` | Supabase Auth | [`src/hooks/useGoogleIdentity.ts:1-62`](file:///Users/robin/Desktop/fenyixia/src/hooks/useGoogleIdentity.ts#L1-L62) | 生产就绪 |
| **`payment-copy`** | 点击付款按钮自动复制转账金额并弹出 e-Transfer 提示 | - | `SplitDetail.tsx` | Clipboard API | [`SplitDetail.tsx:135-138`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L135-L138) | 生产就绪 |
| **`pinyin-caching`** | 读时预计算 `_pinyinInitial` 与 `_pinyinSortKey`，消灭列表卡顿 | - | `ContactsPage.tsx` | `pinyin.ts` | [`src/lib/pinyin.ts:5-19`](file:///Users/robin/Desktop/fenyixia/src/lib/pinyin.ts#L5-L19) | 核心资产 |
| **`react-app-shell`** | 仿 iOS TabBar 外壳，中央悬浮大加号按钮与安全边距 | - | `BottomNav.tsx`, `Header.tsx`| - | [`BottomNav.tsx:1-51`](file:///Users/robin/Desktop/fenyixia/src/components/Layout/BottomNav.tsx#L1-L51) | 生产就绪 |
| **`slide-sfx`** | 卡片滑过整数卡槽边界瞬间触发 Web Audio API 音响 | `assets/sfx/` | `legacy/app.js` | Web Audio API | [`legacy/app.js:146-171`](file:///Users/robin/Desktop/fenyixia/legacy/app.js#L146-L171) | 核心资产 |
| **`split-detail`** | 细粒度明细拆解，双轨结清状态机与凭证审核 | `bills`, `bill_items` | `SplitDetail.tsx` | `bills.ts` | [`SplitDetail.tsx:213-250`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L213-L250) | 核心资产 |
| **`statistics-dashboard`**| 财务多维收支图表聚合，SVG 环形甜甜圈与日级柱状图 | `bills`, `bill_items` | `StatsPage.tsx`, `useBillStats`| - | [`src/pages/StatsPage.tsx:1-151`](file:///Users/robin/Desktop/fenyixia/src/pages/StatsPage.tsx#L1-L151) | 生产就绪 |
| **`stats-placeholder`** | 统计未上线时提供占位与 Toast 友好引导 | - | `BottomNav.tsx` | - | (已由正式看板覆盖) | 已演化闭环 |
| **`supabase-service`** | 强类型 Supabase 客户端封装，替代早期 `window.DB` | - | `src/lib/supabase.ts` | `@supabase/js` | [`src/lib/supabase.ts:1-18`](file:///Users/robin/Desktop/fenyixia/src/lib/supabase.ts#L1-L18) | 生产就绪 |
| **`swr-data-cache`** | 全站 SWR 缓存拓扑，Stale-While-Revalidate 秒开无闪烁 | - | `App.tsx` SWRConfig | SWR | [`src/App.tsx:38-41`](file:///Users/robin/Desktop/fenyixia/src/App.tsx#L38-L41) | 核心资产 |

---

## 2. 最新 5 大 OpenSpec 变更详尽交付矩阵 (`openspec/changes/`)

| 变更标识 (Change Slug) | 驱动业务目标 | 引入的核心文件与表 | 解决的关键痛点与设计决断 | 代码坐标 (file:line) |
|---|---|---|---|---|
| **`admin-panel`** | 平台运维审计与疑难问题现场排查 | `AdminPage.tsx`, Edge: `admin-ops`, `admin_email_log` | 解决线上复杂分摊用户难以自证的难题；引入 Magic Link 单次令牌实现管理员对任意问题用户的瞬间视角伪装 (Impersonation) | [`admin-ops/index.ts:25-37`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts#L25-L37) |
| **`bill-dispute-arbitration`** | 错误分摊争议仲裁化与全自动化纠错 | `bill_disputes`, `DisputeSheet.tsx` | 解决饭局账单算错引发口角的难题；利用 Claude 作为中立裁判，自动生成仅重排成员、不改菜品单价的合理化建议方案 | [`bill-disputes.sql:2-50`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/bill-disputes.sql#L2-L50) |
| **`bottom-sheet-unification`** | 底栏抽屉组件技术债务大扫除与规范化 | `BottomSheet.tsx` | 解决散落在 BillSheet、DisputeSheet 等处 4 套重复手写的 Framer Motion 抽屉动画代码；统一把手外观、iOS 减速贝塞尔与底部安全区 | [`BottomSheet.tsx:1-58`](file:///Users/robin/Desktop/fenyixia/src/components/shared/BottomSheet.tsx#L1-L58) |
| **`discount-spread`** | 负数满减折扣按比例科学平摊与美分守恒 | `BillSheet.tsx` `applyDiscountSpread` | 解决外卖红包或超市抵扣券导致负数行难以分摊的难题；按正数商品金额权重等比折算，剔除负数项，保障数学总额严格守恒 | [`BillSheet.tsx:51-68`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L51-L68) |
| **`dispute-suggestion-preview`**| 争议修正案向全员透明公开与实时协同 | `SplitDetail.tsx` Diff Chips | 解决仲裁方案黑盒不可见的难题；以红色删除、绿色新增直观展示修改差异，并允许质疑人在前端交互中直接微调方案 | [`SplitDetail.tsx:280-343`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L280-L343) |
