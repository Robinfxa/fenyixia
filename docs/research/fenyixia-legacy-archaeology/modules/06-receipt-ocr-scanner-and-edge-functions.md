# 06 - 小票智能识别引擎与服务端 Edge Functions 集群

本文档深入解析《分一下》的 4 大无服务器 Edge Functions 接口集群，重点剖析基于 Claude Sonnet 4.6 深度视觉的小票识别管道、Resend 邮件网关、开放 AI 助手 API 以及管理员后台运维接口。

---

## 1. Edge Functions 集群拓扑概览

系统在 Supabase 平台部署了 4 个 Deno 运行时的 TypeScript 无服务器函数：

| 函数名称 | 源码入口路径 | 鉴权策略 | 依赖模型 / 外部服务 | 核心职责 |
|---|---|---|---|---|
| **`scan-receipt`** | [`supabase/functions/scan-receipt/index.ts`](file:///Users/robin/Desktop/fenyixia/supabase/functions/scan-receipt/index.ts) | `--no-verify-jwt` (公网可调) | Anthropic Claude (`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`) | 视觉 OCR 结构化解析、长小票多图处理、一句话记账、争议方案生成 |
| **`send-email`** | [`supabase/functions/send-email/index.ts`](file:///Users/robin/Desktop/fenyixia/supabase/functions/send-email/index.ts) | `--no-verify-jwt` | Resend REST API (`https://api.resend.com/emails`) | 好友离线邀请邮件发送、系统级通知、邮件发送审计落盘 |
| **`bill-api`** | [`supabase/functions/bill-api/index.ts`](file:///Users/robin/Desktop/fenyixia/supabase/functions/bill-api/index.ts) | 自定义 Bearer Token (`fyx_<48-hex>`) | 无 (直连 Postgres) | 开放 RESTful API，供外部 AI Agent 自动化读取账单、查询汇总与代记账 |
| **`admin-ops`** | [`supabase/functions/admin-ops/index.ts`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts) | 校验调用者 JWT (邮箱白名单) | Supabase Admin SDK (`service_role`) | 平台注册用户列表、邮件发送配额排查、Magic Link 任意用户无密码登录伪装 |

---

## 2. 小票识别引擎核心解剖 (`scan-receipt`)

### 2.1 动态双模型路由与长图拼接
在 [`supabase/functions/scan-receipt/index.ts:68`](file:///Users/robin/Desktop/fenyixia/supabase/functions/scan-receipt/index.ts#L68) 中，服务端根据入参图片数量自动执行模型档位降级与路由：
```ts
const model = imageList.length > 0 ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001"
```
- **有图模式（图片数组 > 0）**：自动分配最新的旗舰视觉大模型 `claude-sonnet-4-6`，支持在 Messages API 的 `content` 数组中按次序平铺传入多张 base64 图片（支持超长小票分为上中下多段拍摄并合并解析）。
- **无图模式（纯文本）**：自动降级为高响应速度、低成本的 `claude-haiku-4-5-20251001`，专门处理“一句话生成账单”或“争议仲裁文本推导”。

### 2.2 北美超市双语缩写词典与 Prompt 工程
在小票 OCR 识别中，超市打印机通常采用严重截断的大写英文字符，极难辨识。
在 [`src/lib/api/scan.ts:63-125`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L63-L125) 中，系统精心内嵌了 16 组针对加拿大主流超市（No Frills, Loblaws, Food Basics, T&T 大统华）的高频缩写翻译词典：
- `NN` $\to$ No Name 品牌；`PC` $\to$ President's Choice 品牌；
- `CH` $\to$ Chicken（鸡肉）；`BF` $\to$ Beef（牛肉）；`PK` $\to$ Pork（猪肉）；
- `GV` $\to$ Great Value 品牌；`KD` $\to$ Kraft Dinner 芝士通心粉；
- `HOMO MK` $\to$ Whole Milk（全脂牛奶）；`2% MK` $\to$ 2% Milk（低脂牛奶）；
- `BNLS/SKNLS` $\to$ Boneless/Skinless（去骨去皮）。

结合安大略省 13% HST 单价内嵌税则（生鲜蔬果免税，熟食饮料自动乘以 1.13 并标注 `(含税)`），保障了从混乱模糊的小票扫描件中提取出清晰、优雅且已含税的中文商品明细项。

### 2.3 容错解析与 Token 消耗记账
- **Markdown 剥离解析** ([`src/lib/api/scan.ts:53-57`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L53-L57))：
  通过 `str.indexOf('{')` 与 `str.lastIndexOf('}')` 截取最外层大括号，强行滤除 Claude 偶尔输出的 ````json``` 代码块包裹符或前置问候语。
- **Token 消耗记账**：
  Edge Function 解析完毕后返回 Anthropic 的原生 `usage` 计数（`input_tokens` 与 `output_tokens`）。客户端在 [`src/lib/api/scan.ts:14-24`](file:///Users/robin/Desktop/fenyixia/src/lib/api/scan.ts#L14-L24) 中以 Best-effort 方式异步插表写入 `token_usage`，用于管理员后台监控用户调用成本。

---

## 3. 邮件网关与审计机制 (`send-email`)

- **发信实现** ([`supabase/functions/send-email/index.ts:25-45`](file:///Users/robin/Desktop/fenyixia/supabase/functions/send-email/index.ts#L25-L45))：
  通过 `fetch('https://api.resend.com/emails')` 调用 Resend 接口，发信地址固定为 `分一下 <noreply@fenyixia.com>`。
- **配额审计与日志记录**：
  在发信后，服务端利用不受 RLS 限制的 `service_role` 客户端在 `admin_email_log` 表插入审计记录：
  `{ recipient: email, template: 'invite', status: 'sent', resend_id: res.id }`
  用于管理后台监控每小时发信频次，防止耗尽 Resend 免费额度。

---

## 4. 开放 AI API 引擎 (`bill-api`)

在 Commit `36d5ae9` 中上线，使得《分一下》成为具备开放生态接口的财务中枢：

### 4.1 长效 Bearer Token 认证机制
- 客户端在“设置页”中生成 48 位十六进制令牌（格式为 `fyx_<48-hex>`），经哈希后存储在 `api_tokens` 表中。
- 外部调用者通过请求头携带：`Authorization: Bearer fyx_abc123...`。
- Edge Function 调用 `resolveToken(token)` 校验并查询绑定的 `user_id`，并异步更新 `last_used_at` 记录活跃时间。

### 4.2 开放 RESTful 接口矩阵 ([`supabase/functions/bill-api/index.ts:59-110`](file:///Users/robin/Desktop/fenyixia/supabase/functions/bill-api/index.ts#L59-L110))
1. **`GET /contacts`**：返回当前用户的完整好友列表（ID、姓名、Emoji、头像色彩）。
2. **`GET /bills`**：返回当前用户相关的所有账单列表，自动聚合当前用户的应付/应收份额（`my_share`）与结清状态。
3. **`GET /summary`**：直接返回四大核心财务指标（已收回、待收回、已还款、待还款），供 AI Agent 快速生成月度财务摘要。
4. **`POST /bills`**：
   - 允许外部 Agent 提交结构化商品明细直接创建账单。
   - **智能好友模糊匹配**：请求体中可以只传递好友姓名（如 `"Alice"`），后端自动比对该用户的好友库，解析转换为真实 UUID 写入关联表。
5. **`POST /bills/:id/mark-paid`**：通过 API 远程为某成员标记已线下结清。

*(⚠️ 缺陷警示：该接口目前完全未做 Rate Limit 限流，且模糊匹配同名好友时存在静默串号风险，详见第 02 分册)*。

---

## 5. 管理员控制台与账号伪装机制 (`admin-ops`)

### 5.1 权限与邮箱白名单
- 源码对应：[`supabase/functions/admin-ops/index.ts:8, 40`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts#L8)
- 校验逻辑：调用者必须携带有效的 Supabase Auth JWT，且解析出的邮箱必须完全匹配硬编码的管理员白名单：
  `ADMIN_EMAIL = "yiming4144@gmail.com"`。

### 5.2 Magic Link 账号瞬间伪装 (Impersonation)
为了让管理员在排查线上复杂分摊 Bug 或数据异常时能够**“以受影响用户的视角亲身查看界面”**，系统构建了免密伪装通道：
1. 管理员在 `/admin` 页面点击目标用户的“模拟登录 (Impersonate)”按钮；
2. Edge Function 调用 Supabase Admin API 签发单次 Magic Link：
   ```ts
   const { data, error } = await adminClient.auth.admin.generateLink({
     type: 'magiclink',
     email: targetUserEmail,
   })
   ```
3. 前端获取到该免密链接后，直接执行 `window.location.href = data.properties.action_link`。浏览器跳转并在 Supabase 完成验证后，当前本地会话瞬间置换为目标用户的有效 Session，管理员即可完全接管并以该用户身份无障碍操作整个应用！
