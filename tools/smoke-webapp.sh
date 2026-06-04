#!/usr/bin/env bash
# Smoke test for the entrada → app cycle of sf-plugin:webapp.
#
# Proves that the generator (delegation to create-next-app + harness for
# RDS integration) produces a Next.js app that installs, lints, builds,
# and renders the RDS at runtime. The Tree-test in webapp.spec.ts proves
# the harness against a captured fixture; this script is the judge of
# defaultRunCreateNextApp — the one function the unit test cannot cover
# (subprocess that writes to disk).
#
# Phases:
#   1) Build the factory packages (sf-tsconfig, sf-eslint-config, sf-plugin).
#   2) Start a local Verdaccio (same posture a real consumer would have).
#   3) Publish the factory packages to Verdaccio. sf-eslint-config is a
#      transitive dep of the generated webapp's eslint.config.mjs.
#   4) Scaffold an isolated workspace host in mktemp — .npmrc local,
#      assert isolation by `npm config get`, not by directory location.
#   5) Install nx + sf-plugin in the host.
#   6) Run `nx g @fabio.caffarello/sf-plugin:webapp ...` — exercises
#      defaultRunCreateNextApp (the real CNA spawns here) + the harness.
#   7) Confirm CNA 16.2.7 pinning in the generated package.json (deterministic
#      across machines; `pnpm dlx` cache MUST NOT silently promote).
#   8) `pnpm install` in the generated webapp, with .npmrc pointing at
#      Verdaccio (resolves @fabio.caffarello/sf-eslint-config — the
#      harness composed it into eslint.config.mjs).
#   9) `pnpm exec next build` — must pass.
#  10) `pnpm exec eslint .` — must pass (composed config: next + sf).
#  11) Behavioral assertion: RDS semantic classes appear in the prerendered
#      HTML / .next/ output — proof of runtime integration, not just
#      declared dep.
#  12) Control assertions: Geist fonts and Vercel-marketing boilerplate
#      ABSENT in the build output — proves the harness overwrote what it
#      claims to overwrite.
#  13) Cleanup: trap-driven, also on Ctrl-C / failure.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REGISTRY_PORT=4873
REGISTRY_URL="http://localhost:${REGISTRY_PORT}"
SMOKE_DIR="$(mktemp -d -t sf-webapp-smoke-XXXXXX)"
REGISTRY_PID=""

log()    { printf '\n==> %s\n' "$*"; }
info()   { printf '    %s\n' "$*"; }
die()    { printf '    FAIL: %s\n' "$*" >&2; exit 1; }

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

# ----- phases ----------------------------------------------------------------

build_all() {
  log "1) Build factory packages (sf-tsconfig has no build target — skipped silently)"
  pnpm exec nx run-many -t build
}

