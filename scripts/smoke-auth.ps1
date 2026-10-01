#Requires -Version 5.1
# End-to-end auth smoke test: sign in (or sign up) on Supabase, then call YOUR local API.
# Start the API first in another window:  pnpm --filter @sp/api dev
param([string]$ApiUrl = "http://localhost:4000")
$ErrorActionPreference = "Stop"
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path -LiteralPath $envFile)) { throw ".env not found at $envFile" }
$cfg = @{}
Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"') } }
$base = "$($cfg['SUPABASE_URL'])".TrimEnd('/'); $key = $cfg['SUPABASE_PUBLISHABLE_KEY']
if (-not $base -or -not $key) { throw "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing in .env" }

$email = Read-Host "Test email (use a real inbox you can open)"
$sec = Read-Host "Test password (min 8 chars)" -AsSecureString
$pw = [System.Net.NetworkCredential]::new("", $sec).Password
$h = @{ apikey = $key; "Content-Type" = "application/json" }
$body = @{ email = $email; password = $pw } | ConvertTo-Json

function Status([scriptblock]$Call) { try { & $Call | Out-Null; return 200 } catch { return [int]$_.Exception.Response.StatusCode } }

Write-Host "`n[1] Supabase sign-in" -ForegroundColor Cyan
try { $t = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $h -Body $body }
catch {
    Write-Host "  Sign-in failed (new user?). Trying sign-up..." -ForegroundColor Yellow
    $s = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" -Headers $h -Body $body
    if ($s.access_token) { $t = $s }
    else { Write-Host "  Sign-up OK. Email confirmation is ON: open the email, click the link, then run this script again." -ForegroundColor Yellow; return }
}
Write-Host "  OK: got an access token" -ForegroundColor Green
$auth = @{ Authorization = "Bearer $($t.access_token)" }

Write-Host "[2] GET /me with token (expect 200)" -ForegroundColor Cyan
$me = Invoke-RestMethod -Uri "$ApiUrl/me" -Headers $auth
Write-Host ("  OK: id={0} email={1} roles={2}" -f $me.id, $me.email, ($me.roles -join ",")) -ForegroundColor Green

Write-Host "[3] GET /me without token (expect 401)" -ForegroundColor Cyan
$c = Status { Invoke-RestMethod -Uri "$ApiUrl/me" }
if ($c -eq 401) { Write-Host "  OK: 401" -ForegroundColor Green } else { throw "Expected 401 but got $c" }

Write-Host "[4] GET /me with a tampered token (expect 401)" -ForegroundColor Cyan
$c = Status { Invoke-RestMethod -Uri "$ApiUrl/me" -Headers @{ Authorization = "Bearer $($t.access_token)x" } }
if ($c -eq 401) { Write-Host "  OK: 401" -ForegroundColor Green } else { throw "Expected 401 but got $c" }

Write-Host "[5] GET /me/sessions" -ForegroundColor Cyan
$ses = Invoke-RestMethod -Uri "$ApiUrl/me/sessions" -Headers $auth
Write-Host ("  OK: {0} active session(s); current={1}" -f @($ses.sessions).Count, (@($ses.sessions | Where-Object { $_.current }).Count -eq 1)) -ForegroundColor Green

Write-Host "`nALL AUTH SMOKE CHECKS PASSED" -ForegroundColor Green
