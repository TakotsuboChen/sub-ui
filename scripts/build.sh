#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
pushd web >/dev/null
pnpm install
pnpm typecheck
pnpm build
popd >/dev/null

rm -rf webdist/dist
mkdir -p webdist/dist
echo "keep" > webdist/dist/.gitkeep
cp -r web/dist/* webdist/dist/

CGO_ENABLED=0 go build -ldflags="-s -w" -o sub-ui .
echo "Built ./sub-ui successfully!"
