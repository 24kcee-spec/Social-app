#Requires -Version 5.1
<#
.SYNOPSIS
  Read-only liveness and readiness check for the Social-app API.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\check-api-health.ps1
  powershell -ExecutionPolicy Bypass -File .\scripts\check-api-health.ps1 -ApiUrl "https://your-api-host"
#>
param([string]$ApiUrl = "http://localhost:4000")

$ErrorActionPreference = "Stop"
$ApiUrl = $ApiUrl.TrimEnd("/")

function Test-ApiEndpoint([string]$Path, [string]$ExpectedStatus) {
  $uri = "$ApiUrl$Path"
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Method Get -TimeoutSec 8 -ErrorAction Stop
  } catch {
    $statusCode = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $statusCode = [int]$_.Exception.Response.StatusCode
    }
    $detail = if ($statusCode) { "HTTP $statusCode" } else { $_.Exception.Message }
    throw "GET $uri failed ($detail). For /ready, HTTP 503 means a configured dependency is not ready; it is not a successful health check."
  }

  try { $body = $response.Content | ConvertFrom-Json }
  catch { throw "GET $uri returned invalid JSON." }

  if ([int]$response.StatusCode -ne 200) {
    throw "GET $uri returned HTTP $($response.StatusCode), expected HTTP 200."
  }
  if ($body.status -ne $ExpectedStatus) {
    throw "GET $uri returned status '$($body.status)', expected '$ExpectedStatus'."
  }
  Write-Host "  OK  $Path ($($response.StatusCode), status=$($body.status))" -ForegroundColor Green
  return $body
}

Write-Host "Checking API at $ApiUrl (read-only)..." -ForegroundColor Cyan
$health = Test-ApiEndpoint -Path "/health" -ExpectedStatus "ok"
$ready = Test-ApiEndpoint -Path "/ready" -ExpectedStatus "ready"
Write-Host "API health and readiness checks passed." -ForegroundColor Green
