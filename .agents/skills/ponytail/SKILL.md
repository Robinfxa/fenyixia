---
name: ponytail
description: Use when implementing or reviewing code that may be over-built, duplicated, dependency-heavy, abstraction-heavy, or solvable by deletion, reuse, stdlib, native platform features, installed dependencies, or a smaller diff.
---

# Ponytail

最小实现纪律：写更少代码，但不省理解、不省安全、不省验证。它补充 `/ms-loop` 和 OpenSpec，不替代它们。

## Ladder

写代码前，从上到下停在第一个成立的 rung：

1. **不需要做？** 跳过，说明为什么。
2. **代码库已有？** 复用 helper / util / pattern，不重写。
3. **stdlib 能做？** 用标准库。
4. **平台原生能做？** 用 HTML/CSS/DB/OS/runtime 原生能力。
5. **已安装依赖能做？** 用已有依赖；不要为几行代码加新依赖。
6. **一行能做？** 一行。
7. **否则** 写最小可工作的自定义实现。

先读懂真实 flow 再用 ladder。小 diff 写错位置不是简洁，是第二个 bug。

## Boundaries

不削减：
- trust boundary 的输入校验
- 防数据丢失的错误处理
- security / accessibility
- 硬件、时间、外部系统需要的校准余量
- 用户明确要求的完整实现

非平凡逻辑必须留下最小 runnable check：一个行为切片测试、assert demo、smoke，或项目 overlay 指定的 tier-1。纯一行 glue 可不新造测试。

## Evidence

仅有实际实现取舍时在现有证据位置简述；下面格式可选，不强制填表：

```text
ponytail: rung=<reuse|stdlib|native|installed-dep|one-line|minimum-custom|skip>, skipped=<未做的复杂度>, add-when=<何时再加>
```

已知天花板用短注释标明：

```text
ponytail: O(n^2) is fine for <100 rows; replace with index if import size grows.
```

## Review Lens

只猎杀复杂度，不替代 correctness/security review：
- `delete`: 死代码、未请求 flexibility
- `reuse`: 重写了已有 helper/pattern
- `stdlib`: 手写了标准库已有能力
- `native`: 依赖或代码替代了平台原生能力
- `yagni`: 单实现抽象、无人配置、未来式脚手架
- `shrink`: 同逻辑可更短

没有可删复杂度就说：`Lean already. Ship.`
