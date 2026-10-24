#Requires -Version 5.1
$ErrorActionPreference = "Stop"
Get-Command pnpm -ErrorAction Stop | Out-Null

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Phase 12: Mobile Polish & Monorepo Verification Test    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "`n[1] Running mobile TypeScript typecheck..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
pnpm --filter @sp/mobile typecheck
$checkExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($checkExit -ne 0) { Write-Error "Mobile typecheck failed ($checkExit)."; exit $checkExit }
Write-Host "    [OK] Mobile typecheck passed!" -ForegroundColor Green

Write-Host "`n[2] Running full monorepo verification (all packages, tests)..." -ForegroundColor Cyan
$ErrorActionPreference = "Continue"
pnpm verify
$checkExit = $LASTEXITCODE
$ErrorActionPreference = "Stop"
if ($checkExit -ne 0) { Write-Error "Monorepo verification failed ($checkExit)."; exit $checkExit }
Write-Host "    [OK] All monorepo tests and typechecks passed!" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  AUTOMATED CHECKS PASSED - LIVE GATES STILL REQUIRED              " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
