#requires -RunAsAdministrator
[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$ServiceName = "digitalevidenceenterprise.exe",
  [int]$Port = 3450,
  [string]$BuildSource = "build-output-e2e-20261028-final2",
  [string]$BuildTarget = "build-output-enterprise"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot $BuildSource
$targetPath = Join-Path $projectRoot $BuildTarget

if (-not (Test-Path -LiteralPath (Join-Path $sourcePath "BUILD_ID"))) {
  throw "Production build is incomplete: $sourcePath\BUILD_ID was not found"
}
if (-not (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
  throw "Service not found: $ServiceName"
}

if ($PSCmdlet.ShouldProcess($ServiceName, "Stop service and promote $BuildSource to $BuildTarget")) {
  sc.exe stop $ServiceName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sc.exe stop failed: $LASTEXITCODE" }
  $service = Get-Service -Name $ServiceName
  $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(45))

  New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
  Copy-Item -Path (Join-Path $sourcePath "*") -Destination $targetPath -Recurse -Force

  sc.exe start $ServiceName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "sc.exe start failed: $LASTEXITCODE" }

  $deadline = (Get-Date).AddSeconds(45)
  do {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 5
      if ($response.StatusCode -eq 200) { break }
    } catch {
      if ((Get-Date) -ge $deadline) { throw "Service did not become healthy on port $Port" }
    }
  } while ((Get-Date) -lt $deadline)

  Write-Output "[enterprise-build] promoted $BuildSource -> $BuildTarget"
  Write-Output "[enterprise-build] healthy http://127.0.0.1:$Port/"
}
