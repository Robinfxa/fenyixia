#!/usr/bin/env bash
# Initialize a target repo with the Codex-native multi-subflow workflow kernel:
# copy skills into <target>/.agents/skills/, custom agents into <target>/.codex/agents/,
# Agent-init kernel docs into <target>/Agent-init/, scaffold the project overlay,
# and wire a root AGENTS.md. Idempotent: never clobbers an existing overlay,
# AGENTS.md, or same-named role.
#
# Usage:  bash init.sh <target-repo-dir> <project-name>
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)

# The script is supported from both layouts:
#   source package: <kernel>/skills/ms-init/init.sh
#   installed copy: <project>/.agents/skills/ms-init/init.sh
if [ -d "$HERE/../../agents" ] && [ -d "$HERE/../../skills" ] && [ -d "$HERE/../../Agent-init" ]; then
  KERNEL=$(cd "$HERE/../.." && pwd)
  AGENT_SOURCE="$KERNEL/agents"
  SKILL_SOURCE="$KERNEL/skills"
  DOC_SOURCE="$KERNEL/Agent-init"
  AGENTS_TEMPLATE="$KERNEL/AGENTS.kernel.md"
elif [ -d "$HERE/../../../.codex/agents" ] && [ -d "$HERE/../../../.agents/skills" ] && [ -d "$HERE/../../../Agent-init" ]; then
  KERNEL=$(cd "$HERE/../../.." && pwd)
  AGENT_SOURCE="$KERNEL/.codex/agents"
  SKILL_SOURCE="$KERNEL/.agents/skills"
  DOC_SOURCE="$KERNEL/Agent-init"
  AGENTS_TEMPLATE="$HERE/AGENTS.kernel.md"
else
  echo "GATE: FAIL cannot locate Codex kernel around $HERE"
  exit 1
fi

[ -f "$AGENTS_TEMPLATE" ] || { echo "GATE: FAIL AGENTS template not found: $AGENTS_TEMPLATE"; exit 1; }

TARGET="${1:?usage: init.sh <target-repo-dir> <project-name>}"
NAME="${2:?usage: init.sh <target-repo-dir> <project-name>}"
[ -d "$TARGET" ] || { echo "GATE: FAIL target dir not found: $TARGET"; exit 1; }
AGENTS_DEST="$TARGET/.codex/agents"
SKILLS_DEST="$TARGET/.agents/skills"
DOC_DEST="$TARGET/Agent-init"
mkdir -p "$AGENTS_DEST" "$SKILLS_DEST" "$DOC_DEST" "$TARGET/.codex"

# 1. Codex custom agent contracts (skip any role the target already defines)
for f in "$AGENT_SOURCE"/*.toml; do
  b=$(basename "$f")
  if [ -e "$AGENTS_DEST/$b" ]; then echo "  kept existing .codex/agents/$b"; else cp "$f" "$AGENTS_DEST/$b"; echo "  + .codex/agents/$b"; fi
done

# 2. flat multi-subflow skills (Codex .agents/skills layout)
for d in "$SKILL_SOURCE"/ms-*; do
  b=$(basename "$d")
  if [ -e "$SKILLS_DEST/$b" ] && [ "$d" -ef "$SKILLS_DEST/$b" ]; then
    echo "  kept self-source .agents/skills/$b/"
  else
    rm -rf "$SKILLS_DEST/$b"
    cp -R "$d" "$SKILLS_DEST/$b"
    echo "  + .agents/skills/$b/"
  fi
done

# 2b. on-demand support skills
for b in grilling grill-with-docs domain-modeling ponytail openai-product-knowledge; do
  if [ -d "$SKILL_SOURCE/$b" ]; then
    if [ -e "$SKILLS_DEST/$b" ] && [ "$SKILL_SOURCE/$b" -ef "$SKILLS_DEST/$b" ]; then
      echo "  kept self-source .agents/skills/$b/"
    else
      rm -rf "$SKILLS_DEST/$b"
      cp -R "$SKILL_SOURCE/$b" "$SKILLS_DEST/$b"
      echo "  + .agents/skills/$b/"
    fi
  else
    echo "  ! missing kernel support skill: $b"
  fi
done

# 3. Agent-init kernel docs (zero-domain workflow + roles charter + document system + overlay template)
for b in Director_Workflow.md Team_Roles.md Documentation_System.md Codex_Specialization.md Workflow_User_Guide.md PROJECT_OVERLAY.template.md; do
  if [ -e "$DOC_DEST/$b" ] && [ "$DOC_SOURCE/$b" -ef "$DOC_DEST/$b" ]; then
    :
  else
    cp "$DOC_SOURCE/$b" "$DOC_DEST/"
  fi
done
if [ -e "$DOC_DEST/templates" ] && [ "$DOC_SOURCE/templates" -ef "$DOC_DEST/templates" ]; then
  :
else
  rm -rf "$DOC_DEST/templates"
  cp -R "$DOC_SOURCE/templates" "$DOC_DEST/templates"
fi
echo "  + Agent-init/{Workflow_User_Guide,Director_Workflow,Team_Roles,Documentation_System,Codex_Specialization,PROJECT_OVERLAY.template,templates/}"

# 4. scaffold the project overlay (the domain-injection layer) — never clobber
if [ -e "$DOC_DEST/PROJECT_OVERLAY.md" ]; then
  echo "  kept existing Agent-init/PROJECT_OVERLAY.md"
else
  sed -e "s/<NAME>/$NAME/g" -e "1s/^# 项目 Overlay 模板.*/# 项目 Overlay — $NAME/" \
    "$DOC_SOURCE/PROJECT_OVERLAY.template.md" > "$DOC_DEST/PROJECT_OVERLAY.md"
  echo "  + Agent-init/PROJECT_OVERLAY.md  (🔴 FILL IT IN — 代码地图/测试体系/领域铁律)"
