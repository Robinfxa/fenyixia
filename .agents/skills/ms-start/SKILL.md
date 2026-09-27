---
name: ms-start
description: Restore a new Director session from this project's durable state.
---

# ms-start

这是新 Director session 的恢复入口，不是每次编辑前的必读清单。根 `AGENTS.md` 已加载，不重复阅读。

1. 核实当前目录、Git 分支和 `git status --short --branch`。写入前读取 overlay §5、§7 和目标目录的局部规则。
2. 继续产品工作时用 `openspec list`、相关 Git log、`docs/plans/active/` 定位本次 Plan/change；只读匹配的目标、剩余任务、决策与验证记录。纯 workflow 维护不读取产品全套计划。
3. 根据任务读取下表对应章节；已读且未变不重读。文档/代码事实冲突时核实 source of truth，不凭旧 session 摘要推断已完成。恢复证据按 `/ms-loop` §4 核对适用性，只重验受影响部分。

| 需要 | 读取 |
|---|---|
| Major Plan 边界或派工 | `Agent-init/Antigravity_Specialization.md` §1–§3；派用角色契约 |
| 开发执行 | `/ms-loop`；测试时补 overlay §3 |
| 定位代码 / 架构决策 | overlay §1–§2 的相关索引及对应架构/考古章节 |
| 文档归属或阶段归档 | `Agent-init/Documentation_System.md` 对应节 |
| 角色权限不清 | `Agent-init/Team_Roles.md` |
| 未决架构或领域选择 | `/grill-with-docs` |
| 其他索引缺口 | `MEMORY.md`（若有）；不当作事实正文 |

既有 Plan/change 的 slug 保持不变。`session-code.sh` 仅是可选的并行命名防冲突工具；无需每次启动登记 sid，也不能用 sid 代替生命周期管理。压缩或同一未完成任务恢复时只补缺失索引。