setup_registry() {
  log "2) Start Verdaccio in background on ${REGISTRY_URL}"
  pnpm exec nx run @scout-fabric/source:local-registry \
    > "${SMOKE_DIR}/verdaccio.log" 2>&1 &
  REGISTRY_PID=$!
  info "pid=$REGISTRY_PID, log=${SMOKE_DIR}/verdaccio.log"

  log "3a) Wait for registry to respond"
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

publish_factory() {
  log "3b) Publish factory packages via nx release publish --registry=${REGISTRY_URL}"
  cat > "${SMOKE_DIR}/publish.npmrc" <<EOF
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
registry=${REGISTRY_URL}
EOF
  NPM_CONFIG_USERCONFIG="${SMOKE_DIR}/publish.npmrc" \
    pnpm exec nx release publish --registry="${REGISTRY_URL}" --tag=latest \
    > "${SMOKE_DIR}/publish.log" 2>&1 \
    || { cat "${SMOKE_DIR}/publish.log"; die "nx release publish failed"; }

  log "3c) Verify the three packages we need are reachable in Verdaccio"
  local pkg full status
  for pkg in sf-tsconfig sf-eslint-config sf-plugin; do
    full="@fabio.caffarello/${pkg}"
    status=$(curl -s -o /dev/null -w '%{http_code}' \
      "${REGISTRY_URL}/${full//\//%2f}")
    if [[ "$status" != "200" ]]; then
      die "registry returned HTTP ${status} for ${full}"
    fi
    info "${full} → HTTP 200"
  done
}

# scaffold_host — creates ${SMOKE_DIR}/host with .npmrc pointing only at
# Verdaccio, asserts isolation by `npm config get` (not by directory
# location), and `cd`s into the dir. cd MUST happen before any `npm`/`pnpm`
# call so the per-project .npmrc is honored.
scaffold_host() {
  log "4) Scaffold isolated workspace host in ${SMOKE_DIR}/host"
  local dir="${SMOKE_DIR}/host"
  local npmrc="${dir}/.npmrc"
  mkdir -p "$dir"

  # Verdaccio for everything @fabio.caffarello/*; pnpm public via uplink.
  # auto-install-peers=true so pnpm resolves the RDS peer set automatically.
  cat > "$npmrc" <<EOF
@fabio.caffarello:registry=${REGISTRY_URL}
registry=${REGISTRY_URL}
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
auto-install-peers=true
EOF

  cat > "${dir}/package.json" <<'EOF'
{
  "name": "sf-webapp-smoke-host",
  "version": "0.0.0",
  "private": true
}
EOF

  cat > "${dir}/nx.json" <<'EOF'
{
  "$schema": "./node_modules/nx/schemas/nx-schema.json"
}
EOF

  cd "$dir"

  info "host dir: ${dir}"
  info "isolation asserts (via --userconfig=${npmrc}):"

  local effective_registry effective_userconfig
  effective_registry=$(npm config get registry --userconfig="$npmrc")
  effective_userconfig=$(npm config get userconfig --userconfig="$npmrc")

  info "    registry   = ${effective_registry}"
  info "    userconfig = ${effective_userconfig}"

  [[ "$effective_registry" == "${REGISTRY_URL}"* ]] \
    || die "host registry='${effective_registry}', expected ${REGISTRY_URL}"
  [[ "$effective_userconfig" == "$npmrc" ]] \
    || die "host userconfig='${effective_userconfig}', expected ${npmrc}"

  # The factory has strict-peer-dependencies=true; the host must NOT
  # inherit it (would block the auto-install-peers we use here).
  local effective_strict
  effective_strict=$(npm config get strict-peer-dependencies --userconfig="$npmrc")
  [[ "$effective_strict" != "true" ]] \
    || die "host inherited strict-peer-dependencies=true"
  info "    strict-peer-dependencies = ${effective_strict:-(unset)}"
}

install_plugin_in_host() {
  log "5) pnpm install nx + @fabio.caffarello/sf-plugin in host"
  pnpm install \
    nx@22.7.5 \
    @nx/devkit@22.7.5 \
    @fabio.caffarello/sf-plugin@latest \
    > "${SMOKE_DIR}/install-host.log" 2>&1 \
    || { cat "${SMOKE_DIR}/install-host.log"; die "host install failed"; }

  local v
  v=$(node -p "require('@fabio.caffarello/sf-plugin/package.json').version")
  info "installed sf-plugin version: $v"
}

run_generator() {
  log "6) Run nx g @fabio.caffarello/sf-plugin:webapp"
  # The generator's defaultRunCreateNextApp spawns `pnpm dlx create-next-app@16.2.7`
  # which downloads + runs the real CNA. Subprocess inherits stdio so its
  # output ends up in our log.
  pnpm exec nx g @fabio.caffarello/sf-plugin:webapp \
       --name=hello-rds --directory=apps/hello-rds --no-interactive \
       > "${SMOKE_DIR}/generate.log" 2>&1 \
    || { cat "${SMOKE_DIR}/generate.log"; die "generator failed"; }

  [[ -d apps/hello-rds ]] \
    || die "generator did not create apps/hello-rds"
  [[ -f apps/hello-rds/src/app/providers.tsx ]] \
    || die "harness did not create providers.tsx — composition broke"
  info "generator ran. Output dir: ${SMOKE_DIR}/host/apps/hello-rds"
}

assert_cna_pinning() {
  log "7) Confirm exact create-next-app@16.2.7 pinning (no silent promotion)"

  # The webapp's package.json has `next` as a direct dependency; CNA writes
  # the version it installed. If `pnpm dlx` resolved a non-pinned CNA, the
  # `next` version here would drift. The CNA writes the exact Next version
  # matching its own version: CNA 16.2.7 → next 16.2.7.
  local next_version
  next_version=$(node -p "require('./apps/hello-rds/package.json').dependencies.next")
  info "next version in generated package.json: ${next_version}"
  [[ "$next_version" == "16.2.7" ]] \
    || die "next version is ${next_version}, expected 16.2.7 — CNA pinning may be broken"

  # eslint-config-next is also pinned by CNA to its own version.
  local eslint_next_version
  eslint_next_version=$(node -p "require('./apps/hello-rds/package.json').devDependencies['eslint-config-next']")
  info "eslint-config-next version: ${eslint_next_version}"
  [[ "$eslint_next_version" == "16.2.7" ]] \
    || die "eslint-config-next is ${eslint_next_version}, expected 16.2.7"
}

install_in_generated_webapp() {
  log "8) Install deps in generated webapp (with .npmrc → Verdaccio)"

  # The webapp's package.json declares @fabio.caffarello/sf-eslint-config in
  # devDependencies (the harness added it). That package isn't on npmjs yet —
  # the webapp resolves it from Verdaccio.
  cat > apps/hello-rds/.npmrc <<EOF
@fabio.caffarello:registry=${REGISTRY_URL}
//localhost:${REGISTRY_PORT}/:_authToken=fake-smoke-token
auto-install-peers=true
EOF

  cd apps/hello-rds
  pnpm install > "${SMOKE_DIR}/install-webapp.log" 2>&1 \
    || { cat "${SMOKE_DIR}/install-webapp.log"; die "webapp install failed"; }

  # Confirm the factory packages were installed from Verdaccio, not npmjs.
  local sf_eslint_version
  sf_eslint_version=$(node -p "require('@fabio.caffarello/sf-eslint-config/package.json').version" 2>/dev/null || echo "MISSING")
  info "installed @fabio.caffarello/sf-eslint-config: ${sf_eslint_version}"
  [[ "$sf_eslint_version" != "MISSING" ]] \
    || die "sf-eslint-config not installed — harness composition broken or Verdaccio resolution failed"
}

run_next_build() {
  log "9) pnpm exec next build (the prerender that proves the app composes)"
  pnpm exec next build > "${SMOKE_DIR}/build.log" 2>&1 \
    || { cat "${SMOKE_DIR}/build.log"; die "next build failed — generator template or harness is broken"; }
  info "next build OK"
}

run_eslint() {
  log "10) pnpm exec eslint . (composed config: next presets + sf-eslint-config)"
  pnpm exec eslint . > "${SMOKE_DIR}/lint.log" 2>&1 \
    || { cat "${SMOKE_DIR}/lint.log"; die "eslint failed — composed config broken"; }
  info "eslint OK"
}

assert_rds_integration() {
  log "11) Behavioral assertion — RDS classes in build output (runtime integration, §9)"

  # The harness sets <body className="bg-surface-canvas text-fg-primary"> in
  # layout.tsx, and page.tsx renders <Button> from the RDS. These produce
  # tokens that appear in either the prerendered HTML or the JS bundle.
  # The grep is recursive over the entire .next/ output.
  local hits
  hits=$(grep -rE -l 'bg-surface-canvas|text-fg-primary' .next/ 2>/dev/null || true)
  if [[ -z "$hits" ]]; then
    die "RDS semantic classes (bg-surface-canvas / text-fg-primary) not found in .next/ — harness did not integrate the RDS, or the RDS CSS bundle was not applied"
  fi
  info "RDS semantic classes found in build output:"
  printf '%s\n' "$hits" | head -5 | sed 's/^/        /'
}

assert_controls() {
  log "12) Control assertions — proves the harness overwrote, not just added"

  # The CNA template ships layout.tsx with Geist fonts (Geist_Mono import
  # from next/font/google). The harness REMOVES that. If the .next/ output
  # contains 'Geist_Mono', the harness failed to overwrite layout.tsx.
  if grep -rq 'Geist_Mono' .next/ 2>/dev/null; then
    die "Geist_Mono found in build output — harness did NOT overwrite layout.tsx; CNA template leaked"
  fi
  info "Geist_Mono absent in build (control passed)"

  # The CNA template page.tsx is a Vercel-marketing boilerplate with links
  # to vercel.com/templates. The harness REPLACES page.tsx with a Hello-RDS.
  # If the build contains 'vercel.com/templates', the harness failed.
  if grep -rq 'vercel.com/templates' .next/ 2>/dev/null; then
    die "Vercel-marketing boilerplate found in build — harness did NOT overwrite page.tsx"
  fi
  info "Vercel boilerplate absent in build (control passed)"
}

# ----- main ------------------------------------------------------------------

build_all
setup_registry
publish_factory
scaffold_host
install_plugin_in_host
run_generator
assert_cna_pinning
install_in_generated_webapp
run_next_build
run_eslint
assert_rds_integration
assert_controls

log "ALL CHECKS PASSED"
