# 05 - 双轨结算状态机、支付凭证与 AI 争议仲裁系统

本文档深入解析《分一下》的结算业务流转闭环：垫付人与分摊人的双轨视角状态机、剪贴板极速凭证上传（Ctrl+V）、手动标记结清，以及基于 Claude 的账单争议公正仲裁引擎。

---

## 1. 双轨结算状态机 (Dual-Role Settlement Machine)

系统的账单结清判定由两个截然不同的视角共同驱动：

```text
               ┌───────────────────────────────┐
               │    当前账单详情 (SplitDetail)  │
               └──────────────┬────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       [我是垫付人 (isPayer)]        [我是参与人 (Non-payer)]
               │                             │
       检查全体非垫付人是否已付        检查当前用户是否已付
               │                             │
    ┌──────────┴──────────┐       ┌──────────┴──────────┐
    ▼                     ▼       ▼                     ▼
[未收齐 (collect)]    [全收齐]  [待付款 (pay)]     [已付款 (paid)]
  - 呈现待收款条        - 呈现绿色  - 呈现付款条       - 呈现已上传凭证/
  - 金额: pendingTotal    收齐条   - 点击展开复制面板    垫付人已确认条
```

### 1.1 核心状态判定逻辑 ([`src/components/SplitDetail/SplitDetail.tsx:213-250`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L213-L250))
1. **全体收齐判定 (`allCollected`)**：
   ```ts
   const allCollected = nonPayerMembers.every(m =>
     proofUserIds.has(m.id) || manualPaid.has(m.id)
   )
   ```
   只有当账单中所有非垫付成员，均在已上传凭证集合（`proofUserIds`）或垫付人手动确认名单（`manualPaid`）中时，`allCollected` 方为 `true`。
2. **剩余待收总额 (`pendingTotal`)**：
   ```ts
   const pendingTotal = bill.items.reduce((sum, item) => {
     const unpaidInItem = (item.members || []).filter(
       m => m.id !== bill.payer_id && !proofUserIds.has(m.id) && !manualPaid.has(m.id)
     )
     const sharePerPerson = (item.price * (item.qty || 1)) / (item.members?.length || 1)
     return sum + sharePerPerson * unpaidInItem.length
   }, 0)
   ```
   仅统计尚未付款成员承担的金额份额，使得垫付人一眼获知实际未回笼资金。
3. **Banner 四阶展示类名**：
   - 垫付人全收齐：`bannerClass = 'paid'`, 文案为 `✅ 已收齐，可标记结清`。
   - 垫付人待收款：`bannerClass = 'collect'`, 文案为 `💰 你是垫付人，待收款 CA$ {pendingTotal}`。
   - 分摊人待付款：`bannerClass = 'pay'`, 文案为 `📤 你需要付款 CA$ {my_share}`，轻触触发支付抽屉 `showPaySheet`。
   - 分摊人已付款：`bannerClass = 'paid'`, 文案为 `✓ 你已上传付款凭证` 或 `✓ 垫付人已标记你为已付款`。

---

## 2. 支付凭证极速上传与剪贴板监听 (Ctrl+V)

### 2.1 极简交互设计
为了消灭手机或电脑端“截图 $\to$ 保存相册 $\to$ 打开网页 $\to$ 点击上传 $\to$ 选择文件 $\to$ 确认提交”的冗长步骤，系统在详情页实现了全局剪贴板监听（[`src/components/SplitDetail/SplitDetail.tsx:98-110`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L98-L110)）：

```ts
useEffect(() => {
  const onPaste = (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    const blob = imageItem.getAsFile()
    if (blob) {
      e.preventDefault()
      doUploadBlob(blob) // 静默直传
    }
  }
  document.addEventListener('paste', onPaste)
  return () => document.removeEventListener('paste', onPaste)
}, [bill?.id, user?.id])
```
用户在网银 App 截图后，只需在电脑微信中复制或手机剪贴板常驻，切入《分一下》账单详情页按下 `Ctrl+V`（或长按粘贴），凭证即可通过异步管道直传 Supabase Storage Bucket `payment-proofs`，并在数据库 `payment_proofs` 表插表记录，实现毫秒级核销反馈。

