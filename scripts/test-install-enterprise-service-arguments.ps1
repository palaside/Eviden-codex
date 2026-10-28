$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "install-enterprise-service.ps1"
$source = Get-Content -LiteralPath $scriptPath -Raw

$expected = '& $nodePath $serviceInstallerPath install'
if ($source -notmatch [regex]::Escape($expected)) {
  throw "Regression: service creation must use the node-windows service installer."
}

if ($source -match 'New-Service -Name') {
  throw "Regression: PowerShell must not register node.exe directly as a Windows service."
}

if ($source -notmatch '& sc\.exe delete \$ServiceName') {
  throw "Regression: existing service definition must be deleted before installing the wrapper service."
}

if ($source -match '& sc\.exe start \$ServiceName') {
  throw "Regression: PowerShell must not start the service twice after node-windows install."
}

if ($source -notmatch '\$nativeServiceName = \$ServiceName\.ToLowerInvariant\(\) \+ "\.exe"') {
  throw "Regression: sc.exe failure must use node-windows native service name."
}

if ($source -notmatch '& sc\.exe failure \$nativeServiceName') {
  throw "Regression: recovery configuration must target node-windows native service name."
}

if ($source -notmatch '\$exportPythonPath = Join-Path \$projectRoot "scripts\\\.venv-evidence-export\\Scripts\\python\.exe"') {
  throw "Regression: service must use the shared export Python runtime."
}

Write-Output "PASS: Windows Service uses node-windows wrapper instead of direct node.exe registration."
