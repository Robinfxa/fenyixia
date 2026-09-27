# 《分一下 (fenyixia) 底座考古总设计书》

> **代码基线**: commit `36d5ae9` (`feat: add AI API with token auth — bills, summary, contacts, create, mark-paid`)  
> **源码坐标基准**: `/Users/robin/Desktop/fenyixia`  
> **对标参考体系**: `/Users/robin/Desktop/refact/docs/research/hermes-legacy-archaeology`  
> **成书时间**: 2026-09-26  

---

## 1. 阅读立场与核心使命

本文档是 **《分一下 (fenyixia)》全景工程底座** 的深度考古总设计书。它回答核心问题：在经历了从 React Native 原型、单文件原生 HTML 物理动效实验，到 Supabase 数据层接入、React 19 + TypeScript + Vite SPA 全面重构，再到微信级社交通讯录、AI 争议仲裁、负数折扣平摊、Token 计量与开放 AI API 的完整演进后——**这个项目到底沉淀了什么、哪些现成能力可直接复用、哪些必须警惕重构、哪些是假朋友（陷阱假设）**。

### 1.1 双重读者立场
- **面向决策者 / 架构师（人）**：
  - 看清系统 7 个演化时代的架构取舍（为什么从 RN 转向原生 HTML，又为什么从 HTML 转向 React 19）；
  - 掌握系统底层真实的数据一致性边界、安全漏洞与技术债务账本；
  - 避免把“前端有这个状态”误判为“数据库有事务保证”，避免在脆弱的基础上规划高并发或跨平台扩展。
- **面向后续开发 Agent（AI 智能体）**：
  - 提供**全仓库唯一代码行级事实入口**，所有断言均精确标注真实 `file:line`；
  - 明确公共 API 签名、参数契约、数学公式（如折扣平摊定理、轮播幂函数物理方程、安省 HST 13% 税则）；
  - 标明“不可二次造轮子”的已成型资产，以及“严禁依赖”的漂移或未落地接口。

---

## 2. 一句话系统画像与架构拓扑

《分一下》是一款**以移动端极致物理阻尼触感为特色、以细粒度商品项（Itemized）AA 分摊为核心、融合微信级社交网络与 Claude 视觉/文本智能的现代群组财务协作平台**。

### 2.1 整体架构拓扑全景图

```
┌────────────────────────────────────────────────────────────────────────┐
│                        前端交互层 (Client SPA)                          │
│   React 19 + TypeScript + Vite + Framer Motion + Web Audio API + SWR   │
├──────────────────┬───────────────────┬─────────────────────────────────┤
│   首页与卡片流   │    分账与明细     │         社交与通讯录            │
│  - 幂曲线物理轮播│  - 单项拖拽分配   │  - 微信式 A-Z 拼音首字母快跳    │
│  - 4 栏收支看板  │  - 负数折扣平摊   │  - 双向好友申请与无向图正规化   │
│  - 剪贴板快速粘贴│  - AI 争议仲裁    │  - 群组与私有标签               │
└─────────┬────────┴─────────┬─────────┴────────────────┬────────────────┘
          │ (REST / SWR)     │ (Supabase Client SDK)    │
          ▼                  ▼                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Supabase BaaS 核心中枢 (Postgres)                    │
│   - 行级安全策略 (RLS) + SECURITY DEFINER 解锁函数                     │
│   - 14 张核心业务表 (users, bills, bill_items, bill_item_members, etc) │
│   - 存储桶 (Storage Buckets): receipt-images (私有), payment-proofs    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   服务端无服务器集群 (Edge Functions)                  │
├─────────────────┬─────────────────┬──────────────────┬─────────────────┤
│  scan-receipt   │   send-email    │     bill-api     │    admin-ops    │
│  Claude 视觉与  │  Resend 邮件网关│  开放 Bearer API │  管理员控制台   │
│  一句话记账     │  好友邀请激活   │  AI Agent 外部调 │  MagicLink 伪装 │
└─────────────────┴─────────────────┴──────────────────┴─────────────────┘
```

---

## 3. 证据边界与事实优先级

1. **真实可执行源码 (`src/`, `supabase/`, `public/`) > SQL 迁移实录 (`supabase/migrations/`) > OpenSpec 活体规范 (`openspec/specs/`) > Git 提交历史 (`git log`) > 遗留归档代码 (`legacy/`)**。
2. 任何文档描述若与运行时代码冲突，以**运行时实际代码为准**（例如：文档曾提及的某些 RPC 函数在数据库迁移中未建立，已在第四章技术债务中确证为“虚幻接口”）。
3. 本书所有 `file:line` 均基于 commit `36d5ae9` 进行实测比对并验证有效。

