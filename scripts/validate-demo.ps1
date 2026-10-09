<#
.SYNOPSIS
  FinOps Command Center — pre-demo readiness check (Windows / PowerShell).
.DESCRIPTION
  Verifies Node.js, dependencies, demo mode, seed-data validation, tests, type check, lint,
  production build, every route, and that the demo bypass is disabled in pilot mode.
  Non-destructive: it does not modify source files or contact external services.
.EXAMPLE
  ./scripts/validate-demo.ps1
  ./scripts/validate-demo.ps1 -Quick
#>
param([switch]$Quick)
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "  x Node.js not found. Install Node.js 20.9+ (LTS) from https://nodejs.org" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "node_modules/next")) {
  Write-Host "  Dependencies missing - running npm install..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -ne 0) { exit 1 }
}
$nodeArgs = @("scripts/validate-demo.mjs")
if ($Quick) { $nodeArgs += "--quick" }
& node @nodeArgs
exit $LASTEXITCODE