### 2.2 垫付人一键轻触标记结清 (`manual_payments`)
对于通过现金、微信红包等线下方式结清的小额款项，垫付人可直接在成员列表中点击对应人员头像行，触发 `toggleManualPayment` ([`src/lib/api/payments.ts:51-77`](file:///Users/robin/Desktop/fenyixia/src/lib/api/payments.ts#L51-L77))。
- 逻辑：查询 `manual_payments` 表中是否存在 `(bill_id, user_id, marked_by)` 记录；若存在则物理删除（取消已付），不存在则执行插入（标记已付）。
- *(注：该表由于历史遗留原因尚未包含在 migrations 迁移脚本中，见第 02 分册)*。

---

## 3. AI 账单争议仲裁与全员透明审阅系统 (`bill-disputes`)

当参与人发现分摊错误（例如：某不喝酒的成员被误分了高昂酒水费用）时，系统提供了由 Claude 大模型担任数字仲裁官的争议解决流水线：

### 3.1 争议流转数据模型
- 源码对应：[`supabase/migrations/bill-disputes.sql`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/bill-disputes.sql)
- 核心字段：
  - `bill_id uuid`（关联账单）
  - `challenger_id uuid`（提出异议的成员）
  - `reason text`（自然语言异议理由）
  - `suggested_items jsonb`（AI 生成的新条目与分摊人映射数组）
  - `status text`（`'pending' | 'accepted' | 'rejected'`）
- 权限保护：
  - [`bill-disputes-update-rls.sql`](file:///Users/robin/Desktop/fenyixia/supabase/migrations/bill-disputes-update-rls.sql) 允许质疑人在 pending 状态下修改建议；
  - 只有垫付人具备最终仲裁批准权（UPDATE status 权限）。

### 3.2 AI 仲裁 Prompt 铁律工程
在 [`src/lib/api/scan.ts:219-251`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L219-L251) 的 `buildDisputePrompt` 中，对大模型施加了极其严厉的数学与业务守门约束：
1. **只能重新分配人员，绝不可修改商品名称、价格和数量**；
2. **每个商品项必须至少保留 1 名分摊人**，杜绝出现零人承担的死账；
3. 输出严格的 JSON 结构，并附带针对争议理由的仲裁解释（`explanation`）。

### 3.3 全员 Diff 可视化与实时方案微调
在详情页中（[`SplitDetail.tsx:280-343`](file:///Users/robin/Desktop/fenyixia/src/components/SplitDetail/SplitDetail.tsx#L280-L343)），争议方案不再是黑盒，而是向全账单成员透明公开：
- **被移出人员**：以删除线和浅红背景呈现（`.dispute-diff-chip.removed`）；
- **新加入人员**：以高亮边框和绿色背景呈现（`.dispute-diff-chip.added`）；
- **质疑人二次编辑**：质疑人可直接在界面上点击 Diff Chip 切换成员，实时将微调后的方案同步写回 `bill_disputes.suggested_items`。

### 3.4 仲裁决策生效落地
垫付人点击“接受建议”后（[`src/lib/api/disputes.ts:64-92`](file:///Users/robin/Desktop/fenyixia/src/lib/api/disputes.ts#L64-L92) `resolveDispute`）：
系统将 `bill_disputes.status` 标记为 `accepted`，并调用内部 API 自动将建议的 `suggested_items` 覆写至真实 `bill_items` 与 `bill_item_members`，账单解除裁决中状态，完成全自动化纠错。

---

## 4. 愤怒风暴情感化交互机制考古 (`useAngerStorm.ts`)

- 源码对应：[`src/hooks/useAngerStorm.ts:1-134`](file:///Users/robin/Desktop/fenyixia/src/hooks/useAngerStorm.ts#L1-L134)
- **三阶交互剧情**：
  1. **单击飘散（Float）**：在详情页点击“😡 异议!”，在按钮上方动态创建 `.anger-float` 节点，执行向上浮动并淡出。
  2. **三连击警告（Combo）**：同一账单 2 秒内连续点击 3 次，屏幕弹出红色横幅警报：`😡😡😡 您的怒气已经传递给发起此账单的人！`。
  3. **怒气风暴雨（The Storm）**：发起人在登录或打开应用时，若检测到未读怒气反馈，屏幕底部将以 150ms 间隔随机发射多达 20 枚旋转升空的巨型 `😡` 表情，伴随黑色通报卡片通报抗议者姓名与次数。
- *(⚠️ 缺陷备忘：前端所依赖的 3 个存储过程未在服务端 DDL 中实现，见第 02 分册)*。
