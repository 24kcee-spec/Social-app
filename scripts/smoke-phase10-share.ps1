#Requires -Version 5.1
param([string]$ApiUrl = "http://localhost:4000")
$ErrorActionPreference = "Stop"

$envFile = if (Test-Path ".env") { (Resolve-Path ".env").Path } else { Join-Path (Split-Path $PSScriptRoot -Parent) ".env" }
$cfg = @{}
Get-Content -LiteralPath $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"').Trim("'") } }
$base = "$($cfg['SUPABASE_URL'])".TrimEnd('/'); $key = $cfg['SUPABASE_PUBLISHABLE_KEY']

Write-Host "`n[1] Checking API status ($ApiUrl)..." -ForegroundColor Cyan
$h = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get; Write-Host "    [OK] API is live: $($h.status)" -ForegroundColor Green

Write-Host "[2] Authenticating test user..." -ForegroundColor Cyan
$email = Read-Host "Test email (hit Enter for default)"
if (-not $email) { $email = "n02420280y@students.nust.ac.zw" }
$sec = Read-Host "Password (min 8 chars)" -AsSecureString
$pw = [System.Net.NetworkCredential]::new("", $sec).Password
$hAuth = @{ apikey = $key; "Content-Type" = "application/json" }
$bAuth = @{ email = $email; password = $pw } | ConvertTo-Json
try { $t = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $hAuth -Body $bAuth }
catch { $t = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" -Headers $hAuth -Body $bAuth }

$auth = @{ Authorization = "Bearer $($t.access_token)"; "Content-Type" = "application/json" }

Write-Host "[3] Creating test group with generalArea..." -ForegroundColor Cyan
$acts = Invoke-RestMethod -Uri "$ApiUrl/activities" -Headers $auth
$grpPayload = @{
  name        = "Phase 10 Showcase $(Get-Random)"
  description = "A university club testing public previews and QR codes."
  generalArea = "NUST Campus"
  capacity    = 30
  activityIds = @($acts.activities[0].id)
} | ConvertTo-Json

$grp = (Invoke-RestMethod -Uri "$ApiUrl/groups" -Method Post -Headers $auth -Body $grpPayload).group
Write-Host "    [OK] Group created: $($grp.name) ($($grp.id))" -ForegroundColor Green

Write-Host "[4] Public unauthenticated GET /share/groups/:id..." -ForegroundColor Cyan
$pub = Invoke-RestMethod -Uri "$ApiUrl/share/groups/$($grp.id)" -Method Get
Write-Host "    [OK] Public preview: $($pub.preview.name) | Area: $($pub.preview.generalArea)" -ForegroundColor Green
Write-Host "         Deep Link: $($pub.preview.deepLink)" -ForegroundColor Gray

Invoke-RestMethod -Uri "$ApiUrl/groups/$($grp.id)" -Method Delete -Headers $auth | Out-Null
Write-Host "[5] Cleaned up test group." -ForegroundColor Green
Write-Host "`nALL PHASE 10 CHECKS PASSED!" -ForegroundColor Green
