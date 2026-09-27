#!/usr/bin/env bash
# ms-loop driver — mechanizes a Director's verification gates.
#
# The "app" this skill drives is the multi-agent development LOOP, not a GUI.
# Its interactive surface is a set of gates the Director runs by hand every
# cycle (scope → implement → test → commit → push). This script makes those
# gates one command each, so a future Director can't skip one or misread a
# compound exit code.
#
# Usage:
#   driver.sh validate <slug>        # legacy approved-gate compatibility; prefer official validate
#   driver.sh tier2 [baseline]       # full test suite, verdict from runner exit and summary
#   driver.sh closeout <slug> [plan] # legacy approved-gate compatibility; not a default for new work
#   driver.sh attrib [f1,f2,...]     # HEAD commit attribution: no ambient + only declared files (after commit)
#   driver.sh sync                   # unpushed count + residual untracked   (gate after push)
#   driver.sh gates [f1,f2,...]      # attrib + sync, the post-commit truth-check
#
# Cross-repo: every project-specific assumption is an env var with a default.
# Override per repo (e.g. in the skill's SKILL.md, a wrapper, or your shell):
#   DL_PY                python interpreter for tier2     (default: repo .venv → python3 → python)
#   DL_TEST_CMD          test runner; path appended last  (default: "$DL_PY -m pytest -q")
#   TIER2_PATH           suite path / blast-radius subset (default: tests/)
#   DL_SUMMARY_RE        line that carries the verdict     (default: pytest/jest "N passed/failed")
#   DL_PASS_RE / DL_FAIL_RE   passed-count / red detectors (default: pytest/jest style)
#   DL_REMOTE            git remote for sync               (default: origin)
#   DL_BRANCH            default branch                    (default: origin/HEAD symref → main)
#   DL_AMBIENT_RE        files that must never ride a commit (default: ^(reference/|\.gitmodules))
#   DL_RESIDUAL_IGNORE_RE  untracked noise to hide in sync (default: ^.. (reference/|overnight/))
#
# Every verdict is printed as a final `GATE: PASS|FAIL <reason>` line so the
# caller can grep one line instead of re-reading scrolling output.
set -uo pipefail

# --- locate repo root (script may be invoked from anywhere under the unit) ---
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "GATE: FAIL not-in-git-repo"; exit 2; }
cd "$ROOT" || exit 2

# --- env config (all defaulted; override per-repo) ---------------------------
_default_py() {
  for p in "$ROOT/.venv/bin/python" "$ROOT/venv/bin/python" python3 python; do
    command -v "$p" >/dev/null 2>&1 && { echo "$p"; return; }
  done; echo python3
}
PY="${DL_PY:-$(_default_py)}"
TEST_CMD="${DL_TEST_CMD:-$PY -m pytest -q}"                 # TIER2_PATH appended as last arg
TIER2_PATH="${TIER2_PATH:-tests/}"
# Auto-parallelize the FULL suite with pytest-xdist when available (≈3× here:
# ~471s vs ~1445s+ serial; default --dist load scatter, NOT loadscope). Skipped
# when DL_TEST_CMD is set explicitly, a narrow TIER2_PATH subset is requested
# (worker-spawn overhead not worth it), or xdist isn't installed → falls back to
# serial, so the driver stays portable across repos.
if [ -z "${DL_TEST_CMD:-}" ] && [ "$TIER2_PATH" = "tests/" ] && "$PY" -c 'import xdist' >/dev/null 2>&1; then
  TEST_CMD="$TEST_CMD -n auto"
fi
SUMMARY_RE="${DL_SUMMARY_RE:-[0-9]+ (passed|failed|error)}"
PASS_RE="${DL_PASS_RE:-[0-9]+ passed}"
FAIL_RE="${DL_FAIL_RE:-[0-9]+ (failed|error)}"
REMOTE="${DL_REMOTE:-origin}"
_default_branch() { git symbolic-ref --quiet --short "refs/remotes/$REMOTE/HEAD" 2>/dev/null | sed "s|^$REMOTE/||"; }
BRANCH="${DL_BRANCH:-$(_default_branch)}"; BRANCH="${BRANCH:-main}"
AMBIENT_RE="${DL_AMBIENT_RE:-^(reference/|\.gitmodules)}"
RESIDUAL_IGNORE_RE="${DL_RESIDUAL_IGNORE_RE:-^.. (reference/|overnight/)}"

