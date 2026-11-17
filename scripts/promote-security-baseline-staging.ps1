#requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$BuildSource = "build-output-security-baseline-20261118",
  [string]$BuildTarget = "build-output-enterprise",
  [int]$StagingPort = 3461,
  [int]$ServicePort = 3450,
  [string]$ServiceName = "digitalevidenceenterprise.exe"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot $BuildSource
$targetPath = Join-Path $projectRoot $BuildTarget

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "BUILD_ID"))) {
  throw "Production build is incomplete: $sourcePath\\BUILD_ID was not found"
}

$listener = Get-NetTCPConnection -State Listen -LocalPort $StagingPort -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  Stop-Process -Id $listener.OwningProcess -Force
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-NetTCPConnection -State Listen -LocalPort $StagingPort -ErrorAction SilentlyContinue) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
  }
  if (Get-NetTCPConnection -State Listen -LocalPort $StagingPort -ErrorAction SilentlyContinue) {
    throw "Staging listener on port $StagingPort did not stop"
  }
}

& (Join-Path $PSScriptRoot "promote-enterprise-build.ps1") `
  -ServiceName $ServiceName `
  -Port $ServicePort `
  -BuildSource $sourcePath `
  -BuildTarget $targetPath

$env:NEXT_DIST_DIR = $BuildTarget
$node = (Get-Command node -ErrorAction Stop).Source
$logDirectory = Join-Path $projectRoot "For Test Results\\security-baseline-runtime"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
Start-Process -FilePath $node `
  -ArgumentList @("scripts/start-enterprise.mjs", "--port", $StagingPort) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $logDirectory "staging-$timestamp.stdout.log") `
  -RedirectStandardError (Join-Path $logDirectory "staging-$timestamp.stderr.log")

foreach ($port in @($ServicePort, $StagingPort)) {
  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/" -TimeoutSec 5
      if ($response.StatusCode -eq 200) { break }
    } catch {
      if ((Get-Date) -ge $deadline) { throw "Runtime did not become healthy on port $port" }
    }
  } while ((Get-Date) -lt $deadline)
}

[pscustomobject]@{
  buildId = (Get-Content -LiteralPath (Join-Path $targetPath "BUILD_ID") -Raw).Trim()
  servicePort = $ServicePort
  stagingPort = $StagingPort
  status = "healthy"
} | ConvertTo-Json -Compress
