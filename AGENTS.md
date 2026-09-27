# fenyixia — Antigravity 项目规则

用户用中文交流，**回复用中文**。本文件只放常驻约束；长流程按任务读取。

## 工作入口
- 日常工作从 `/ms-loop` 判断合同影响；规模分档不决定是否创建 OpenSpec。需要持久行为合同才用官方 `openspec-*` skills；不把 Markdown 作为所有代码修改的许可门。
- 新 Director session 用 `/ms-start` 恢复相关 Git / OpenSpec / Plan 状态，不通读全部工作流文档；压缩后继续同一任务，不重复开工仪式。
- 写入前读取 `Agent-init/PROJECT_OVERLAY.md` §5、§7 的项目不变量和 Git 边界，以及目标路径适用的局部规则；其余章节按需读取。
- 多阶段任务先明确目标、边界与验收线；仅在重要决策未定时使用 `/grill-with-docs`。影响实现的讨论结论写回现有 Plan / OpenSpec / CONTEXT / ADR，不新增平行账本。

## 协作
- Session 生命周期与按任务模型矩阵以 `Agent-init/Antigravity_Specialization.md`（兼容 `Codex_Specialization.md`）为准；开始 Major Plan 或派工时读取相关节。
- Subagents 仅在用户或 Director 明确派工且有独立收益时启用；使用 Antigravity 原生 `invoke_subagent`（角色契约位于 `.agents/subagents/`，并行写入优先设置 `Workspace: 'branch'` 隔离），给出短 brief、读写边界与回传要求。同文件或有依赖的工作串行。
- Hooks 使用 `.agents/hooks.json` 做已核实启用的确定性 guardrail；后台命令与子智能体遵循 Antigravity 原生反应式唤醒（Reactive Wakeup，严禁盲目轮询）。私有工作区数据优先使用已配置 MCP / 连接器。

## 实现与验收
- 先核现状。授权范围内的可逆选择自行判断并说明关键假设；只有无法从代码、文档或既有授权解决的重要决策才询问用户。
- 最小实现：先考虑不改、复用、stdlib/native/已装依赖，再写必要自定义代码。不引入投机抽象，只改能追溯到需求的行，不回退他人改动。
- 验证先于完成声明：新行为/修复优先真实路径 RED→GREEN；重构、gated-off、文档使用适当 characterization、smoke/lint 或实际 byte-identical 证据。记录命令、退出码和结果；范围未变且证据有效时不重复测试。
