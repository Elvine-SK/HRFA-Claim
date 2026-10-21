#!/usr/bin/env bash
# Builds build/hr-fam-<sha>.tar.gz for the testing server (PM2). Run from anywhere inside the repo.
#   tooling/deploy/bundle.sh --hrm-login-url https://hrm.example/login
# The bundle holds real copies of everything it runs (platform packages are linked from ../nelvine-platform
# in development). Native packages (argon2, esbuild) are built for the OS of the machine that runs this
# script: build on the same OS and CPU as the server (Linux x64), or the API will not start there.
set -euo pipefail

HRM_LOGIN_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --hrm-login-url) HRM_LOGIN_URL="${2:-}"; shift 2 ;;
    --hrm-login-url=*) HRM_LOGIN_URL="${1#*=}"; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$HRM_LOGIN_URL" ]; then
  echo "usage: bundle.sh --hrm-login-url <URL of the HRM login page>" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# 1. Clean working tree (tracked changes, and untracked files under apps/ and tooling/)
if [ -n "$(git status --porcelain --untracked-files=no)" ] || [ -n "$(git ls-files --others --exclude-standard apps tooling)" ]; then
  echo "working tree is not clean: commit or stash first" >&2
  git status --short >&2
  exit 1
fi
SHA="$(git rev-parse --short HEAD)"

echo "== install"
pnpm install --frozen-lockfile
echo "== typecheck"
pnpm run typecheck

echo "== build web (NUXT_PUBLIC_HRM_LOGIN_URL=$HRM_LOGIN_URL)"
rm -rf apps/web/.output
(cd apps/web && NUXT_PUBLIC_HRM_LOGIN_URL="$HRM_LOGIN_URL" pnpm exec nuxt build)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/hr-fam-$SHA"
mkdir -p "$OUT/apps/web" "$OUT/docs"

# `pnpm deploy --prod` cannot be used: it does not copy packages linked from ../nelvine-platform. The
# script walks the production dependencies of the API from the workspace install instead.
echo "== assemble api (production dependencies, tsx, real copies)"
node "$ROOT/tooling/deploy/assemble-api.mjs" "$ROOT/apps/api" "$OUT/apps/api"
echo "== assemble web"
cp -rL apps/web/.output "$OUT/apps/web/.output"
cp ecosystem.config.cjs "$OUT/"
cp docs/deploy-testing.md "$OUT/docs/"


echo "== checks"
LINKS="$(find "$OUT" -type l)"
if [ -n "$LINKS" ]; then
  echo "symbolic links in the bundle:" >&2
  echo "$LINKS" | head -20 >&2
  exit 1
fi
BAD="$(grep -rl --include=package.json -e '"link:' -e 'link:C:' -e 'link:/' "$OUT" 2>/dev/null || true)"
if [ -n "$BAD" ]; then
  echo "package.json with link: in the bundle:" >&2
  echo "$BAD" | head -20 >&2
  exit 1
fi
[ -f "$OUT/apps/api/node_modules/tsx/package.json" ] || { echo "tsx missing from the bundle" >&2; exit 1; }
[ -f "$OUT/apps/web/.output/server/index.mjs" ] || { echo "web build missing" >&2; exit 1; }

mkdir -p "$ROOT/build"
TARBALL="$ROOT/build/hr-fam-$SHA.tar.gz"
tar -czf "$TARBALL" -C "$TMP" "hr-fam-$SHA"
echo "== done: $TARBALL ($(du -h "$TARBALL" | cut -f1)), built on $(uname -s)"
