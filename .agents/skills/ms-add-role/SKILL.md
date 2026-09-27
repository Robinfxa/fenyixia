---
name: ms-add-role
description: Scaffold a new role contract when an existing role cannot cover a requested responsibility.
---

# ms-add-role

按用户需求**生成一个新的 Codex custom agent 契约**，自带内核必备结构（TOML schema / 继承的通用铁律 / 职责骨架 / 返回契约），你只需填「职责」。

.codex/agents 只保存职责边界，不固定 model/reasoning；模型档位不构成新增角色的理由。

Driver：`.agents/skills/ms-add-role/ms-add-role.sh`。

## 工作流（agent path）

1. **从用户需求拍三个参数**：
   - `<role-name>`：小写 kebab-case（如 `security-auditor` / `data-curator`）。
   - **写不写 production code？** 写 → `yes`（注入写码边界 + 验证契约）；只读/审计/文档 → `no`。
   - `<target>`：目标项目根（默认当前目录）。
2. **跑 driver 生成骨架：**
   ```bash
   bash .agents/skills/ms-add-role/ms-add-role.sh <role-name> <yes|no> <target-repo-dir>
   ```
   实测尾行：`GATE: PASS scaffolded .codex/agents/<role>.toml (writes-code=<yes|no>)`。
3. **填空（driver 故意留给你按语义填）：**
   - TOML `description`：一行，含**用户会键入的动词**（决定派工是否命中）。
   - `developer_instructions`：这个角色具体做什么 / 不做什么 / 边界。
4. **登记**（防并发冲突 + 可发现）：overlay §6 加文件独占边界、`Agent-init/Team_Roles.md` 矩阵加一行。

## 生成物结构
- `no`：Codex custom agent TOML + 通用铁律 + 职责骨架 + worker-report 返回契约。
- `yes`：上面 + 写 production code 的边界、验证命令和 evidence 回填要求。

## Gotchas
- **角色名必须小写 kebab-case**：driver 会拒非法名（`GATE: FAIL ... must be lowercase kebab-case`）。
- **不覆盖既有角色**：同名已存在 → `GATE: FAIL ... refusing to overwrite`（核对需求后选择新角色名，不为重置而删除既有契约）。
- **得先 `/ms-init`**：没有 `<target>/.codex/agents/` 会 `GATE: FAIL no ... — run /ms-init first`。
- **写码角色才传 `yes`**：误传 yes 给纯读角色会塞进它用不到的写码边界；纯审计/研究角色用 `no`。

## Troubleshooting
- **角色未出现在当前环境**：核对目标路径、TOML 语法和当前工具返回的可用角色；文件已生成不等于当前 session 已加载。仍不可用时，按同一 brief 使用可用角色，不重复创建契约。
