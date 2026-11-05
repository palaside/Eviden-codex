[CmdletBinding()]
param(
  [string]$BaseUrl = 'http://127.0.0.1:3450/',
  [string]$FixtureRoots = 'For Test/แชทที่ 1;For Test/แชทที่ 2;For Test/แชทที่ 3;For Test/Done',
  [string]$OutDir = ('For Test Results/batch500-resumable-' + [guid]::NewGuid().ToString()),
  [string]$BuildDir = 'build-output-enterprise',
  [string]$BatchSpec = '001:0:10,002:10:50,003:60:100,004:160:100,005:260:100,006:360:100,007:460:40',
  [string]$BatchId,
  [string]$ServiceName = 'digitalevidenceenterprise.exe',
  [switch]$Resume
)
$ErrorActionPreference = 'Stop'
Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  # Validate the complete layout before starting even the first browser batch.
  $ranges = & node --input-type=module -e "import { parseBatchSpec } from './scripts/run-batch500-resumable.mjs'; console.log(JSON.stringify(parseBatchSpec(process.argv[1])));" $BatchSpec
  if ($LASTEXITCODE -ne 0) { throw 'Invalid batch layout' }
  $batches = @($ranges | ConvertFrom-Json)
  if ($BatchId) { $batches = @($batches | Where-Object { $_.batchId -eq $BatchId }) }
  if ($batches.Count -eq 0) { throw 'Unknown batch ID' }
  $expectedBuild = (Get-Content -LiteralPath (Join-Path $BuildDir 'BUILD_ID') -Raw).Trim()
  $expectedCommit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'Cannot read git commit' }
  foreach ($batch in $batches) {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    if ($service.Status -ne 'Running') { throw "Service must be RUNNING: $ServiceName" }
    if ((Get-Content -LiteralPath (Join-Path $BuildDir 'BUILD_ID') -Raw).Trim() -ne $expectedBuild) { throw 'Local build ID mismatch' }
    if ((& git rev-parse HEAD).Trim() -ne $expectedCommit) { throw 'Git commit mismatch' }
    $http = Invoke-WebRequest -Uri $BaseUrl -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
    if ($http.StatusCode -ne 200) { throw "Require HTTP 200, got $($http.StatusCode)" }
    $html = $http.Content.Replace('\"', '"')
    $runtimeBuilds = @([regex]::Matches($html, '"b":"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
    if ($runtimeBuilds -notcontains $expectedBuild) { throw 'HTTP build ID mismatch or unavailable' }
    $nodeArgs = @('scripts/run-batch500-resumable.mjs', '--base-url', $BaseUrl, '--fixture-roots', $FixtureRoots, '--out-dir', $OutDir, '--build-dir', $BuildDir, '--batch-spec', $BatchSpec, '--batch-id', $batch.batchId)
    if ($Resume) { $nodeArgs += '--resume' }
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) { throw "Batch $($batch.batchId) stopped; evidence retained at $OutDir" }
    $Resume = [switch]::new($true)
  }
} finally { Pop-Location }