pass() { echo "GATE: PASS $*"; exit 0; }
fail() { echo "GATE: FAIL $*"; exit 1; }

cmd="${1:-}"; shift || true

case "$cmd" in

  validate)
    slug="${1:-}"; [ -n "$slug" ] || fail "validate needs a <slug>"
    command -v openspec >/dev/null 2>&1 || fail "openspec CLI not found (initialize/sync OpenSpec before running the workflow)"
    echo "--- openspec validate $slug --strict ---"
    if openspec validate "$slug" --strict; then
      pass "spec $slug valid (--strict EXIT 0)"
    else
      fail "spec $slug invalid — rewrite (--strict non-zero)"
    fi
    ;;

	  tier2)
    expected="${1:-}"   # optional passed-count completeness check, not behavioral equivalence
    runner_bin="${TEST_CMD%% *}"
    command -v "$runner_bin" >/dev/null 2>&1 || fail "test runner not found: $runner_bin (set DL_PY / DL_TEST_CMD)"
    log="$(mktemp -t tier2.XXXXXX.log)"
    echo "--- $TEST_CMD $TIER2_PATH  (full suite; subset via TIER2_PATH) ---"
    echo "    log: $log"
    $TEST_CMD $TIER2_PATH >"$log" 2>&1
    runner_status=$?
    # Both runner completion and the summary must be successful.
    summary="$(grep -E "$SUMMARY_RE" "$log" | tail -1 | sed $'s/\x1b\\[[0-9;]*m//g')"
    echo "SUMMARY: ${summary:-<none found>}"
    [ "$runner_status" -eq 0 ] || fail "test runner exited $runner_status (see $log)"
    [ -n "$summary" ] || fail "no test summary line (DL_SUMMARY_RE) — run crashed before reporting (see $log)"
    if echo "$summary" | grep -qE "$FAIL_RE"; then
      fail "tier-2 RED: $summary"
    fi
    passed="$(echo "$summary" | grep -oE "$PASS_RE" | grep -oE '[0-9]+' | head -1)"
    [ -n "$passed" ] && [ "$passed" -gt 0 ] || fail "no positive passed-count (see $log)"
    if [ -n "$expected" ] && [ "$passed" != "$expected" ]; then
      fail "tier-2 green but count $passed != baseline $expected — check expected suite membership"
    fi
    pass "tier-2 GREEN: $passed passed${expected:+ (== expected count $expected)}"
	    ;;

	  closeout)
	    slug="${1:-}"; plan="${2:-}"
	    [ -n "$slug" ] || fail "closeout needs a <slug>"

	    echo "--- closeout checks for $slug ---"

	    active_change="openspec/changes/$slug"
	    archived_matches="$(find openspec/changes/archive -maxdepth 1 -type d \( -name "*-$slug" -o -name "$slug" \) 2>/dev/null | sort || true)"

	    if [ -d "$active_change" ]; then
	      fail "active OpenSpec change still exists: $active_change (run/archive before closeout)"
	    fi
	    [ -n "$archived_matches" ] || fail "archived OpenSpec change not found for slug '$slug'"
	    archive_dir="$(echo "$archived_matches" | tail -1)"
	    echo "archive: $archive_dir"

	    evidence_ok=0
	    if [ -s "$archive_dir/verification.md" ]; then
	      evidence_ok=1
	      echo "verification: $archive_dir/verification.md"
	    elif [ -s "$archive_dir/tasks.md" ] && grep -qiE 'verification|verified|evidence|RED|GREEN|PASS|GATE' "$archive_dir/tasks.md"; then
	      evidence_ok=1
	      echo "verification: evidence markers found in $archive_dir/tasks.md"
	    fi
	    [ "$evidence_ok" = 1 ] || fail "no verification summary found in archived change (verification.md or tasks.md)"

	    if [ -n "$plan" ]; then
	      case "$plan" in
	        docs/plans/active/*)
	          [ ! -e "$plan" ] || fail "Director Plan still active: $plan"
	          ;;
	        docs/plans/archive/*)
	          [ -e "$plan" ] || fail "Director Plan archive path not found: $plan"
	          ;;
	        *)
	          echo "plan: $plan (custom path; exists=$( [ -e "$plan" ] && echo yes || echo no ))"
	          ;;
	      esac
	    else
	      if find docs/plans/active -maxdepth 1 -type f -name "*$slug*.md" 2>/dev/null | grep -q .; then
	        find docs/plans/active -maxdepth 1 -type f -name "*$slug*.md" -print 2>/dev/null
	        fail "matching Director Plan still active; move it to docs/plans/archive/"
	      fi
	      echo "plan: no explicit plan path; checked active plan names matching slug"
	    fi

	    if [ -e MEMORY.md ]; then
	      echo "memory: MEMORY.md exists (manual rule: index/links only, no fact body)"
	    else
	      echo "memory: MEMORY.md not present; skipped"
	    fi

	    pass "closeout ready for commit/push ($slug)"
	    ;;

  attrib)
    targets="${1:-}"   # optional comma-list of files this commit SHOULD touch
    echo "--- git show --stat HEAD ---"
    git show --stat --oneline HEAD | head -40
    changed="$(git show --name-only --format= HEAD | sed '/^$/d')"
    # 1) ambient guard: configured paths must never ride along
    if echo "$changed" | grep -qE "$AMBIENT_RE"; then
      echo "!! ambient files in commit:"; echo "$changed" | grep -E "$AMBIENT_RE"
      fail "commit carried ambient file(s) matching DL_AMBIENT_RE"
    fi
    # 2) optional target-set guard: every changed file must be in the declared set
    if [ -n "$targets" ]; then
      IFS=',' read -ra want <<<"$targets"
      stray=""
      while IFS= read -r f; do
        hit=0; for w in "${want[@]}"; do [ "$f" = "$w" ] && hit=1 && break; done
        [ "$hit" = 0 ] && stray="$stray $f"
      done <<<"$changed"
      [ -n "$stray" ] && fail "commit touched files outside declared target set:$stray"
    fi
    pass "commit attribution clean ($(echo "$changed" | wc -l | tr -d ' ') files, no ambient)"
    ;;

  sync)
    echo "--- git rev-list --count $REMOTE/$BRANCH..$BRANCH ---"
    ahead="$(git rev-list --count "$REMOTE/$BRANCH..$BRANCH" 2>/dev/null || echo '?')"
    echo "unpushed commits: $ahead"
    echo "--- residual untracked (excluding DL_RESIDUAL_IGNORE_RE) ---"
    resid="$(git status --porcelain --untracked-files=all | grep -vE "$RESIDUAL_IGNORE_RE" || true)"
    [ -n "$resid" ] && echo "$resid" | head -20 || echo "(none)"
    [ "$ahead" = "0" ] || fail "$REMOTE/$BRANCH NOT even — $ahead commit(s) unpushed (forgot to push?)"
    pass "$REMOTE/$BRANCH even (0 unpushed)"
    ;;

  gates)
    # post-commit truth check: attribution + sync in one shot
    "$0" attrib "${1:-}" || exit 1
    "$0" sync || exit 1
    pass "post-commit gates clean (attrib + sync)"
    ;;

	  ""|-h|--help|help)
	    awk 'NR==1{next} /^#/{sub(/^# ?/,"");print;next} {exit}' "$0"
	    ;;

  *)
	    fail "unknown command '$cmd' (try: validate|tier2|closeout|attrib|sync|gates)"
    ;;
esac
