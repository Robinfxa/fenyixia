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
