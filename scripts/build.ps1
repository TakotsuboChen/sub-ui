$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Push-Location (Join-Path $Root "web")
pnpm install
pnpm typecheck
pnpm build
Pop-Location

$DistDst = Join-Path $Root "webdist\dist"
if (Test-Path $DistDst) { Remove-Item -Recurse -Force $DistDst }
New-Item -ItemType Directory -Force -Path $DistDst | Out-Null
Set-Content -Path (Join-Path $DistDst ".gitkeep") -Value "keep"
Copy-Item -Recurse -Force (Join-Path $Root "web\dist\*") $DistDst

Push-Location $Root
$env:CGO_ENABLED = "0"
go build -ldflags="-s -w" -o sub-ui.exe .
Pop-Location
Write-Host "Built sub-ui.exe successfully!"