fi

# 5. scaffold the target-project document roots used by Documentation_System.md
mkdir -p "$TARGET/docs/plans/active" "$TARGET/docs/plans/archive" "$TARGET/docs/research"
for f in "$TARGET/docs/plans/active/.gitkeep" "$TARGET/docs/plans/archive/.gitkeep" "$TARGET/docs/research/.gitkeep"; do
  [ -e "$f" ] || : > "$f"
done
echo "  + docs/{plans/{active,archive},research}/"

# 6. AGENTS.md = generic Codex kernel. Append a pointer to existing root AGENTS.md; else write from kernel.
AGENTS_FILE="$TARGET/AGENTS.md"
if [ -e "$AGENTS_FILE" ]; then
  if grep -q 'Agent-init/PROJECT_OVERLAY.md' "$AGENTS_FILE"; then
    echo "  kept existing AGENTS.md (already points at overlay)"
  else
    printf '\n## multi-subflow Codex workflow\n\n- Use `/ms-start` to restore relevant state in a new Director session.\n- Project-specific workflow details live in `Agent-init/PROJECT_OVERLAY.md`.\n- Long-form workflow docs live in `Agent-init/` and skills live in `.agents/skills/`.\n' >> "$AGENTS_FILE"
    echo "  ~ appended multi-subflow Codex pointer to existing AGENTS.md"
  fi
else
  sed "s/<PROJECT>/$NAME/g" "$AGENTS_TEMPLATE" > "$AGENTS_FILE"
  echo "  + AGENTS.md (generic Codex kernel)"
fi

# 7. optional Codex hooks example (not active by default)
mkdir -p "$TARGET/.codex/hooks"
HOOK_EXAMPLE="$TARGET/.codex/hooks.example.json"
if [ -e "$HOOK_EXAMPLE" ]; then
  echo "  kept existing .codex/hooks.example.json"
else
  cat > "$HOOK_EXAMPLE" <<'EOF'
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|apply_patch",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/pre_tool_use_policy.py\"",
            "timeout": 30,
            "statusMessage": "Checking workflow guardrails"
          }
        ]
      }
    ]
  }
}
EOF
  echo "  + .codex/hooks.example.json (example only; not enabled)"
fi

HOOK_POLICY="$TARGET/.codex/hooks/pre_tool_use_policy.py"
if [ -e "$HOOK_POLICY" ]; then
  echo "  kept existing .codex/hooks/pre_tool_use_policy.py"
else
  cat > "$HOOK_POLICY" <<'EOF'
#!/usr/bin/env python3
"""Example Codex PreToolUse hook.

This file is inert until hooks.example.json is copied to .codex/hooks.json and
trusted through Codex /hooks. Keep it mechanical: broad architectural judgement
belongs in AGENTS.md, OpenSpec, tests, or reviewer prompts.
"""
import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    text = json.dumps(payload, ensure_ascii=False)
    stale_targets = (
        "." + "claude/",
        "CLA" + "UDE.md",
        "Agent-init/" + "Clau" + "de_Code_Specialization.md",
    )
    if any(target in text for target in stale_targets):
        print("Codex workflow guardrail: avoid legacy install paths in this project.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
EOF
  chmod +x "$HOOK_POLICY"
  echo "  + .codex/hooks/pre_tool_use_policy.py (example only; not enabled)"
fi

# 8. gitignore runtime/noise
GI="$TARGET/.gitignore"
for pat in '.multi-subflow/' '.DS_Store'; do
  if grep -qs "^$pat\$" "$GI" 2>/dev/null; then
    :
  else
    echo "$pat" >> "$GI"
    echo "  + .gitignore: $pat"
  fi
done

echo "GATE: PASS Codex multi-subflow initialized → $TARGET (project=$NAME)"
echo "NEXT: ① 读 Agent-init/Workflow_User_Guide.md  ② 填 Agent-init/PROJECT_OVERLAY.md  ③ 初始化/同步 OpenSpec  ④ 跑 /ms-start 开工"
