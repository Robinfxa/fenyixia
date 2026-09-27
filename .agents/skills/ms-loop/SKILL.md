---
name: ms-loop
description: Route project work by contract impact, use official OpenSpec skills when needed, and verify the result.
---

# ms-loop

先核事实与用户授权。OpenSpec 是持久行为合同、变更账本与跨 session 交接层；代码/Git/测试提供实现事实。复杂度与是否需要 OpenSpec 分开判断。

## 1. 判断合同需要

- 默认不建 change：workflow/docs、tooling、行为不变的 refactor、恢复既有 spec 的普通 bugfix、小而可逆且无需跨 session 合同的实现。仍做与风险相称的验证。
- 默认建 change：observable behavior、API/schema/state contract、requirement 改变，新 capability，Major 的承重合同切片，或需稳定行为合同的跨 session/fresh-worker 关键任务。
- 无行为改变但确需 durable ledger 时，可建 `skip_specs: true` change；不发明 delta 凑验证。
- Fast/Normal/Major 只描述规模与协调成本；Normal 不自动要求 OpenSpec。Major 的 Plan 只写阶段目标、拆分、依赖、未决项、退出条件。

## 2. 选择官方工作流

使用本地官方 `openspec-*` skills（`/openspec-propose`、`/openspec-update-change`、`/openspec-apply-change`、`/openspec-archive-change`；sync 按需），不调用旧 `/opsx:*` prompts、不复制其步骤。

使用项目配置的默认 schema；自定义候选仅按项目明确授权试用，不自动升默认或迁移旧 change。项目增量规则按 overlay 引用；不要在这里重述写法。

官方 propose/update 是规划入口；用户仅请求规划时交付后停止。已有明确实施授权时按该授权完成 Director review 并进入 apply，不再把每个 Markdown 文件变成用户许可门。生成 skill 原文不手改。CLI `openspec update` 是更新集成文件，区别于修订 change 的 update skill。

## 3. 调度

简单任务 Director inline；有独立收益才派已有角色。brief 给合同引用、写入边界、验收和回填位置；模型与生命周期见 `Agent-init/Antigravity_Specialization.md`（兼容 `Codex_Specialization.md`），不为文档格式新增角色。

派工前用 brief 现有字段界定当前合同、职责域 owner、起始读集和受影响测试。Worker 从起始集搜索定位后读取承重章节，可按需扩大只读 discovery，不默认整读历史 Plan/archive/research；发现范围、owner 或合同变化时回 Director 调整切片或说明跨域必要性。

owner/工作集扩散、版本实现复制或同一热点反复妨碍真实任务时，判断继续局部改还是抽取独立 seam，仅异常时在现有 brief/Plan/change 写理由；不设文件数硬门槛或另记指标。新语义才可能需要新版本，开发轮次不构成理由；复用稳定核心须保持既有版本、写权和失败语义，不能为了统一而改合同。

连续两轮围绕同一问题的尝试未新增证据、排除假设或缩小失败范围时，先重评假设与方法；第三次沿用同一模式须有明确新理由。连续两轮实质修复/review 不收敛时，回看需求、diff 与失败证据，再选能区分原因的策略，不能把改代码或多一份报告当作进展。两轮是纠偏提醒，不是工具次数硬限；正常长任务等待不计空转。不自动换 worker 或重复申请已有授权；仅范围、合同、授权变化或确实无法继续时上报。

## 4. 最终 gate

按风险验收真实行为、权限/写权、失败语义和调用链；检查真实退出码、目标结果与未覆盖项。已有批准 Plan/gate 保留；历史节号、checkbox 镜像、状态表与旧分母检查不自动进入未来新切片。既有 checker 的适用范围以项目合同和已有验证记录为准。

有 OpenSpec 时调用官方 validate 与适用 diff 审读；planning complete 不等于实现完成。项目验证命令见 overlay §3。恢复或采纳 worker 报告时，核对证据对应的工作区、提交/未提交差异及相关输入；摘要与报告不能代替原始结果。发现漂移时先暂停依赖该证据的动作，核清影响后只重验受影响部分；无法确认则标明未验证。相同代码/环境/输入的有效证据不重复运行；实际结果只存一处，引用回 tasks/Plan。

Git/archive 权限按 overlay §7；无 change 不运行 OpenSpec closeout。driver 的 validate/closeout 仅保留给明确引用它的旧 gate，不再作为新任务的重复默认门。未授权后续产品工作不自动开工。
