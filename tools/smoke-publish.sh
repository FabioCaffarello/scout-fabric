#!/usr/bin/env bash
# Smoke test for the publish → install → use cycle of every
# @fabio.caffarello/sf-* package, against a local Verdaccio. Never touches
# npmjs for our own packages; peers come from npm public via Verdaccio
# uplink (same posture a real consumer has).
#
# Single source. To add a new sf-* package:
#   1) append its name to PACKAGES below
#   2) implement prove_<name_with_underscores>
#
# Phases:
#   1) Build any project that has a build target (sf-tsconfig has none —
#      run-many silently skips it; sf-eslint-config rebuilds its dist).
#   2) Start Verdaccio in background and wait for /-/ping.
#   3) Publish via `nx release publish` to the local registry; verify each
#      tarball is reachable before any consumer runs.
#   4) For each package, scaffold an isolated consumer in a tmp dir, assert
#      isolation explicitly (registry + userconfig + no inherited
#      strict-peer-dependencies), then run the per-package proof.
#   5) Print per-package report.
#   6) Cleanup (trap-driven, also on Ctrl-C / failure).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REGISTRY_PORT=4873
REGISTRY_URL="http://localhost:${REGISTRY_PORT}"
SMOKE_DIR="$(mktemp -d -t sf-smoke-XXXXXX)"
REGISTRY_PID=""

PACKAGES=(sf-tsconfig sf-eslint-config)

REPORT_FILE="${SMOKE_DIR}/report.tsv"
: > "$REPORT_FILE"

log()    { printf '\n==> %s\n' "$*"; }
info()   { printf '    %s\n' "$*"; }
die()    { printf '    FAIL: %s\n' "$*" >&2; exit 1; }
report() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$REPORT_FILE"; }

cleanup() {
  local rc=$?
  log "Cleanup"
  if [[ -n "$REGISTRY_PID" ]] && kill -0 "$REGISTRY_PID" 2>/dev/null; then
    info "killing Verdaccio (pid=$REGISTRY_PID)"
    kill "$REGISTRY_PID" 2>/dev/null || true
    wait "$REGISTRY_PID" 2>/dev/null || true
  fi
  info "removing ${SMOKE_DIR}"
  rm -rf "$SMOKE_DIR"
  info "removing tmp/local-registry/storage"
  rm -rf "${ROOT}/tmp/local-registry/storage"
  exit "$rc"
}
trap cleanup EXIT INT TERM

# ----- shared phases ----------------------------------------------------------

build_all() {
  log "1) Build any project with a build target (sf-tsconfig has none — skipped)"
  pnpm exec nx run-many -t build
}

setup_registry() {
  log "2) Start Verdaccio in background on ${REGISTRY_URL}"
  pnpm exec nx run @scout-fabric/source:local-registry \
    > "${SMOKE_DIR}/verdaccio.log" 2>&1 &
  REGISTRY_PID=$!
  info "pid=$REGISTRY_PID, log=${SMOKE_DIR}/verdaccio.log"

  log "3) Wait for registry to respond"
  local i
  for i in $(seq 1 60); do
    if curl -sf "${REGISTRY_URL}/-/ping" >/dev/null 2>&1; then
      info "ready after ${i}s"
      return
    fi
    sleep 1
  done
  cat "${SMOKE_DIR}/verdaccio.log"
  die "Verdaccio did not come up in 60s"
}

publish_all() {
  log "4) Publish via nx release publish --registry=${REGISTRY_URL}"
  # Throwaway .npmrc for publish — isolates from repo's strict-peer-dependencies.
  cat > "${SMOKE_DIR}/publish.npmrc" <<EOF
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
registry=${REGISTRY_URL}
EOF
  NPM_CONFIG_USERCONFIG="${SMOKE_DIR}/publish.npmrc" \
    pnpm exec nx release publish --registry="${REGISTRY_URL}" --tag=latest

  log "4b) Verify each tarball is reachable in the registry"
  local pkg full status
  for pkg in "${PACKAGES[@]}"; do
    full="@fabio.caffarello/${pkg}"
    # registry URL-encodes the scope slash as %2f.
    status=$(curl -s -o /dev/null -w '%{http_code}' \
      "${REGISTRY_URL}/${full//\//%2f}")
    if [[ "$status" != "200" ]]; then
      die "registry returned HTTP ${status} for ${full}"
    fi
    info "${full} → HTTP 200"
    report "$pkg" "published" "HTTP 200 at ${REGISTRY_URL}/${full}"
  done
}

