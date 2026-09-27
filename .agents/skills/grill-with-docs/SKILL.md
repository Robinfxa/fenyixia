---
name: grill-with-docs
description: Resolve unsettled architecture or domain decisions and record them in project docs.
disable-model-invocation: true
---

# Grill With Docs

用于重要未决架构、领域或范围选择。目标、边界和验收已明确时直接进入 `/ms-loop`，不把访谈当固定前置步骤。

1. 先从相关代码/文档消除事实问题，不把可调查的问题交给用户。
2. 对授权内的可逆实现选择自行判断并说明必要假设；涉及重要取舍、不可逆边界或必要用户 gate 时，给出建议并只问需要用户决定的问题。已获授权不重复确认。
3. 实现前把结论写入现有 source of truth：术语→CONTEXT；难逆转取舍→ADR；Major 范围→Director Plan；单 change 行为→OpenSpec artifacts。无需新文档类型或重复记录。
4. 存在外部证据缺口时补相关研究；文档分层见 `Agent-init/Documentation_System.md`，然后交给 `/ms-loop` 执行。

仅在需要深入领域建模时加载 `domain-modeling`；仅在用户要求逐项压力测试时使用 `grilling`，不强制串联两个 skill。返回已定结论、文档路径和仍需裁定的问题即可。
