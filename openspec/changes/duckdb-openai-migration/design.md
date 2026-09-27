# Design: DuckDB 架构重构与 OpenAI 5.6luna 接入

## Context
当前应用依赖 Supabase（PostgreSQL、Supabase Auth、Storage、Edge Functions）。通过考古发现，现有系统存在客户端多步非原子写（可能导致孤儿账单）、凭证全库可见、Edge Functions 缺失 JWT 鉴权等问题。本次改造全面将数据与服务端中枢收敛为基于 Node.js/TypeScript + DuckDB 的自包含服务，并将 AI 模型迁移至 OpenAI `5.6luna`（OAuth 凭证认证），管理员变更为 `robinfxa@gmail.com`。

## Goals / Non-Goals

**Goals:**
- **服务端独立自主**：构建自包含的 `server/` 微服务，基于 Hono + DuckDB 承载数据存储与业务 API。
- **原子事务保障**：账单创建与更新在 DuckDB 中通过单一事务执行，杜绝数据半提交。
- **存储本地化**：小票与付款截图落入本地 `./uploads` 目录并通过静态路由提供安全访问。
- **OpenAI 5.6luna 深度整合**：使用 OAuth 会话凭据直连调用 `5.6luna`，接管小票多图 OCR、安省税则嵌入与争议仲裁。
- **权限安全重置**：将全站管理员权限收敛至 `robinfxa@gmail.com`。
- **前端零感平替**：前端各页面与 SWR Hooks 保持原有数据形状，仅替换底层 `apiClient`。

**Non-Goals:**
- 不重写前端交互逻辑、不改动 `BillCardCarousel` 物理模型与 Web Audio 音效系统。
- 不引入分布式高可用集群（以轻便单体自托管为首要目标）。

## Decisions

### 1. 后端技术选型：Hono + `@duckdb/node-api`
- **选择**：采用 Hono 作为轻量 Web 框架，搭配 DuckDB 官方 Node.js 驱动。
- **原因**：Hono 拥有极高的执行性能、现代 Web 标准 Request/Response 抽象、内置 CORS/静态文件托管与 JWT 中间件，与 TypeScript 完美契合。
- **替代方案考虑**：
  - *Express*：生态成熟但缺乏现代 TypeScript 原生支持，中间件架构较旧；
  - *Fastify*：性能强劲但对于轻量单体微服务配置略显繁冗。

### 2. DuckDB 写入并发控制：串行写队列 (Write Mutex)
- **选择**：为 DuckDB 的写入操作（INSERT/UPDATE/DELETE）设置轻量级 async mutex 队列。
- **原因**：DuckDB 属于进程内分析型数据库，多线程只读并发极快，但只允许单一写事务（Single Writer）。通过在 Node.js 服务端将写事务排队，可以彻底避免 `database is locked` 异常。

### 3. 本地文件存储与静态文件服务器
- **选择**：文件保存在 `./uploads/proofs/` 与 `./uploads/receipts/`，生成 UUID 或哈希文件名，由 Hono 暴露 `/uploads/*` 静态路径。
- **原因**：单机部署最简，杜绝外部云存储凭证配置复杂度与网络延迟。

### 4. OpenAI 5.6luna 模型调用协议
- **选择**：支持携带 OpenAI OAuth 授权会话 Bearer 令牌调用 `https://api.openai.com/v1/chat/completions`。
- **模型格式适配**：
  - 多图拼接：转为 OpenAI 多模态格式 `[{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }]`。
  - Prompt 与安省 HST 规则继承现有 `src/lib/api/scan.ts` 的成熟调优成果。

### 5. 管理员控制台与权限收敛
- **选择**：更新 `src/pages/AdminPage.tsx` 与服务端的管理员校验为 `robinfxa@gmail.com`。

## Risks / Trade-offs

- **[DuckDB OLTP 并发压力]** → 缓解措施：AA 分账属于低频协同记账场景（非每秒上千笔交易），DuckDB 单进程串行写完全足以轻松支撑数百并发用户；查询则可充分利用 DuckDB 极速的列式与向量化计算能力。
- **[DuckDB 文件损坏风险]** → 缓解措施：启动时自动开启 WAL（Write-Ahead Logging），并支持定时快照备份。
- **[OpenAI OAuth 令牌过期]** → 缓解措施：服务端设计自动刷新机制或支持标准 Bearer Header 传递。

## Migration Plan

1. **第一阶段 (Server 脚手架)**：在项目根目录新建 `server/`，搭建 Hono + DuckDB 初始结构，迁移 14 张表 Schema。
2. **第二阶段 (核心接口与存储)**：实现 Bills、Users、Friends、Uploads 核心 API，完成本地静态文件服务。
3. **第三阶段 (AI 引擎迁移)**：实现对接 OpenAI `5.6luna` 的小票 OCR 与争议仲裁端点。
4. **第四阶段 (前端对接与 Supabase 剥离)**：重写 `src/lib/api/` 对接新后端，更新 Admin 页面为 `robinfxa@gmail.com`，移除 Supabase 客户端依赖。
5. **第五阶段 (端到端验证)**：验证全流程（记账、分摊、上传凭证、OCR 扫描、管理台），确保零回归。
