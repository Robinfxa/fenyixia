# 09 - 状态缓存架构、SWR 数据流与客户端响应式模型

本文档深入解析《分一下》的客户端状态管理中枢——基于 SWR（Stale-While-Revalidate）构建的无闪烁缓存管线、复合数据装配流、多键原子重验机制以及乐观更新范式。

---

## 1. SWR 缓存拓扑与全局策略配置

系统在 [`src/App.tsx:38-41`](file:///Users/robin/Desktop/fenyixia/src/App.tsx#L38-L41) 中声明了全局统一的 SWR 配置：
```tsx
<SWRConfig value={{
  revalidateOnFocus: true,
  dedupingInterval: 5000,
}}>
  {/* 子组件树 */}
</SWRConfig>
```

### 1.1 关键策略决策
1. **`revalidateOnFocus: true`（焦点感知重验）**：
   当用户在手机上切出应用去微信确认转账，再次切回《分一下》时，SWR 自动触发数据刷新，确保即时感知收款状态变更，无需手动下拉刷新。
2. **`dedupingInterval: 5000`（5秒高频请求去重）**：
   在单页面内存在多个组件同时依赖相同数据键（例如：导航栏、未读红点、主列表均消费 `'friends'` 或 `'bills'`）时，5秒内的重复网络请求被无情合并为单次查询，极大减轻了 Supabase 数据库的并发读取压力。

---

## 2. 核心自定义 Hooks 与复合数据装配管线

系统放弃了引入冗长复杂的 Redux 或 Zustand 集中式 Store，而是采用高度模块化、高内聚的 React 自定义 Hooks 来封装领域状态：

### 2.1 `useBills` 复合装配装配机 ([`src/hooks/useBills.ts:1-110`](file:///Users/robin/Desktop/fenyixia/src/hooks/useBills.ts#L1-L110))
账单数据绝非简单的单表查询，它由 4 层异步数据拼接而成：
1. **基础骨架**：调用 `fetchMyBills()` 拉取用户参与的所有账单主表及商品项；
2. **凭证与手动标记装载**：调用 `markBillsWithProofs(data, userId)`，并发拉取当前所有账单相关的 `payment_proofs`（付款截图）与 `manual_payments`（垫付人线下核销记录），在内存中为每个账单动态附加 `_hasMeProof`、`_proofUserIds`、`_manualPaidUserIds`；
3. **争议仲裁装载**：调用 `markBillsWithDisputes(data)`，并发拉取所有 `pending` 状态的仲裁记录并关联质疑人头像昵称，挂载 `_dispute` 字段。
4. **对外暴露**：返回标准化的响应式 `bills` 数组及全局刷新函数 `mutateBills()`。

### 2.2 `useFriends` 三路原子并发重验 ([`src/hooks/useFriends.ts:1-63`](file:///Users/robin/Desktop/fenyixia/src/hooks/useFriends.ts#L1-L63))
通讯录包含好友名单、收到的申请、发出的邀请三张网：
- `useFriends()` $\to$ 缓存键 `'friends'`
- `useReceivedRequests()` $\to$ 缓存键 `'received-requests'`
- `useSentRequests()` $\to$ 缓存键 `'sent-requests'`
- **并发刷新原子**：
  ```ts
  export function mutateAllFriendData() {
    return Promise.all([
      mutateFriends(),
      mutateReceivedRequests(),
      mutateSentRequests()
    ])
  }
  ```
  在用户执行“接受申请”、“发送好友邀请”或“删除好友”后，一键并行触发 3 组缓存失效并重验，杜绝了“红点消除了但好友名单未出现新朋友”的 UI 撕裂 Bug。

### 2.3 `useProfile` 谓词函数式批量失效 ([`src/hooks/useProfile.ts:34`](file:///Users/robin/Desktop/fenyixia/src/hooks/useProfile.ts#L34))
当当前用户在设置页修改个人昵称、更换 Emoji 头像或变更主题色时，会影响到系统中所有展示该用户的地方。
Hook 利用 SWR 的函数式 Key 匹配能力：
```ts
mutate(key => typeof key === 'string' && key.startsWith('profile:'))
```
一条指令即可将内存中所有形如 `profile:${userId}` 的局部缓存同时标记为陈旧，触发全站范围内的头像色彩秒级同步。

### 2.4 `useBillStats` 客户端内存级高性能多维聚合 ([`src/hooks/useBillStats.ts:1-149`](file:///Users/robin/Desktop/fenyixia/src/hooks/useBillStats.ts#L1-L149))
针对财务图表分析，系统未在服务端单独设计 OLAP 接口，而是借助 `useMemo` 在客户端执行纯内存计算：
- **日期补全算法**：根据所选月份动态计算 `daysInMonth`，自动构建 1 至 31 天的趋势数组 `trend: TrendPoint[]`，对没有消费记录的日期填补零值，避免 SVG 柱状图出现错位断档；
- **双向归集矩阵**：
  - 支出维度：统计当前用户作为垫付人的账单，扣减自己消费后的实际垫出金额（`total_amount - my_share`）；
  - 收入维度：统计他人作为垫付人、自己作为分摊人所承担的应还份额（`my_share`）。

---

## 3. 为什么选择 SWR 而非 Supabase Realtime WebSocket？

在很多开发者的直觉中，多端协作账单应当开启 Supabase Realtime（基于 Postgres Replication 逻辑复制日志的 WebSocket 长连接）。但在实际代码测绘中，作者清醒地全站采用了 SWR 轮询重验架构。

### 核心架构收益与权衡分析：
1. **移动端浏览器休眠对抗**：
   在 iOS Safari 或微信内置浏览器中，一旦手机息屏或切入后台，WebSocket 连接会在 3~10 秒内被操作系统强制挂起中断；切回应用时，WebSocket 往往产生无休止的“断线-重连-鉴权握手”震荡，引起严重的掉电与发热。
2. **SWR 焦点感知（Focus Revalidation）的完美契合**：
   分账并不是毫秒级对战游戏，用户产生数据交互的唯一时刻就是“点开应用看一眼”。SWR 在页面切入前台的瞬间触发轻量 HTTP HEAD/GET 去重查询，网络开销极小且极其稳定。
3. **乐观更新（Optimistic UI）抹平延迟**：
   在标记已付款、切换分组等操作中，各 Hook 均先行修改本地 SWR 缓存（如 `mutate(data, { revalidate: false })`），界面获得零延迟的原生 App 级响应体验。
