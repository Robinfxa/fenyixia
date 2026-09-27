---
name: ms-init
description: Install this workflow kernel into a target repository.
---

# ms-init

把 **Codex-native multi-subflow 内核**（零领域词的多智能体编排骨架）铺进一个目标仓库，一条命令完成脚手架。内核 = 通用层；项目专属（代码地图 / 测试体系 / 领域铁律）走 **overlay**（脚手架已生成空模板，开工前填）。

本脚手架不 vend OpenSpec 生成物。Codex 的 `.agents/skills/openspec-*` 由官方 `openspec init --tools codex` / `openspec update` 管理；内核只路由合同需要与项目边界。

本脚手架会安装 Codex 版 `/ms-*` 主入口，以及按需调用的 support skills：
`/grilling`、`/grill-with-docs`、`/domain-modeling`、`/ponytail`、`/openai-product-knowledge`。

Driver：`skills/ms-init/init.sh`（在内核包根运行）或目标安装后的 `.agents/skills/ms-init/init.sh`。

## Run (agent path)

```bash
# 从内核源包运行
bash skills/ms-init/init.sh <target-repo-dir> <project-name>

# 或从任一已安装项目运行
bash .agents/skills/ms-init/init.sh <target-repo-dir> <project-name>
```

实测输出尾行：`GATE: PASS Codex multi-subflow initialized → <target> (project=<name>)`。

它做的事（**幂等**——已存在的 overlay / AGENTS.md / 同名角色一律不覆盖）：
| 产出 | 说明 |
|---|---|
| `<target>/.codex/agents/*.toml` | 4 个 Codex custom agent（arc-imp/ops/researcher/validation） |
| `<target>/.agents/skills/ms-{loop,start,init,add-role}/` | Codex skill 入口 + gate / init / add-role 脚本 |
| `<target>/.agents/skills/{grilling,grill-with-docs,domain-modeling,ponytail,openai-product-knowledge}/` | 立项前讨论、CONTEXT/ADR 更新、最小实现纪律、OpenAI/Codex 官方事实核验 |
| `<target>/Agent-init/{Workflow_User_Guide,Director_Workflow,Team_Roles,Documentation_System,Codex_Specialization,PROJECT_OVERLAY.template,templates/}` | 使用者指南 + 内核工作流 + 角色章程 + 文档账本规则 + Codex 操作分层 + 输出模板 |
| `<target>/Agent-init/PROJECT_OVERLAY.md` | 🔴 **空脚手架，必须填**（代码地图/测试/领域铁律） |
| `<target>/docs/plans/{active,archive}/` + `<target>/docs/research/` | Director Plan 与 Research Dossier 默认目录 |
| `<target>/AGENTS.md` | Codex 常驻短规则 + `Agent-init/PROJECT_OVERLAY.md` 指针 |
| `<target>/.codex/hooks.example.json` + `<target>/.codex/hooks/pre_tool_use_policy.py` | 可选 Codex hook 示例；不默认启用 |
| `<target>/.gitignore` | 追加 `.multi-subflow/`（运行时状态目录）和 `.DS_Store` |

**已有 AGENTS.md 的项目**：不覆盖，只在末尾补一段 multi-subflow Codex 指针。

## 初始化后

1. 读 `<target>/Agent-init/Workflow_User_Guide.md`，确认这套流程的优势、成本和三档路由。
2. 填 `<target>/Agent-init/PROJECT_OVERLAY.md`（样例见内核 `examples/valuehermes/PROJECT_OVERLAY.md`），并确认 overlay §2/§6/§8/§11/§12 指向的设计圣经、计划、研究、状态路径和可选 hooks。
3. 需要持久行为合同且目标项目尚未配置时，在目标项目运行 `openspec init --tools codex`；不安装旧 `/opsx:*` prompts。
4. 在目标项目里跑 `/ms-start` 开工。
5. 按需 `/ms-add-role` 加新角色。

## Gotchas
- Codex 不支持 `@include` 语义；`AGENTS.md` 只放指针，Director 通过 `/ms-start` 显式读取 `Agent-init/PROJECT_OVERLAY.md`。
- 已安装布局使用 skill 内置 `AGENTS.kernel.md` 生成新项目入口；在源项目原地重跑时会识别 self-source，不删除或重复复制自身。
- 合同承重切片使用 OpenSpec，其他任务按 `/ms-loop` 直接验证；不能通过关闭必要合同验证绕过安全/行为边界。项目配置与自定义 schema 属项目资产，内核安装器不复制它们。
- `.codex/hooks.example.json` 只是示例；复制/改名为 `.codex/hooks.json` 前必须在 Codex `/hooks` 中 review/trust。

## Troubleshooting
- **`GATE: FAIL target dir not found`**：目标目录不存在，先 `mkdir`。
- **重跑只看到 `kept existing …`**：正常，幂等保护——更新既有文件应先审查 diff，不通过删除来绕过保留策略。
