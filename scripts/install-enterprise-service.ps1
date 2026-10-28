[CmdletBinding(SupportsShouldProcess)]
param(
  [string]$ServiceName = "DigitalEvidenceEnterprise",
  [int]$Port = 3450,
  [switch]$Install,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$supervisorPath = Join-Path $projectRoot "scripts\enterprise-supervisor.mjs"
$serviceInstallerPath = Join-Path $projectRoot "scripts\install-enterprise-node-service.cjs"
$exportPythonPath = Join-Path $projectRoot "scripts\.venv-evidence-export\Scripts\python.exe"
$nativeServiceName = $ServiceName.ToLowerInvariant() + ".exe"
$serviceBinPath = "`"$nodePath`" `"$supervisorPath`" --port $Port"

if ($Install -and $Remove) { throw "Use -Install or -Remove, not both" }

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
$isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (($Install -or $Remove) -and -not $isAdministrator -and -not $WhatIfPreference) {
  $forwardedArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-ServiceName", $ServiceName,
    "-Port", $Port
  )
  if ($Install) { $forwardedArgs += "-Install" }
  if ($Remove) { $forwardedArgs += "-Remove" }
  $elevated = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $forwardedArgs -Wait -PassThru
  exit $elevated.ExitCode
}

if (-not $Install -and -not $Remove) {
  Write-Output "DRY RUN"
  Write-Output "ServiceName=$ServiceName"
  Write-Output "ServiceHost=node-windows"
  Write-Output "Supervisor=$supervisorPath"
  Write-Output "Install command: node $serviceInstallerPath install"
  Write-Output "Remove command: node $serviceInstallerPath uninstall"
  exit 0
}

if ($Install) {
  if (-not (Test-Path -LiteralPath $supervisorPath)) { throw "Supervisor not found: $supervisorPath" }
  if (-not (Test-Path -LiteralPath $serviceInstallerPath)) { throw "Service installer not found: $serviceInstallerPath" }
  if ($PSCmdlet.ShouldProcess($ServiceName, "Install Windows Service")) {
    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($existing) {
      if ($existing.Status -ne "Stopped") {
        & sc.exe stop $ServiceName | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "sc.exe stop failed: $LASTEXITCODE" }
        $existing.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
      }
      & sc.exe delete $ServiceName
      if ($LASTEXITCODE -ne 0) { throw "sc.exe delete failed: $LASTEXITCODE" }
      Start-Sleep -Seconds 2
    }
    if (-not (Test-Path -LiteralPath $exportPythonPath)) { throw "Export Python runtime not found: $exportPythonPath" }
    $env:PYTHON_EXECUTABLE = $exportPythonPath
    & $nodePath $serviceInstallerPath install
    if ($LASTEXITCODE -ne 0) { throw "node-windows install failed: $LASTEXITCODE" }
    & sc.exe failure $nativeServiceName "reset= 86400" "actions= restart/5000/restart/15000/restart/60000"
    if ($LASTEXITCODE -ne 0) { throw "sc.exe failure failed: $LASTEXITCODE" }
  }
  exit 0
}

if ($PSCmdlet.ShouldProcess($ServiceName, "Remove Windows Service")) {
  & sc.exe stop $ServiceName
  & sc.exe delete $ServiceName
  if ($LASTEXITCODE -ne 0) { throw "sc.exe delete failed: $LASTEXITCODE" }
}
