#!/usr/bin/env bash
# Scaffold a new Codex custom agent role contract that follows the
# multi-subflow kernel conventions. Refuses to overwrite.
#
# Usage:  bash add-role.sh <role-name> [yes|no = writes production code?] [target-repo-dir]
#   writes-code default = no.  target default = current dir.
set -euo pipefail
ROLE="${1:?usage: add-role.sh <role-name> [yes|no writes-code] [target-repo-dir]}"
WRITES="${2:-no}"
TARGET="${3:-$(pwd)}"
case "$ROLE" in *[!a-z0-9-]*) echo "GATE: FAIL role name must be lowercase kebab-case: $ROLE"; exit 1;; esac
DEST="$TARGET/.codex/agents"
[ -d "$DEST" ] || { echo "GATE: FAIL no $DEST — run /ms-init first"; exit 1; }
F="$DEST/$ROLE.toml"
[ -e "$F" ] && { echo "GATE: FAIL .codex/agents/$ROLE.toml already exists (refusing to overwrite)"; exit 1; }

cat > "$F" <<EOF
name = "$ROLE"
description = "<ONE LINE — what $ROLE does + WHEN to use it; put the verbs a user or Director would type>"
developer_instructions = """
你是团队的 ${ROLE}。<一句话定位：它在 Director 循环里补哪个缺口>

生命周期与任务模型由 Director 按 Agent-init/Codex_Specialization.md 分配；角色不绑定模型。

通用铁律：
- extend-not-rewrite / no-invent / surgical changes / mode-gated 缺省关 byte-identical，见 Agent-init/Director_Workflow §2·§3 + 项目 overlay §5。
- 动手前先核现状；项目若启用 codegraph，优先用结构查询；否则 read/rg。
- 工具调用必须真发出；数据放进最终返回值回 Director。

职责：
- 做：<具体产物 / 它负责的那一段>
- 不做：<不碰什么，例：不写 production code / 不 git>
- 文件独占边界：把本角色读写的路径登记进项目 overlay §6。

返回：
- 按 Agent-init/templates/worker-report.md 汇报 status、changed paths、evidence、docs updated、risks、next Director action。
"""
EOF

if [ "$WRITES" = "yes" ]; then
cat >> "$F" <<'EOF'

# If this role writes production code, keep that work behind Director approval in
# the task brief. It must write or update tests when behavior changes, run the
# specified tier-1 command, and record evidence in the OpenSpec change or docs.
EOF
fi

echo "GATE: PASS scaffolded .codex/agents/$ROLE.toml (writes-code=$WRITES)"
echo "NEXT: ① 填 developer_instructions + description  ② overlay §6 登记文件独占边界  ③ Team_Roles 矩阵加一行"
