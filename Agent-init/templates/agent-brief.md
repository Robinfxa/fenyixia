# Agent Brief: <task>

- **目标 / 完成标准：** <一个可验收结果>
- **角色与模型：** <现有 role；本任务显式 model + reasoning>
- **上下文：** 跨任务默认 fresh；同一有界任务内，上下文明显节省重读/重建成本时优先复用，说明待续部分。
- **授权状态：** <Spec / evidence / approved implementation / approved Ops>
- **事实源：** <当前有效合同、职责域 owner、起始代码/测试与相关章节；只给路径/符号，不复制正文，历史材料仅列本任务必要项>
- **工作目录与允许写入：** <worktree / paths；禁止面仍遵守 overlay>
- **协作：** 你不是唯一协作者，不回退他人改动；遇到重叠写入先交回 Director 协调。
- **验证与回填：** <由改动 seam、合同 Scenario 与 caller/import 影响确定的测试/验收；实际结果回现有 verification.md、tasks.md 或报告>
- **回传：** 结果、改动、退出码/证据、未完成项；见 worker-report.md。阶段回报不自动结束 worker；有界任务完成验收后按生命周期收口。
