#!/usr/bin/env python3
"""Antigravity PreToolUse hook policy script.

This file is inert until hooks.example.json is copied to .agents/hooks.json
and enabled. Keep it mechanical: broad architectural judgement belongs in
AGENTS.md, OpenSpec, tests, or reviewer prompts.
"""
import json
import sys


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        # Default allow on json decode issues
        print(json.dumps({"decision": "allow"}))
        return 0

    tool_call = payload.get("toolCall", {})
    name = tool_call.get("name", "")
    args = tool_call.get("args", {})
    text = json.dumps(args, ensure_ascii=False)

    # Guardrail against accidental edits to stale legacy config locations
    stale_targets = (
        ".claude/",
        "CLA" + "UDE.md",
        "Agent-init/" + "Clau" + "de_Code_Specialization.md",
    )
    if any(target in text for target in stale_targets):
        output = {
            "decision": "deny",
            "reason": "Antigravity workflow guardrail: avoid legacy install paths in this project.",
        }
        print(json.dumps(output))
        return 0

    # Guardrail against dangerous git commands in run_command
    if name == "run_command":
        cmd = args.get("CommandLine", "")
        dangerous_ops = ["git push -f", "git push --force", "git reset --hard", "git checkout -- ."]
        if any(d in cmd for d in dangerous_ops):
            output = {
                "decision": "ask",
                "reason": f"Dangerous git operation detected: `{cmd}`. Confirmation required.",
            }
            print(json.dumps(output))
            return 0

    print(json.dumps({"decision": "allow"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