# scaffold_consumer <name> — creates ${SMOKE_DIR}/consumer-<name> with .npmrc
# pointing only at Verdaccio, writes a minimal package.json, asserts
# isolation, and leaves cwd at the consumer dir. The cd MUST happen before
# any `npm` call, otherwise npm reads the workspace's project-level .npmrc
# (which has strict-peer-dependencies=true) and isolation is bogus.
scaffold_consumer() {
  local name="$1"
  local dir="${SMOKE_DIR}/consumer-${name}"
  local npmrc="${dir}/.npmrc"
  mkdir -p "$dir"
  cat > "$npmrc" <<EOF
@fabio.caffarello:registry=${REGISTRY_URL}
registry=${REGISTRY_URL}
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
EOF
  cat > "${dir}/package.json" <<EOF
{
  "name": "sf-${name}-smoke-consumer",
  "version": "0.0.0",
  "private": true
}
EOF

  # cd BEFORE any npm call — see comment at top of function.
  cd "$dir"

  info "consumer dir: ${dir}"
  info "isolation asserts (via --userconfig=${npmrc}):"

  local effective_registry effective_userconfig effective_strict
  effective_registry=$(npm config get registry --userconfig="$npmrc")
  effective_userconfig=$(npm config get userconfig --userconfig="$npmrc")
  effective_strict=$(npm config get strict-peer-dependencies --userconfig="$npmrc")

  info "    registry                 = ${effective_registry}"
  info "    userconfig               = ${effective_userconfig}"
  info "    strict-peer-dependencies = ${effective_strict:-(unset)}"

  [[ "$effective_registry" == "${REGISTRY_URL}"* ]] \
    || die "consumer registry='${effective_registry}', expected ${REGISTRY_URL}"
  [[ "$effective_userconfig" == "$npmrc" ]] \
    || die "consumer userconfig='${effective_userconfig}', expected ${npmrc}"
  [[ "$effective_strict" != "true" ]] \
    || die "consumer inherited strict-peer-dependencies=true"
}

# ----- per-package proofs -----------------------------------------------------

