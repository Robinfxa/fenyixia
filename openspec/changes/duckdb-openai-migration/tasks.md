# Tasks: DuckDB 数据底座迁移与 OpenAI 5.6luna 接入

## 1. 服务端脚手架与 DuckDB 引擎搭建

- [x] 1.1 创建 `server/` 独立服务端工程目录，配置 Hono、`@duckdb/node-api` 与 TypeScript 编译环境，验证基础 HTTP 服务可正常监听并响应
- [x] 1.2 编写 DuckDB Schema 初始化脚本，迁移 14 张核心业务表（`users`, `bills`, `bill_items`, `bill_item_members`, `friendships`, `groups`, `user_tags`, `payment_proofs` 等）及关联索引，并运行测试脚本验证建表与查询成功
- [x] 1.3 实现本地文件上传管道与静态路由服务，支持将小票与付款凭证写入 `./uploads/` 目录，验证静态资源可通过 HTTP 访问

## 2. 身份认证与核心业务 API 移植

- [x] 2.1 实现基于 JWT 的身份认证中间件与接口（`/api/auth/login`, `/api/auth/signup`, `/api/auth/me`），支持 6 位 PIN 码验证，验证受保护路由的拦截与放行
- [x] 2.2 实现账单全套 CRUD 接口（`/api/bills`），将账单头、细项及成员关联封装进 DuckDB 单一事务中原子提交，并验证并发写无锁异常
- [x] 2.3 实现通讯录、好友申请、群组、私有标签与争议记录的 REST API，保持与前端现有数据格式兼容
- [x] 2.4 实现付款凭证直传接口与垫付人手动结清切换接口，验证数据正确持久化进 DuckDB

## 3. OpenAI 5.6luna 模型服务接入

- [x] 3.1 构建基于 OpenAI OAuth 凭证的 API 请求客户端，支持动态传递授权 Bearer Token 访问 `5.6luna` 模型
- [x] 3.2 移植多图 OCR 识别管道至服务端端点 `/api/scan-receipt`，适配 `5.6luna` 视觉请求格式，保留加拿大安省 13% HST 单价内嵌税则与北美超市双语词典，验证图片结构化解析成功
- [x] 3.3 移植账单争议仲裁接口至 `/api/dispute-arbitration`，由 `5.6luna` 依据自然语言异议生成成员差分方案，验证原始条目守恒
- [x] 3.4 在管理面板 (`/admin`) 与服务端实现纯 HTTP 的 OpenAI Codex 设备代码 OAuth 登录（RFC 8628 Device Code Flow，不依赖本地 `~/.codex`），包含一键复制验证码、官方反钓鱼安全提示、自动轮询授权与凭证自动刷新机制

## 4. 管理员权限重置与前端 Supabase 解耦

- [x] 4.1 更新 `src/pages/AdminPage.tsx` 与服务端的管理员权限白名单为 `robinfxa@gmail.com`，验证非该邮箱进入时提示未授权
- [x] 4.2 封装全新的前端统一 API 客户端 `src/lib/apiClient.ts`，配置基础请求地址与 Bearer Token 自动注入
- [x] 4.3 重构 `src/lib/api/` 下的各模块（`bills.ts`, `friends.ts`, `payments.ts`, `scan.ts`, `auth.ts`, `groups.ts`, `tags.ts`），将对 Supabase SDK 的直接调用全面切换为新后端接口
- [x] 4.4 从 `package.json` 中移除 `@supabase/supabase-js` 依赖，归档或标记清理根目录下遗留的 Supabase 相关文件

## 5. 端到端系统验证与交付

- [x] 5.1 运行全量前端类型检查与构建 (`npm run build`)，确保零 TypeScript 编译错误
- [x] 5.2 端到端走通完整业务流：新账号注册登录、创建账单与成员拖拽分配、负数折扣平摊、剪贴板粘贴凭证、小票扫描解析与 `robinfxa@gmail.com` 管理后台访问，记录验收证据
