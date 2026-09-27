# Antigravity 派工与 Session 约定

本文件是项目在 Antigravity 环境下 session 生命周期、任务模型矩阵与多智能体编排的唯一规则源。

---

## 1. Session 生命周期

- **Director：一个完整 Major Plan → 一个 session。**
  - 同一未完成 Plan 可跨回合、上下文压缩或恢复继续；完成后先归档 Plan、回填 OpenSpec / docs、核实 Git 与剩余事项，再结束该 Director session。
- **下一个 Plan 使用 fresh Director session**：
  - 从 Git、OpenSpec、Director Plan 和相关文档恢复状态（通过 `/ms-start`）。
  - 若已获用户持续推进授权，交接后直接继续推进，无需重复请求开工许可。
- **Worker 跨任务边界默认 fresh；同一有界任务内优先复用**：
  - 同一有界任务内，如果已有上下文明显能节省重新读取和重建成本，则优先复用。
  - 角色可复用；以目标和验收边界划分任务，不把一次回报或 Spec→Code 阶段切换自动视为新任务。实现前的 Director review 仍必须通过。
- **报告与状态归宿**：
  - Worker 的 report 必须把结果和未完成事项交回 durable state（Plan / OpenSpec / verification）；不能让正确性依赖 prompt-cache 或长期 agent context。

---

## 2. 模型档位矩阵（按任务选择）

在 Antigravity 中，Subagent 及主任务可选择以下模型档位（`Model` 参数）：

| 任务类型 | 推荐模型 (`Model`) | 说明与升级条件 |
|---|---|---|
| **Director / 主规划会话** | `pro` 或 `inherit` | 全局规划、架构权衡、多阶段拆分、严格验收 |
| **文档、Plan、Spec、Research 综合** | `pro` 或 `inherit` | 领域模型提取、OpenSpec 规格设计与综合决策 |
| **复杂代码实现 (Architectural Implementation)** | `pro` | 涉及多模块协作、核心算法、重要契约重构 |
| **常规代码实现 (Routine Implementation)** | `inherit` 或 `flash` | 单模块修补、已知模式扩充、样式微调 |
| **测试执行与日志诊断 (Validation & Triage)** | `flash` | 运行测试命令、匹配日志错误、回归检查 |
| **Git / Ops 卫生操作** | `flash` | 分支管理、暂存检查、OpenSpec 归档 |
| **快速信息检索与资料搜集 (Research)** | `flash` (或内置 `research`) | 快速查阅文档、API 规范、外部博客与生态 |

> **说明**：
> - Antigravity 模型标识为 `pro`（如 Gemini Pro）、`flash`（如 Gemini Flash）、`flash_lite`、`inherit`（继承父会话模型）。
> - 派工时在 `invoke_subagent` 中显式指定 `Model`。未指定时默认使用 `inherit`。

---

## 3. Antigravity 原生派工与工作区隔离

- **派工工具**：
  - 使用 Antigravity 原生 `invoke_subagent` 派发子智能体。
  - 自定义角色可由 Director 在需要时使用 `define_subagent` 声明，或直接基于 `.agents/subagents/` 中的角色契约派发。
- **工作区隔离模式 (`Workspace`)**：
  - `branch`（推荐）：为主机克隆/分支独立隔离的工作区（类似于新分支工作树），实现真正的并行写入且互不冲突，适合 `arc-imp` 并行编码。
  - `share`：共享底层的代码库目录（类似于 `git worktree`），存储不膨胀，适合只读测试或共享环境的验证工作。
  - `inherit`：直接使用父会话的工作目录，适合串行任务或轻量 Ops。
- **最小上下文派工原则**：
  - 派工使用精简 brief（参考 `Agent-init/templates/agent-brief.md`），只给当前切片的目标、事实源路径与关键章节、读写边界与验收命令。
  - 不要让 Worker 遍历整库或先通读 `Agent-init`。
  - 同文件、契约重叠或有依赖的任务一律串行。

---

## 4. 反应式唤醒（Reactive Wakeup）与长任务管理

Antigravity 具有原生**反应式事件唤醒**能力，与传统轮询式工具有本质不同：

1. **严禁无意义空轮询**：
   - 启动后台命令（`run_command`）或派发子智能体（`invoke_subagent`）后，**严禁使用 loop 或轮询 `manage_task status`**。
   - 任务完成、出错或子智能体回传消息时，Antigravity 系统会自动触发响应并把结果直接送达上下文。发起异步操作后停止发工具即可。
2. **定时与延迟检查**：
   - 严禁在终端运行 `sleep` 命令来设置等待。
   - 需要延时唤醒或周期任务时，使用 Antigravity 原生 `schedule` 工具（支持 `DurationSeconds` 一次性定时器或 `CronExpression` 周期任务）。
3. **长测试结果落盘**：
   - 长测试命令必须保存退出码、执行摘要与日志路径。
   - 无实质变化时保持安静，只在出现明确结果、失败或需要用户介入时汇报。

---

## 5. Artifacts 交付呈现

对于长篇计划（Plan）、架构设计方案、重大变更 Diff 或验证验收报告：
- 统一生成并保存在 Antigravity Artifact 目录（`<appDataDir>/brain/<conversation-id>`）。
- 回复用户时仅需给出核心要点、决策选项与 Artifact 链接，避免在聊天窗口中冗长重复。
