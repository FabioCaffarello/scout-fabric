#!/usr/bin/env bash
# Apply the desired branch-protection state for `main` from a versioned JSON
# spec to the GitHub API. Idempotent: running twice with the same spec leaves
# the same final state.
#
# Usage:
#   ./scripts/apply-branch-protection.sh           # dry-run: diff only
#   ./scripts/apply-branch-protection.sh --apply   # PUT to GitHub
#
# Requires: gh (authenticated), jq.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPEC="${ROOT}/governance/branch-protection.main.json"
BRANCH="main"

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    -h|--help)
      sed -n '2,11p' "$0" | sed 's/^# //; s/^#//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null || { echo "gh CLI not found"; exit 1; }
command -v jq >/dev/null || { echo "jq not found"; exit 1; }
[[ -f "$SPEC" ]] || { echo "spec not found: $SPEC"; exit 1; }

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "==> repo:   $REPO"
echo "==> branch: $BRANCH"
echo "==> spec:   ${SPEC#$ROOT/}"

# Reduce both live and desired to the same shape so the diff is meaningful.
# Live GET returns nested objects with .enabled; PUT input uses bare booleans.
# `?` swallows the type error when accessing .enabled on a boolean.
normalize() {
  jq -S '
    def bool_of(v):
      if (v | type) == "object" then (v.enabled // false)
      elif (v | type) == "boolean" then v
      else false
      end;
    {
      required_status_checks: (
        if .required_status_checks == null then null
        else {
          strict: (.required_status_checks.strict // false),
          contexts: ((.required_status_checks.contexts // []) | sort)
        }
        end
      ),
      enforce_admins: bool_of(.enforce_admins),
      required_pull_request_reviews: (.required_pull_request_reviews // null),
      restrictions: (.restrictions // null),
      allow_force_pushes: bool_of(.allow_force_pushes),
      allow_deletions: bool_of(.allow_deletions),
      block_creations: bool_of(.block_creations),
      required_conversation_resolution: bool_of(.required_conversation_resolution),
      required_linear_history: bool_of(.required_linear_history),
      lock_branch: bool_of(.lock_branch),
      allow_fork_syncing: bool_of(.allow_fork_syncing)
    }
  '
}

LIVE_RAW="$(gh api "repos/$REPO/branches/$BRANCH/protection" 2>/dev/null || echo '{}')"
LIVE="$(echo "$LIVE_RAW" | normalize)"
DESIRED="$(normalize < "$SPEC")"

echo
echo "==> diff (live → desired):"
if diff -u <(echo "$LIVE") <(echo "$DESIRED"); then
  echo "    (no diff — already in sync)"
fi

if [[ "$APPLY" != "true" ]]; then
  echo
  echo "Dry-run only. Re-run with --apply to PUT the spec to GitHub."
  exit 0
fi

echo
echo "==> applying via PUT"
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input "$SPEC" >/dev/null
echo "==> applied. Re-reading live state…"
gh api "repos/$REPO/branches/$BRANCH/protection" | normalize
