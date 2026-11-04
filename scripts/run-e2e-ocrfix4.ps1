#requires -RunAsAdministrator
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "[e2e-ocrfix4] stopping current service instance..."
sc.exe stop digitalevidenceenterprise.exe | Out-Host
while ($true) {
    $state = sc.exe query digitalevidenceenterprise.exe | Out-String
    Write-Host $state
    if ($state -match "STATE\s+:\s+1\s+STOPPED") { break }
    Start-Sleep -Seconds 3
}

sc.exe start digitalevidenceenterprise.exe | Out-Host
Start-Sleep -Seconds 15

$serviceState = sc.exe query digitalevidenceenterprise.exe | Out-String
if ($serviceState -notmatch "STATE\s+:\s+4\s+RUNNING") {
    throw "DigitalEvidenceEnterprise did not reach RUNNING state.\n$serviceState"
}

$health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3450/" -TimeoutSec 10
if ($health.StatusCode -ne 200) {
    throw "Service health check failed: HTTP $($health.StatusCode)"
}

$env:E2E_BASE_URL = "http://127.0.0.1:3450/"
$env:E2E_BATCH_LIMIT = "1"
$env:E2E_FIXTURE_FILES = Join-Path (Get-Location) "For Test\Done\A4_IMG_ (1).JPEG"
$env:E2E_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:E2E_OUT_DIR = "For Test Results\e2e-local-ocrfix4-3450"
$env:E2E_REQUIRE_REVIEW_DERIVED_PREVIEW = "false"

Write-Host "[e2e-ocrfix4] service RUNNING and HTTP 200; running exactly one fixture..."
node .\scripts\e2e-batch-local.mjs
if ($LASTEXITCODE -ne 0) {
    throw "E2E failed with exit code $LASTEXITCODE"
}
