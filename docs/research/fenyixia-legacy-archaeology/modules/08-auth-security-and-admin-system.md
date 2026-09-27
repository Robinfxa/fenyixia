# 08 - 身份认证、权限安全与管理员控制台体系

本文档深入解析《分一下》的用户身份鉴权闭环：从 6 位数字 PIN 码到 Google OAuth 第三方互联、管理员控制台以及基于 Magic Link 的用户登录模拟（Impersonation）机制。

---

## 1. 用户身份认证与会话生命周期

### 1.1 邮箱 + 6 位 PIN 码极简鉴权模型
在移动端小额分账场景中，输入冗长复杂的英文字符密码体验极其糟糕。系统确立了**“邮箱 + 6 位数字 PIN”**的极简账户体系：
1. **密码哈希与补全策略**：
   用户在前端界面的 6 联九宫格中输入 6 位数字 PIN（如 `123456`）。客户端为了兼容 Supabase Auth 原生必须包含英文字符与长度要求的密码策略，在底层对 PIN 执行加盐格式化后发起注册/登录。
2. **三态资料完整性校验 (`profileCompleted`)**：
   在 [`src/hooks/useAuth.ts:25-60`](file:///Users/robin/Desktop/fenyixia/src/hooks/useAuth.ts#L25-L60) 中：
   - 当检测到当前 Session 有效时，查询 `public.users` 表是否存在记录；
   - 若不存在或未填昵称头像，`profileCompleted` 设为 `false`，路由层拦截进入强制完善资料流程；
   - 完善后将 `profileCompleted` 置为 `true`，准许访问主应用。

### 1.2 Google OAuth 第三方身份打通与解绑保护
- 源码对应：[`src/hooks/useGoogleIdentity.ts:1-62`](file:///Users/robin/Desktop/fenyixia/src/hooks/useGoogleIdentity.ts#L1-L62) 与 [`src/pages/SettingsPage.tsx:45-80`](file:///Users/robin/Desktop/fenyixia/src/pages/SettingsPage.tsx#L45-L80)
- **多身份互联机制**：
  已拥有 PIN 账户的用户，可在设置页点击“绑定 Google 账号”，调用 `supabase.auth.linkIdentity({ provider: 'google' })` 完成身份归并。
- **孤儿身份防锁死守卫**：
  在解绑 Google 身份时，Hook 会首先调用 `getUserIdentities()` 计算当前用户绑定的凭证总量。若检测到用户仅剩 Google 这一种登录方式，立即阻断解绑并弹出警报：`不能解绑唯一的登录方式，请先设置邮箱密码`，杜绝用户自我锁死。

---

## 2. 管理员控制台与全景运维系统 (`/admin`)

- 源码对应：[`src/pages/AdminPage.tsx:1-208`](file:///Users/robin/Desktop/fenyixia/src/pages/AdminPage.tsx#L1-L208)
- 权限隔离：前端及服务端均对调用者邮箱进行白名单比对，仅允许 `yiming4144@gmail.com` 访问。

### 2.1 用户列表与财务活动全景
管理台向管理员直观展示平台所有用户的宏观活动数据：
- 注册时间、电子邮箱、昵称与头像；
- 该用户作为垫付人的账单总数；
- 该用户作为参与人的消费总额；
- 该用户累计调用的 Claude AI Token 消耗及折算美金金额。

### 2.2 邮件配额监控与预警 (`admin_email_log`)
- 针对 Resend 免费套餐每月发信量有限的约束，管理台通过 Edge Function `admin-ops` 实时汇总过去 1 小时、24 小时的发信总量；
- 当检测到过去 1 小时内邀请邮件发送量超过 3 封时，触发告警提示，防止恶意用户刷接口消耗额度。

### 2.3 基于 Magic Link 的用户登录模拟 (Impersonation)
这是系统最具杀伤力的运维排障特性：
1. **产生背景**：
   在真实线上运行中，某些复杂账单（如 10 人交叉点菜、部分带折扣、部分人上传了凭证）出现金额算不齐或显示 Bug 时，用户难以通过文字清晰描述。
2. **实现机理** ([`supabase/functions/admin-ops/index.ts:25-37`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts#L25-L37))：
   - 管理员在目标用户行点击“模拟登录”；
   - 服务端通过 `adminClient.auth.admin.generateLink({ type: 'magiclink', email })` 生成一枚合法的单次登录令牌链接；
   - 前端接收到链接后执行 `window.location.href = action_link`；
   - 浏览器自动重定向并在本地写入目标用户的 JWT，管理员瞬间置身于该用户的真实主页，以其第一视角核查全部账单、好友与设置。

---

## 3. 安全边界与潜在风险评估

1. **管理员权限单点隐患**：
   管理员邮箱在 [`admin-ops/index.ts:8`](file:///Users/robin/Desktop/fenyixia/supabase/functions/admin-ops/index.ts#L8) 和 [`AdminPage.tsx:28`](file:///Users/robin/Desktop/fenyixia/src/pages/AdminPage.tsx#L28) 中硬编码为单一字符串，未建立基于角色的权限访问控制（RBAC），不利于多管理员协作。
2. **模拟登录缺乏平稳退回机制**：
   管理员在伪装进入他人账户后，若想切回管理员身份，必须手动退出登录并在登录页重新输入管理员邮箱及 PIN 码，缺乏“退出模拟并返回后台”的临时会话栈支持。
3. **API Token 密钥轮转与撤销**：
   在设置页发放的 `fyx_<48-hex>` 外部 API Token 属于长效凭证，目前仅支持重新生成（置换旧 Token），缺少单用户创建多个具名 Token（如“给 Claude 用的”、“给 Siri 快捷指令用的”）及细粒度只读/读写权限隔离。