prove_sf_tsconfig() {
  log "Prove sf-tsconfig — JSON-only contract"
  scaffold_consumer tsconfig
  local dir="${SMOKE_DIR}/consumer-tsconfig"
  local npmrc="${dir}/.npmrc"

  info "install @fabio.caffarello/sf-tsconfig + typescript"
  if ! npm install --userconfig="$npmrc" \
       @fabio.caffarello/sf-tsconfig typescript \
       > "${SMOKE_DIR}/install-tsconfig.log" 2>&1; then
    cat "${SMOKE_DIR}/install-tsconfig.log"
    die "install failed"
  fi

  local v
  v=$(node -p "require('@fabio.caffarello/sf-tsconfig/package.json').version")
  info "installed sf-tsconfig version: $v"
  report sf-tsconfig "installed-version" "$v"

  # JSON-only contract: there must be no dist/ in the installed tree.
  info "assert no dist/ in installed package (JSON-only contract)"
  if [[ -d "node_modules/@fabio.caffarello/sf-tsconfig/dist" ]]; then
    die "sf-tsconfig leaked a dist/ to the consumer"
  fi
  local files
  files=$(cd node_modules/@fabio.caffarello/sf-tsconfig && ls | tr '\n' ' ')
  info "installed files: ${files}"
  local expected
  for expected in base.json lib.json package.json README.md; do
    [[ -f "node_modules/@fabio.caffarello/sf-tsconfig/$expected" ]] \
      || die "missing $expected in installed sf-tsconfig"
  done
  report sf-tsconfig "files-installed" "$files"

  # Minimal tsconfig + src.
  mkdir -p src
  echo "export {};" > src/index.ts
  cat > tsconfig.json <<'EOF'
{
  "extends": "@fabio.caffarello/sf-tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
EOF

  info "tsc --showConfig honours extends"
  if ! npx tsc --showConfig > "${SMOKE_DIR}/showconfig-tsconfig.json" \
        2> "${SMOKE_DIR}/showconfig-tsconfig.err"; then
    cat "${SMOKE_DIR}/showconfig-tsconfig.err"
    die "tsc --showConfig errored"
  fi
  if ! grep -q '"noUncheckedIndexedAccess": true' \
       "${SMOKE_DIR}/showconfig-tsconfig.json"; then
    die "extends did not merge noUncheckedIndexedAccess"
  fi
  report sf-tsconfig "extends-resolves" "YES (JSON-only, no JS artefact involved)"

  # Positive: violation must be caught. Exit code is the primary judge;
  # TS18048/TS2532 grep is corroboration.
  info "positive: noUncheckedIndexedAccess catches arr[0].toFixed"
  cat > src/index.ts <<'EOF'
const arr: number[] = [1, 2, 3];
const x = arr[0];
x.toFixed(2);
EOF
  if npx tsc --noEmit > "${SMOKE_DIR}/tsc-violation.log" 2>&1; then
    cat "${SMOKE_DIR}/tsc-violation.log"
    die "tsc passed when it should have caught noUncheckedIndexedAccess"
  fi
  if grep -qE "TS(2532|18048)" "${SMOKE_DIR}/tsc-violation.log"; then
    info "exit≠0 (primary); TS18048/TS2532 present (corroboration)"
    report sf-tsconfig "positive-test" "YES (exit≠0; TS18048/TS2532 present)"
  else
    info "exit≠0 (primary); rule-id text drift — first lines:"
    head -5 "${SMOKE_DIR}/tsc-violation.log" | sed 's/^/        /'
    report sf-tsconfig "positive-test" "YES (exit≠0; rule-id text drift)"
  fi

  # Control.
  info "control: guarded version passes"
  cat > src/index.ts <<'EOF'
const arr: number[] = [1, 2, 3];
const x = arr[0];
if (x !== undefined) x.toFixed(2);
EOF
  if ! npx tsc --noEmit > "${SMOKE_DIR}/tsc-control.log" 2>&1; then
    cat "${SMOKE_DIR}/tsc-control.log"
    die "control failed — false positive"
  fi
  report sf-tsconfig "control-test" "YES"

  cd "$ROOT"
}

prove_sf_eslint_config() {
  log "Prove sf-eslint-config — flat config, README peers, non-Nx consumer"
  scaffold_consumer eslint
  local dir="${SMOKE_DIR}/consumer-eslint"
  local npmrc="${dir}/.npmrc"

  # Install the package + every peer the README lists. Versions match the
  # README ranges; uplink pulls them from npm public.
  info "install sf-eslint-config + the README's peer set"
  if ! npm install --userconfig="$npmrc" \
       @fabio.caffarello/sf-eslint-config \
       'eslint@^9' \
       '@nx/eslint-plugin@^22' \
       'typescript-eslint@^8' \
       'eslint-config-prettier@^10' \
       > "${SMOKE_DIR}/install-eslint.log" 2>&1; then
    cat "${SMOKE_DIR}/install-eslint.log"
    die "install failed — peer set in README may be wrong"
  fi

  local v
  v=$(node -p "require('@fabio.caffarello/sf-eslint-config/package.json').version")
  info "installed sf-eslint-config version: $v"
  report sf-eslint-config "installed-version" "$v"

  # Non-Nx consumer assert: the consumer did not set up an Nx workspace.
  # We do NOT assert absence of node_modules/nx — it is a transitive of
  # @nx/eslint-plugin's own dep tree (via @nx/js), which is a property of
  # that plugin, not a leak from our package. The operational proof that
  # the consumer is genuinely non-Nx-functional comes from the eslint
  # runs below: if any of them errored out asking for Nx context, the
  # plugin would surface "Could not find project graph" or similar, and
  # our missing-peer assertion would catch it.
  info "assert non-Nx consumer (no nx.json; transitive node_modules/nx tolerated)"
  if [[ -f "nx.json" ]]; then
    die "nx.json present — not a clean non-Nx consumer"
  fi
  local nx_transitive="absent"
  [[ -d "node_modules/nx" ]] && nx_transitive="present (transitive via @nx/eslint-plugin)"
  info "    nx.json                  = absent"
  info "    node_modules/nx          = ${nx_transitive}"
  report sf-eslint-config "non-Nx-consumer" "YES (no nx.json; nx ${nx_transitive})"

  # Flat config: just spread the published default.
  cat > eslint.config.mjs <<'EOF'
import sf from '@fabio.caffarello/sf-eslint-config';
export default [...sf];
EOF

  mkdir -p src
  cat > src/bad-eq.js <<'EOF'
const a = 1;
const b = '1';
if (a == b) { throw new Error('bad'); }
EOF
  cat > src/bad-console.js <<'EOF'
console.log('hello');
EOF
  cat > src/good.js <<'EOF'
const a = 1;
const b = '1';
if (a === b) { throw new Error('ok'); }
console.warn('allowed');
console.error('allowed');
EOF

  # Positive: eqeqeq.
  info "positive (eqeqeq): src/bad-eq.js"
  if npx eslint src/bad-eq.js > "${SMOKE_DIR}/eslint-bad-eq.log" 2>&1; then
    cat "${SMOKE_DIR}/eslint-bad-eq.log"
    die "eslint passed on bad-eq.js (should have failed)"
  fi
  if grep -q "eqeqeq" "${SMOKE_DIR}/eslint-bad-eq.log"; then
    info "exit≠0 (primary); ruleId 'eqeqeq' present (corroboration)"
    report sf-eslint-config "positive-eqeqeq" "YES (exit≠0; ruleId mentioned)"
  else
    info "exit≠0 (primary); ruleId text drift"
    report sf-eslint-config "positive-eqeqeq" "YES (exit≠0; ruleId text drift)"
  fi

  # Positive: no-console on console.log. The published rule is `warn`
  # level, so a vanilla `eslint` run exits 0 with a warning printed —
  # which would defeat the "exit code is primary" principle. Use
  # --max-warnings=0 to convert warnings into failures, the standard CI
  # idiom; the published rule severity (warn) is unchanged.
  info "positive (no-console, --max-warnings=0): src/bad-console.js"
  if npx eslint --max-warnings=0 src/bad-console.js \
       > "${SMOKE_DIR}/eslint-bad-console.log" 2>&1; then
    cat "${SMOKE_DIR}/eslint-bad-console.log"
    die "eslint passed on bad-console.js (should have failed via --max-warnings=0)"
  fi
  if grep -q "no-console" "${SMOKE_DIR}/eslint-bad-console.log"; then
    info "exit≠0 (primary); ruleId 'no-console' present (corroboration)"
    report sf-eslint-config "positive-no-console" "YES (exit≠0; ruleId mentioned)"
  else
    info "exit≠0 (primary); ruleId text drift"
    report sf-eslint-config "positive-no-console" "YES (exit≠0; ruleId text drift)"
  fi

  # Control: good.js passes (and proves console.warn/error are allowed).
  info "control: src/good.js"
  if ! npx eslint src/good.js > "${SMOKE_DIR}/eslint-good.log" 2>&1; then
    cat "${SMOKE_DIR}/eslint-good.log"
    die "control failed — false positive on src/good.js"
  fi
  report sf-eslint-config "control-test" "YES"

  # No missing-peer errors in any of the eslint runs above. If any peer is
  # absent, eslint emits "Cannot find module" / "Failed to load plugin" /
  # "Could not load parser" — that means the README peer list is wrong.
  info "assert no missing-peer errors in any eslint run"
  cat "${SMOKE_DIR}"/eslint-bad-eq.log \
      "${SMOKE_DIR}"/eslint-bad-console.log \
      "${SMOKE_DIR}"/eslint-good.log \
      > "${SMOKE_DIR}/eslint-all.log"
  if grep -qiE "Cannot find module|Failed to load plugin|Could not load parser|MODULE_NOT_FOUND" \
       "${SMOKE_DIR}/eslint-all.log"; then
    grep -iE "Cannot find module|Failed to load plugin|Could not load parser|MODULE_NOT_FOUND" \
      "${SMOKE_DIR}/eslint-all.log" | sed 's/^/        /'
    die "peer missing — fix README/manifest, do not patch the consumer"
  fi
  report sf-eslint-config "peers-from-README-sufficient" "YES"

  # Factory-only rule must not leak into the published config.
  info "assert enforce-module-boundaries did not leak"
  if grep -q "enforce-module-boundaries" "${SMOKE_DIR}/eslint-all.log"; then
    grep "enforce-module-boundaries" "${SMOKE_DIR}/eslint-all.log" \
      | head -3 | sed 's/^/        /'
    die "factory rule leaked — harden the package, do not patch the consumer"
  fi
  report sf-eslint-config "no-factory-leak" "YES (enforce-module-boundaries absent)"

  cd "$ROOT"
}

# ----- report -----------------------------------------------------------------

print_report() {
  log "Per-package report"
  local pkg
  for pkg in "${PACKAGES[@]}"; do
    printf '\n  %s\n' "$pkg"
    awk -v p="$pkg" -F'\t' '$1 == p { printf "    %-32s : %s\n", $2, $3 }' \
      "$REPORT_FILE"
  done
}

# ----- main -------------------------------------------------------------------

build_all
setup_registry
publish_all

for pkg in "${PACKAGES[@]}"; do
  fn="prove_${pkg//-/_}"
  "$fn"
done

print_report
log "ALL CHECKS PASSED"
