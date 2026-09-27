# Change Proposal: DuckDB 数据底座迁移与 OpenAI 5.6luna 接入 (弃用 Supabase)

## Why
当前系统深度依赖 Supabase（PostgreSQL、Supabase Auth、Storage、Edge Functions）。随着业务演进与自主可控需求：
1. 原 Supabase 方案存在客户端多步非原子事务风险、凭证隐私权限全网暴露等历史隐患；
2. 采用嵌入式分析型数据库 **DuckDB** 可提供极高的单机分析与分账账簿查询性能，且易于自托管与本地化备份；
3. 将管理员控制台权限移交给全新负责人 `robinfxa@gmail.com`；
4. 将小票识别与争议仲裁底层模型从 Anthropic Claude 3.5/Sonnet 4.6 切换为 **OpenAI 的 5.6luna 模型**（采用类似 Codex/ChatGPT 订阅会话授权机制的 OAuth 凭证免 Key 直连调用）。

## What Changes
- **后端架构重构**：新建轻量级 Node.js/TypeScript (基于 Hono) 后端服务，嵌入 DuckDB 引擎，提供完整的 RESTful API 替代原 Supabase Client 直接读写数据库的模式。
- **存储系统自建**：弃用 Supabase Storage，改用后端本地文件系统（`./uploads/receipts` 与 `./uploads/proofs`），通过静态路由服务静态资源。
- **认证系统平替**：弃用 Supabase Auth，由新后端实现基于 JWT 的用户会话管理，继续支持 6 位 PIN 与邮箱登录。
- **AI 引擎迁移**：弃用 Deno Edge Function `scan-receipt` 中的 Claude 调用，迁移至新后端通过 OpenAI OAuth 会话直连调用 **`5.6luna`** 模型，承载小票图像 OCR、结构化账单生成与争议仲裁。
- **管理员权限重置**：将管理员特权邮箱从 `yiming4144@gmail.com` 更改为 **`robinfxa@gmail.com`**。
- **前端数据层对接**：前端将 `@supabase/supabase-js` 客户端调用平稳迁移至对接自建 DuckDB REST API 的 `src/lib/api/`，保持 SWR 缓存与 UI 组件层零感知。

## Capabilities

### New Capabilities
- `duckdb-backend-service`: 基于 Hono + DuckDB 嵌入式数据库的后端服务体系，承载 14 张核心业务表与 ACID 原子事务，提供本地文件上传与静态访问。
- `openai-luna-vision`: 基于 OpenAI OAuth 凭证调用 `5.6luna` 模型的视觉多图 OCR 识别、安省税则解析与账单争议仲裁引擎。

### Modified Capabilities
- `supabase-service`: 弃用 Supabase 客户端直接连接模式，转为统一请求本地 DuckDB API 服务端。
- `auth-flow`: 弃用 Supabase Auth Session，改由本地后端签发安全 JWT 与 Cookie 进行身份鉴权。

## Impact
- **代码重构面**：
  - 弃用并移除 `supabase/` 目录与根目录所有 SQL 脚本；
  - 替换 `src/lib/supabase.ts` 为 `src/lib/apiClient.ts`；
  - 更新所有 `src/lib/api/*.ts`（bills, friends, payments, disputes, auth）；
  - 更新 `src/pages/AdminPage.tsx` 中的管理员邮箱校验为 `robinfxa@gmail.com`；
  - 新增服务端工程目录（如 `server/`）。
- **依赖变更**：
  - 前端移除 `@supabase/supabase-js`，增添或保持轻量请求库；
  - 后端引入 `@duckdb/node-api`（或 `duckdb`）、`hono`、`jose`（JWT）。
