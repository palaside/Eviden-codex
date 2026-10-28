param(
  [string]$EnvFile = (Join-Path $env:USERPROFILE 'Downloads\.env'),
  [int]$Port = 3461
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$app = Join-Path $workspace '_imports\slipvision-tactical-v2'
$sharedModules = Join-Path $workspace 'slipvision-e2e-review\node_modules'
$next = Join-Path $sharedModules 'next\dist\bin\next'

if (-not (Test-Path -LiteralPath $app) -or -not (Test-Path -LiteralPath $next)) {
  throw 'SlipVision source or the existing isolated Next.js installation is missing.'
}
if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Environment file not found: $EnvFile"
}

$key = $null
foreach ($line in Get-Content -LiteralPath $EnvFile) {
  if ($line -match '^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.*?)\s*$' -and $Matches[2]) {
    $key = $Matches[2].Trim().Trim('"', "'")
  }
}
if ([string]::IsNullOrWhiteSpace($key)) {
  throw 'The environment file has no Gemini/Google API key.'
}

$env:GEMINI_API_KEY = $key
Remove-Item Env:GOOGLE_API_KEY -ErrorAction SilentlyContinue
$env:NODE_PATH = $sharedModules
Push-Location $app
try {
  & node $next dev -H 127.0.0.1 -p $Port
} finally {
  Pop-Location
  Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
}
