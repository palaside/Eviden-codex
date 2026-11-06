[CmdletBinding()]
param(
  [string]$OutDir = 'For Test Results/batch500-resumable-head4a3-20261105'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$resolvedOutDir = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutDir))
New-Item -ItemType Directory -Force -Path $resolvedOutDir | Out-Null
$logPath = Join-Path $resolvedOutDir 'scheduled-runner.log'

Start-Transcript -LiteralPath $logPath -Append | Out-Null
try {
  & (Join-Path $PSScriptRoot 'run-batch500-resumable.ps1') -OutDir $OutDir -Resume
  exit $LASTEXITCODE
} catch {
  Write-Error $_
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
