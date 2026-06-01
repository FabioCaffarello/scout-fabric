#!/usr/bin/env bash
# Smoke test for the publish → install → use cycle of @fabio.caffarello/sf-*
# packages, running entirely against a local Verdaccio. Never touches npmjs.
#
# Phases:
#   1) Build the package via tsc (NOT vite — sf-tsconfig publishes JSON + stub).
#   2) Start Verdaccio in background.
#   3) Publish via `nx release publish` to the local registry.
#   4) Stand up a disposable consumer in a tmp dir, isolated from the
#      repo's .npmrc by using --userconfig with its own .npmrc.
#   5) Install @fabio.caffarello/sf-tsconfig + typescript from Verdaccio.
#   6) Positive test: tsc --showConfig honors the inherited base.json.
#   7) Behavioural test: a `noUncheckedIndexedAccess` violation must fail
#      (proves the published config actually changes consumer's tsc).
#   8) Control test: the fixed version of the same file must pass
#      (guards against celebrating failure for the wrong reason).
#   9) Tear everything down.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REGISTRY_PORT=4873
REGISTRY_URL="http://localhost:${REGISTRY_PORT}"
SMOKE_DIR="$(mktemp -d -t sf-smoke-XXXXXX)"
NPMRC="${SMOKE_DIR}/.npmrc"
REGISTRY_PID=""

log()  { printf '\n==> %s\n' "$*"; }
info() { printf '    %s\n' "$*"; }

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

log "1) Build sf-tsconfig (tsc --build tsconfig.lib.json)"
pnpm exec nx run sf-tsconfig:build

log "2) Start Verdaccio in background on ${REGISTRY_URL}"
pnpm exec nx run @scout-fabric/source:local-registry \
  > "${SMOKE_DIR}/verdaccio.log" 2>&1 &
REGISTRY_PID=$!
info "pid=$REGISTRY_PID, log=${SMOKE_DIR}/verdaccio.log"

log "3) Wait for registry to respond"
for i in $(seq 1 60); do
  if curl -sf "${REGISTRY_URL}/-/ping" >/dev/null 2>&1; then
    info "ready after ${i}s"
    break
  fi
  sleep 1
  if [[ $i -eq 60 ]]; then
    info "Verdaccio did not come up in 60s"
    cat "${SMOKE_DIR}/verdaccio.log"
    exit 1
  fi
done

log "4) Publish via nx release publish --registry=${REGISTRY_URL}"
# Use a throwaway .npmrc so the publish itself is isolated from the repo's
# strict-peer-dependencies settings. The fake auth token is accepted by
# Verdaccio because the config grants $all on publish.
cat > "${SMOKE_DIR}/publish.npmrc" <<EOF
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
registry=${REGISTRY_URL}
EOF
NPM_CONFIG_USERCONFIG="${SMOKE_DIR}/publish.npmrc" \
  pnpm exec nx release publish --registry="${REGISTRY_URL}" --tag=latest

log "5) Stand up disposable consumer in ${SMOKE_DIR}/consumer"
mkdir -p "${SMOKE_DIR}/consumer"
cd "${SMOKE_DIR}/consumer"
cat > "$NPMRC" <<EOF
@fabio.caffarello:registry=${REGISTRY_URL}
registry=${REGISTRY_URL}
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
EOF
cat > package.json <<'EOF'
{
  "name": "sf-tsconfig-consumer-smoke",
  "version": "0.0.0",
  "private": true
}
EOF
info "consumer .npmrc:"
sed 's/^/        /' "$NPMRC"
info "registry in effect:"
npm config get registry --userconfig="$NPMRC" | sed 's/^/        /'

log "6) Install @fabio.caffarello/sf-tsconfig + typescript from Verdaccio"
npm install --userconfig="$NPMRC" \
  @fabio.caffarello/sf-tsconfig typescript >/dev/null 2>&1
info "installed:"
ls node_modules/@fabio.caffarello | sed 's/^/        /'
info "tsconfig version:"
node -p "require('@fabio.caffarello/sf-tsconfig/package.json').version" \
  | sed 's/^/        /'

log "7) tsc --showConfig honors extends"
mkdir -p src
# tsc --showConfig refuses to run without at least one input matching include.
echo "export {};" > src/index.ts
cat > tsconfig.json <<'EOF'
{
  "extends": "@fabio.caffarello/sf-tsconfig/base.json",
  "include": ["src/**/*.ts"]
}
EOF
npx tsc --showConfig > "${SMOKE_DIR}/showconfig.json" 2> "${SMOKE_DIR}/showconfig.err" || {
  info "FAIL: tsc --showConfig errored"
  cat "${SMOKE_DIR}/showconfig.err"
  exit 1
}
info "slice of effective config:"
grep -E '"(strict|noUncheckedIndexedAccess|target|module|moduleResolution)"' \
  "${SMOKE_DIR}/showconfig.json" | sed 's/^/        /' || true
if ! grep -q '"noUncheckedIndexedAccess": true' "${SMOKE_DIR}/showconfig.json"; then
  info "FAIL: extends did not merge noUncheckedIndexedAccess from base.json"
  sed 's/^/        /' "${SMOKE_DIR}/showconfig.json"
  exit 1
fi
info "OK: noUncheckedIndexedAccess: true present in merged config"

log "8) Behavioural test: noUncheckedIndexedAccess must catch the violation"
# Replace the placeholder with code that violates the published flag.
cat > src/index.ts <<'EOF'
const arr: number[] = [1, 2, 3];
const x = arr[0];
x.toFixed(2); // expected to fail under noUncheckedIndexedAccess
EOF
# Drive tsc via the tsconfig (no file args → no TS5112).
if npx tsc --noEmit > "${SMOKE_DIR}/tsc-violation.log" 2>&1; then
  info "FAIL: tsc unexpectedly passed — noUncheckedIndexedAccess not active"
  cat "${SMOKE_DIR}/tsc-violation.log"
  exit 1
fi
if grep -qE "TS(2532|18048)" "${SMOKE_DIR}/tsc-violation.log"; then
  info "OK: violation caught"
  grep -E "TS(2532|18048)" "${SMOKE_DIR}/tsc-violation.log" \
    | head -3 | sed 's/^/        /'
else
  info "FAIL: tsc errored, but not for the expected reason"
  cat "${SMOKE_DIR}/tsc-violation.log"
  exit 1
fi

log "9) Control test: fixed version must pass"
cat > src/index.ts <<'EOF'
const arr: number[] = [1, 2, 3];
const x = arr[0];
if (x !== undefined) x.toFixed(2);
EOF
if npx tsc --noEmit > "${SMOKE_DIR}/tsc-control.log" 2>&1; then
  info "OK: control passes (no false positive)"
else
  info "FAIL: control should have passed"
  cat "${SMOKE_DIR}/tsc-control.log"
  exit 1
fi

log "ALL CHECKS PASSED"