---

## 4. 「底座现成提供 vs 必须重构/自建」总账本 (核心对照表)

| 领域维度 | fenyixia 现成能力 (直接复用) | 源码精准位置 | 裁定 | 缺陷、隐患与待重构债务 | 对应分册 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **卡片轮播物理学** | 幂曲线阻尼、惯性释放、弹性超调吸附 | [`BillCardCarousel.tsx:39-95`](file:///Users/robin/Desktop/fenyixia/src/components/BillCardCarousel/BillCardCarousel.tsx#L39-L95) | **直接复用** | 参数目前固化在 Context，尚未支持移动端震动触觉反馈 (Haptics) | [07](modules/07-ui-interaction-physics-and-sfx.md) |
| **音效回馈** | Web Audio API 整数越界触发音频播放 | [`legacy/app.js:146-171`](file:///Users/robin/Desktop/fenyixia/legacy/app.js#L146-L171) | **直接复用** | 现代 React 中音效逻辑需统一封装为独立 React Hook | [07](modules/07-ui-interaction-physics-and-sfx.md) |
| **商品拖拽分摊** | 跨容器逃逸浮动 Ghost、矩形碰撞命中 | [`BillSheet.tsx:162-252`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L162-L252) | **直接复用** | 手机小屏极端条目下存在 DOM 树过深重排开销 | [03](modules/03-split-engine-and-discount-spread.md) |
| **负数折扣平摊** | 按正数条目金额加权等比抵扣、美分守恒 | [`BillSheet.tsx:51-68`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/BillSheet.tsx#L51-L68) | **直接复用** | 仅在前端计算后剥离，后端缺少针对恶意篡改的再校验校验和 | [03](modules/03-split-engine-and-discount-spread.md) |
| **税则嵌入识别** | 安省 13% HST 单价内嵌，免税生鲜精准排除 | [`src/lib/api/scan.ts:94-117`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L94-L117) | **直接复用** | 规则仅硬编码在 Prompt 中，未作为独立税率引擎提取 | [06](modules/06-receipt-ocr-scanner-and-edge-functions.md) |
| **好友图谱存储** | 规范序无向图 `least/greatest` 杜绝重复 | [`friend_requests.sql:59-63`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/friend_requests.sql#L59-L63) | **直接复用** | 好友备注（`alias_a/b`）需在客户端多次 Join，未封装成物化视图 | [04](modules/04-contact-social-network-and-directory.md) |
| **拼音索引与检索** | 读时预计算 `_pinyinInitial` 与 `_pinyinSortKey` | [`src/lib/pinyin.ts:5-19`](file:///Users/robin/Desktop/fenyixia/src/lib/pinyin.ts#L5-L19) | **直接复用** | 多音字（如“单”、“重”）采用默认首选发音，未建立纠错词库 | [04](modules/04-contact-social-network-and-directory.md) |
| **AI 争议仲裁** | 自然语言提出异议，生成差分修正分配 | [`DisputeSheet.tsx:1-191`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/DisputeSheet.tsx#L1-L191) | **直接复用** | 争议一旦被接受，原分配直接被覆盖，缺少不可篡改的仲裁审计历史 | [05](modules/05-payment-reactions-and-dispute-arbitration.md) |
| **剪贴板极速凭证** | 详情页监听 `paste` 事件一键静默上传 | [`SplitDetail.tsx:98-110`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L98-L110) | **直接复用** | 缺乏图片压缩，大尺寸 PNG 直接入库造成流量消耗 | [05](modules/05-payment-reactions-and-dispute-arbitration.md) |
| **双轨结算状态机** | 垫付人全收齐 / 待收款；非垫付人待付 / 已付 | [`SplitDetail.tsx:213-250`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L213-L250) | **直接复用** | 垫付人手动结清通过物理删除记录表示，反直觉且无日志 | [05](modules/05-payment-reactions-and-dispute-arbitration.md) |
| **开放 AI API** | `fyx_<48-hex>` Bearer 认证，开放查账记账 | [`supabase/functions/bill-api/`](file:///Users/robin/Desktop/fenyixia/supabase/functions/bill-api/index.ts) | **扩展复用** | **完全缺失 Rate Limit 频率限制**；中文名模糊匹配好友在重名时存在静默错绑 | [06](modules/06-receipt-ocr-scanner-and-edge-functions.md) |
| **管理员伪装机制** | Magic Link 零口令瞬间切换目标用户 | [`admin-ops/index.ts:25-37`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts#L25-L37) | **受限复用** | 管理员邮箱硬编码在代码中；伪装后无退出模拟返回主号的机制 | [08](modules/08-auth-security-and-admin-system.md) |
| **数据库原子事务** | 客户端连环 HTTP 调用插入 bills/items/members | [`src/lib/api/bills.ts:105-212`](file:///Users/robin/Desktop/fenyixia/src/lib/api/bills.ts#L105-L212) | ❌ **必须彻底重构** | **高危**：中途断网导致孤儿账单或明细被全部清空，必须收敛为 Postgres RPC 事务 | [02](modules/02-database-schema-rls-and-migrations.md) |
| **凭证隐私权限** | `payment_proofs` 表 RLS 设定为 `USING (true)` | [`payment-and-reactions.sql:24`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/payment-and-reactions.sql#L24) | ❌ **必须紧急修复** | **高危**：任何登录用户均可查阅并遍历他人账单付款截图，必须收敛至同账单成员可见 | [02](modules/02-database-schema-rls-and-migrations.md) |
| **怒气持久化 RPC** | `useAngerStorm.ts` 调用不存在的 3 个 RPC | [`src/hooks/useAngerStorm.ts:8-26`](file:///Users/robin/Desktop/fenyixia/src/hooks/useAngerStorm.ts#L8-L26) | ❌ **必须补齐或清理** | 前后端接口严重脱节，目前客户端静默吞异常，服务器端从未落盘 | [02](modules/02-database-schema-rls-and-migrations.md) |
| **Schema 迁移实录** | `manual_payments` 表缺少正式迁移文件 | Commit `227f36a` 说明 | ❌ **必须补齐** | 严重破坏 CD/CI 自动化迁移环境的一致性，需固化入 `migrations/` | [02](modules/02-database-schema-rls-and-migrations.md) |

---

## 5. 系统全生命周期与数据流动图

系统的生命周期围绕一个账单从产生到核销的 6 大阶段展开：

```text
阶段 ①：捕获与录入 (Capture)
   [纸质小票照片 / 电子小票截图 / 文本一句话 / 手工创建]
          │
          ▼
   Edge Function: `scan-receipt` (Claude Sonnet 4.6 视觉识别)
   - 提取商品、单价、数量
   - 安省 13% HST 内嵌计算 (熟食饮料上浮 13%，基础蔬果免税)
   - 负数折扣项标记
          │
          ▼
阶段 ②：参与人装载与矩阵分配 (Assignment)
   打开 `MemberPickerSheet` / `BillSheet`
   - 按群组一键选中 / 按私有彩色标签批量选入 / A-Z 拼音好友搜索
   - 拖拽成员头像卡片抛入具体商品 (.bs-drag-ghost 逃逸定位)
   - 负数折扣一键开启“分摊到商品” (applyDiscountSpread 等比抵扣单价并剔除负数行)
          │
          ▼
阶段 ③：持久化落库 (Persistence)
   调用 `createBill()` / `updateBill()`
   - 写入 `bills` 主表
   - 写入 `bill_items` 明细表
   - 写入 `bill_item_members` 成员关联表
   (⚠️ 当前为客户端 3-5 步非原子写入，需警惕网络中断)
          │
          ▼
阶段 ④：审核、互动与异议仲裁 (Review & Dispute)
   - 成员查看卡片与明细，点击“😡 异议!”产生微浮动怒气
   - 若分配错误，发起人/参与人呼出 `DisputeSheet`
   - 描述质疑理由 → 调用 AI 生成修正建议 → 全员公开 Diff 高亮比对
   - 垫付人审核通过 → 自动重构商品与分配矩阵，结案
          │
          ▼
阶段 ⑤：核销与支付流转 (Settlement & Proof)
   - 非垫付人点击“💳 付款”：自动复制转账金额与邮箱
   - 非垫付人打开账单详情按 `Ctrl+V`：剪贴板截图静默直传 `payment-proofs` 存储桶
   - 垫付人在线核对转账凭证，或轻触成员行手动标记已付 (`manual_payments`)
   - 成员全部付清时，顶部高亮呈现 `✅ 已收齐，可标记结清` Banner
          │
          ▼
阶段 ⑥：数据沉淀与开放生态 (Analytics & Open API)
   - 结算数据进入 `useBillStats`：实时生成月度分类甜甜圈图与日级支出柱状图
   - 外部通过 `Authorization: Bearer fyx_...` 访问 `bill-api`：
     AI Agent 自动化拉取未付账单、生成财务月报、代扣记账
```

---

## 6. 技术债务红线与高危陷阱（开发 Agent 避坑指引）

在后续功能演进或重构中，**AI 开发 Agent 必须严格遵守以下红线，严禁盲目信任既有实现**：

### 陷阱 1：严禁在客户端直接扩展多表关联写操作
- **事实**：[`src/lib/api/bills.ts`](file:///Users/robin/Desktop/fenyixia/src/lib/api/bills.ts) 中的更新逻辑采用“先 DELETE 全部旧关联，再 INSERT 新关联”。
- **风险**：若第二次网络请求因移动端锁屏超时或弱网断开，该账单的所有商品或分摊人将被彻底抹除且不可逆。
- **指示**：新功能涉及复合实体写入时，必须编写 Postgres 存储过程，使用 `BEGIN ... COMMIT` 保障原子事务。

### 陷阱 2：严禁假设 `manual_payments` 和怒气 RPC 在新环境自动就绪
- **事实**：`manual_payments` 表在现有 `supabase/migrations/` 中**根本没有 DDL 文件**；`useAngerStorm.ts` 所调用的 3 个 RPC 函数在数据库中为 404 状态。
- **指示**：在新克隆的开发环境或生产部署前，必须优先补充缺失的迁移补丁。

### 陷阱 3：严禁在未做权限收敛前暴露 `payment_proofs`
- **事实**：`payment_proofs` 的 RLS 策略 `USING (true)` 允许全库广播。
- **风险**：转账截图中通常包含真实姓名、银行账户尾号、电子邮箱等高敏感隐私。
- **指示**：必须将其收敛为 `bill_id IN (SELECT get_my_bill_ids())`。

### 陷阱 4：严禁在公网裸奔开放 `bill-api` 与 `scan-receipt`
- **事实**：`bill-api` 虽有 Bearer Token，但无单 IP / 单 Token 速率限制；`scan-receipt` 完全未校验调用者 JWT。
- **指示**：任何知道 Edge Function 终端地址的人均可消耗该项目的 Claude 账户额度。必须追加 JWT 鉴权与 Upstash Redis / Postgres 计数器限流。

---

## 7. 分册目录与导读索引

本书配套的深入技术分册位于 [`modules/`](file:///Users/robin/Desktop/fenyixia/docs/research/fenyixia-legacy-archaeology/modules) 目录，附录位于 [`appendices/`](file:///Users/robin/Desktop/fenyixia/docs/research/fenyixia-legacy-archaeology/appendices) 目录：

- **[01-core-architecture-and-evolution.md](modules/01-core-architecture-and-evolution.md)**：7 大演进时代编年史、从原生 HTML 物理原型到 React 19 SPA 的架构重构全景。
- **[02-database-schema-rls-and-migrations.md](modules/02-database-schema-rls-and-migrations.md)**：14 张表完整 DDL、13 个迁移脚本逐行拆解、三大 RLS 递归死锁突破、事务与安全性债务深度剖析。
- **[03-split-engine-and-discount-spread.md](modules/03-split-engine-and-discount-spread.md)**：分账领域模型、负数折扣平摊加权算法与分钱守恒定理、拖拽碰撞分摊手柄、安省 13% HST 税则。
- **[04-contact-social-network-and-directory.md](modules/04-contact-social-network-and-directory.md)**：微信式通讯录架构、无向图好友双向申请与正规化存储、群组与彩色标签、拼音首字母读时预计算缓存。
- **[05-payment-reactions-and-dispute-arbitration.md](modules/05-payment-reactions-and-dispute-arbitration.md)**：双轨结算状态机、剪贴板极速图片凭证上传（Ctrl+V）、AI 争议仲裁流水线与全员 Diff 可视化、愤怒风暴。
- **[06-receipt-ocr-scanner-and-edge-functions.md](modules/06-receipt-ocr-scanner-and-edge-functions.md)**：4 大 Edge Function 深度解剖（`scan-receipt` 视觉模型切换、Prompt 工程词典、`send-email`、`bill-api` 开放接口、`admin-ops`）。
- **[07-ui-interaction-physics-and-sfx.md](modules/07-ui-interaction-physics-and-sfx.md)**：`BillCardCarousel` 三维阻尼幂曲线数学方程、惯性动量投影、Web Audio API 整数吸附音效、头像抖动与底部抽屉统一。
- **[08-auth-security-and-admin-system.md](modules/08-auth-security-and-admin-system.md)**：Supabase 认证与 6 位 PIN、Google OAuth 绑定、管理员控制台与 Magic Link 任意用户无口令伪装。
- **[09-state-caching-and-swr-data-flow.md](modules/09-state-caching-and-swr-data-flow.md)**：SWR 缓存拓扑、焦点感知重验策略、7 大核心自定义 Hooks 深度实现、乐观更新范式。
- **[capability-crosswalk.md](appendices/capability-crosswalk.md)**：全部 26 个 OpenSpec 活体规范 + 5 个最新变更与底层源码文件的全景对应矩阵。
