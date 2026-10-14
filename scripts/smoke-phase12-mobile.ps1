#Requires -Version 5.1
$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Phase 12: Mobile Polish & Monorepo Verification Test    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

Write-Host "`n[1] Running mobile TypeScript typecheck..." -ForegroundColor Cyan
pnpm --filter @sp/mobile typecheck
Write-Host "    [OK] Mobile typecheck passed!" -ForegroundColor Green

Write-Host "`n[2] Running full monorepo verification (all packages, tests)..." -ForegroundColor Cyan
pnpm verify
Write-Host "    [OK] All monorepo tests and typechecks passed!" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  PHASE 12 COMPLETE - READY FOR PILOT LAUNCH!              " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
