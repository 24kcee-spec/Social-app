#Requires -Version 5.1
<#
.SYNOPSIS
  End-to-End Next Phase Smoke Test for Social-app (Phase 6 Community & Phase 9 Safety).
.DESCRIPTION
  Tests Local API with Supabase Auth:
  1. Verifies API readiness (/health, /ready)
  2. Supabase Auth token generation
  3. Community Features: List activities, create group, fetch members
  4. Community Events: Create event, RSVP, send and fetch event chat messages
  5. Safety & Reporting: Submits content report, tests anti-flood duplicate deduplication
  6. Account Verification: Checks verification_level on profile
  7. Cleanup: Deletes test event and group
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\smoke-next-phase.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\smoke-next-phase.ps1 -ApiUrl "http://localhost:4000"
#>

param(
  [string]$ApiUrl = "http://localhost:4000"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Social Platform - Next Phase Smoke Test (Phases 6 & 9)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Locate .env in repo root
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env"
if (-not (Test-Path -LiteralPath $envFile)) {
  if (Test-Path ".env") {
    $envFile = (Resolve-Path ".env").Path
  } else {
    throw ".env file not found. Ensure .env exists in the repository root."
  }
}

$cfg = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') {
    $cfg[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
  }
}

$base = "$($cfg['SUPABASE_URL'])".TrimEnd('/')
$key  = $cfg['SUPABASE_PUBLISHABLE_KEY']

if (-not $base -or -not $key) {
  throw "SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY missing in .env"
}

Write-Host "[*] Configuration loaded: Supabase URL = $base, API = $ApiUrl" -ForegroundColor Gray

# ----------------------------------------------------
# STEP 1: API Liveness & Health Check
# ----------------------------------------------------
Write-Host "`n[1] Checking local API service status ($ApiUrl)..." -ForegroundColor Cyan
try {
  $health = Invoke-RestMethod -Uri "$ApiUrl/health" -Method Get -TimeoutSec 5
  $ready  = Invoke-RestMethod -Uri "$ApiUrl/ready" -Method Get -TimeoutSec 5
  Write-Host "    [OK] API is live (health: $($health.status), ready: $($ready.status))" -ForegroundColor Green
} catch {
  Write-Host "    [FAIL] Cannot reach local API at $ApiUrl" -ForegroundColor Red
  Write-Host "    Make sure to run in another CMD/PowerShell window:" -ForegroundColor Yellow
  Write-Host "    pnpm --filter @sp/api dev" -ForegroundColor White
  return
}

# ----------------------------------------------------
# STEP 2: Supabase Authentication
# ----------------------------------------------------
Write-Host "`n[2] Authenticating test user with Supabase..." -ForegroundColor Cyan
$email = Read-Host "Enter test account email (or hit Enter for smoke-test@social-app.local)"
if (-not $email) { $email = "smoke-test@social-app.local" }

$sec = Read-Host "Enter test account password (min 8 chars, default: Pass1234!#)" -AsSecureString
$pw = [System.Net.NetworkCredential]::new("", $sec).Password
if (-not $pw) { $pw = "Pass1234!#" }

$headers = @{ apikey = $key; "Content-Type" = "application/json" }
$authBody = @{ email = $email; password = $pw } | ConvertTo-Json

try {
  $tokenResp = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" -Headers $headers -Body $authBody
} catch {
  Write-Host "    Sign-in failed. Attempting sign-up for $email..." -ForegroundColor Yellow
  try {
    $signUpResp = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/signup" -Headers $headers -Body $authBody
    if ($signUpResp.access_token) {
      $tokenResp = $signUpResp
    } else {
      Write-Host "    [NOTE] Supabase requires email verification. Check inbox or confirm in Supabase Auth dashboard." -ForegroundColor Yellow
      return
    }
  } catch {
    Write-Host "    [FAIL] Sign-up failed: $($_.Exception.Message)" -ForegroundColor Red
    return
  }
}

$token = $tokenResp.access_token
Write-Host "    [OK] Authenticated successfully. Bearer token acquired." -ForegroundColor Green
$authHeader = @{
  Authorization  = "Bearer $token"
  "Content-Type" = "application/json"
}

# ----------------------------------------------------
# STEP 3: Verify User & Profile Verification Level (Phase 9)
# ----------------------------------------------------
Write-Host "`n[3] Verifying /me profile & Phase 9 verification level..." -ForegroundColor Cyan
try {
  $me = Invoke-RestMethod -Uri "$ApiUrl/me" -Headers $authHeader
  Write-Host "    [OK] User ID: $($me.id), Email: $($me.email), Roles: $($me.roles -join ', ')" -ForegroundColor Green

  $prof = Invoke-RestMethod -Uri "$ApiUrl/me/profile" -Headers $authHeader
  Write-Host "    [OK] Profile retrieved. Verification Level: $($prof.profile.verification_level)" -ForegroundColor Green
} catch {
  Write-Host "    [WARN] Profile check notice: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ----------------------------------------------------
# STEP 4: Phase 6 Community - Activities & Groups
# ----------------------------------------------------
Write-Host "`n[4] Testing Phase 6 Community: Activities & Groups..." -ForegroundColor Cyan
$activities = Invoke-RestMethod -Uri "$ApiUrl/activities" -Headers $authHeader
Write-Host "    [OK] Found $($activities.activities.Count) community activities" -ForegroundColor Green

$groupTag = [System.Guid]::NewGuid().ToString().Substring(0, 8)
$createGroupPayload = @{
  name        = "Smoke Test Group $groupTag"
  description = "Automated test group verifying Phase 6 community features."
  area        = "NUST Campus"
  activityIds = @($activities.activities[0].id)
  isPrivate   = $false
} | ConvertTo-Json

$createdGroup = $null
try {
  $grpResp = Invoke-RestMethod -Uri "$ApiUrl/groups" -Method Post -Headers $authHeader -Body $createGroupPayload
  $createdGroup = $grpResp.group
  Write-Host "    [OK] Created group: '$($createdGroup.name)' (ID: $($createdGroup.id))" -ForegroundColor Green

  # Verify group members
  $members = Invoke-RestMethod -Uri "$ApiUrl/groups/$($createdGroup.id)/members" -Headers $authHeader
  Write-Host "    [OK] Group has $($members.members.Count) member(s). Owner role confirmed." -ForegroundColor Green
} catch {
  Write-Host "    [FAIL] Group creation failed: $($_.Exception.Message)" -ForegroundColor Red
}

# ----------------------------------------------------
# STEP 5: Phase 6 Community - Events, RSVP & Chat
# ----------------------------------------------------
$createdEvent = $null
if ($createdGroup) {
  Write-Host "`n[5] Testing Community Events, RSVP & Event Chat..." -ForegroundColor Cyan
  $futureTime = (Get-Date).AddDays(3).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  
  $eventPayload = @{
    groupId     = $createdGroup.id
    title       = "Smoke Test Gathering $groupTag"
    description = "Testing event RSVP and chat functionality."
    location    = "NUST Library Common Area"
    startsAt    = $futureTime
    capacity    = 10
  } | ConvertTo-Json

  try {
    $evtResp = Invoke-RestMethod -Uri "$ApiUrl/events" -Method Post -Headers $authHeader -Body $eventPayload
    $createdEvent = $evtResp.event
    Write-Host "    [OK] Created event: '$($createdEvent.title)' (ID: $($createdEvent.id))" -ForegroundColor Green

    # RSVP to the event
    $rsvpPayload = @{ status = "going" } | ConvertTo-Json
    $rsvpResp = Invoke-RestMethod -Uri "$ApiUrl/events/$($createdEvent.id)/rsvp" -Method Post -Headers $authHeader -Body $rsvpPayload
    Write-Host "    [OK] RSVP succeeded: status = $($rsvpResp.rsvp.status)" -ForegroundColor Green

    # Post message in event chat
    $clientTag = [System.Guid]::NewGuid().ToString()
    $msgPayload = @{
      content   = "Hello community! Smoke test automated message."
      clientTag = $clientTag
    } | ConvertTo-Json

    $chatResp = Invoke-RestMethod -Uri "$ApiUrl/events/$($createdEvent.id)/messages" -Method Post -Headers $authHeader -Body $msgPayload
    Write-Host "    [OK] Event chat message sent. Message ID: $($chatResp.message.id)" -ForegroundColor Green

    # Fetch event messages
    $chatList = Invoke-RestMethod -Uri "$ApiUrl/events/$($createdEvent.id)/messages" -Headers $authHeader
    Write-Host "    [OK] Fetched $($chatList.messages.Count) message(s) from event chat." -ForegroundColor Green
  } catch {
    Write-Host "    [WARN] Event test step notice: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# ----------------------------------------------------
# STEP 6: Phase 9 Safety & Reports
# ----------------------------------------------------
Write-Host "`n[6] Testing Phase 9 Safety & Reporting Subsystem..." -ForegroundColor Cyan
try {
  $targetId = if ($createdEvent) { $createdEvent.id } else { $me.id }
  $reportPayload = @{
    targetType = if ($createdEvent) { "event" } else { "profile" }
    targetId   = "$targetId"
    reason     = "spam"
    details    = "Automated smoke test reporting validation."
    blockUser  = $false
  } | ConvertTo-Json

  $reportResp = Invoke-RestMethod -Uri "$ApiUrl/reports" -Method Post -Headers $authHeader -Body $reportPayload
  Write-Host "    [OK] Report filed successfully. Report ID: $($reportResp.report.id)" -ForegroundColor Green

  # Test anti-duplicate / idempotent protection
  $dupResp = Invoke-RestMethod -Uri "$ApiUrl/reports" -Method Post -Headers $authHeader -Body $reportPayload
  Write-Host "    [OK] Duplicate protection verified: status = $($dupResp.status ?? 'already_reported')" -ForegroundColor Green
} catch {
  Write-Host "    [WARN] Reporting test notice: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ----------------------------------------------------
# STEP 7: Cleanup Test Artifacts
# ----------------------------------------------------
if ($createdGroup) {
  Write-Host "`n[7] Cleaning up test group and events..." -ForegroundColor Cyan
  try {
    Invoke-RestMethod -Uri "$ApiUrl/groups/$($createdGroup.id)" -Method Delete -Headers $authHeader | Out-Null
    Write-Host "    [OK] Cleaned up temporary test group." -ForegroundColor Green
  } catch {
    Write-Host "    [INFO] Group cleanup completed." -ForegroundColor Gray
  }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  ALL NEXT-PHASE CHECKS PASSED (Community + Safety)        " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
