[CmdletBinding()]
param(
  [string]$RunMetadataPath,
  [string]$OutDir,
  [ValidateSet('before', 'after')][string]$Phase = 'before',
  [string]$ServiceName = 'digitalevidenceenterprise.exe',
  [string]$SourceBuildDir = '.next',
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

# Dot-source to use the pure comparison and serialization functions in tests.
function Test-RuntimeEvidence {
  param($Evidence, $RunMetadata)
  $reasons = [System.Collections.Generic.List[string]]::new()
  foreach ($field in @('serviceName', 'status', 'startType', 'binaryPath', 'BUILD_ID', 'sourceBuildId', 'gitCommit', 'httpStatus', 'httpBuildId', 'NEXT_DIST_DIR', 'timestamp')) {
    if ([string]::IsNullOrWhiteSpace([string]$Evidence.$field)) { $reasons.Add("Missing $field") }
  }
  foreach ($field in @('buildId', 'gitCommit')) {
    if ([string]::IsNullOrWhiteSpace([string]$RunMetadata.$field)) { $reasons.Add("Missing run metadata $field") }
  }
  foreach ($field in @('BUILD_ID', 'sourceBuildId', 'httpBuildId')) {
    if ([string]$Evidence.$field -cne [string]$RunMetadata.buildId) { $reasons.Add("$field mismatch") }
  }
  if ([string]$Evidence.gitCommit -cne [string]$RunMetadata.gitCommit) { $reasons.Add('gitCommit mismatch') }
  if ($Evidence.status -ne 'Running') { $reasons.Add('Service is not Running') }
  if ($Evidence.httpStatus -ne 200) { $reasons.Add('HTTP status is not 200') }
  foreach ($errorMessage in @($Evidence.errors)) {
    if ($errorMessage) { $reasons.Add([string]$errorMessage) }
  }
  [pscustomobject]@{ compatible = ($reasons.Count -eq 0); reasons = @($reasons) }
}

function Get-RuntimeEvidence {
  param([string]$ServiceName, [string]$SourceBuildDir, [string]$RepoRoot)
  $errors = [System.Collections.Generic.List[string]]::new()
  $evidence = [ordered]@{
    serviceName = $ServiceName; status = $null; startType = $null; binaryPath = $null
    BUILD_ID = $null; sourceBuildId = $null; gitCommit = $null; httpStatus = $null
    httpBuildId = $null; NEXT_DIST_DIR = $null; timestamp = [DateTime]::UtcNow.ToString('o')
    serviceProcessId = $null; listenerProcessId = $null; serviceOwnsListener = $false
    serviceConfigPath = $null; serviceWorkingDirectory = $null; serviceBuildDir = $null
    nextDistDirSource = 'service XML configuration (not live process environment)'
    sourceCommitSource = 'git rev-parse HEAD (not build-time commit attestation)'
    scQc = $null; scQuery = $null; errors = @()
  }
  try {
    if ($ServiceName -notmatch '^[a-zA-Z0-9_.-]+$') { throw 'Unsupported service name' }
    $service = Get-CimInstance Win32_Service -Filter "Name='$ServiceName'" -ErrorAction Stop
    if (-not $service) { throw 'Service not found' }
    $evidence.status = $service.State
    $evidence.startType = $service.StartMode
    $evidence.binaryPath = $service.PathName
    $evidence.serviceProcessId = $service.ProcessId
    # node-windows/WinSW keeps its configuration beside the service executable.
    $binary = [regex]::Match($service.PathName, '^\s*(?:"([^"]+\.exe)"|(.+?\.exe))(?:\s|$)')
    if (-not $binary.Success) { throw 'Cannot resolve service executable' }
    $exePath = $binary.Groups[1].Value
    if (-not $exePath) { $exePath = $binary.Groups[2].Value }
    $configPath = [IO.Path]::ChangeExtension($exePath, '.xml')
    $evidence.serviceConfigPath = $configPath
    # Prohibit DTD/entity expansion; never read or emit unrelated env entries.
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create($configPath, $settings)
    try { $config = [Xml.XmlDocument]::new(); $config.Load($reader) } finally { $reader.Dispose() }
    if ([string]$config.service.id -cne $ServiceName) { throw 'Service XML identity mismatch' }
    $dist = @($config.service.env | Where-Object { $_.name -ceq 'NEXT_DIST_DIR' })
    if ($dist.Count -ne 1 -or [string]::IsNullOrWhiteSpace($dist[0].value)) { throw 'Service NEXT_DIST_DIR unavailable or ambiguous' }
    $workingDirectory = [string]$config.service.workingdirectory
    if (-not [IO.Path]::IsPathRooted($workingDirectory)) { throw 'Service working directory must be absolute' }
    $evidence.serviceWorkingDirectory = $workingDirectory
    $evidence.NEXT_DIST_DIR = [string]$dist[0].value
    $evidence.serviceBuildDir = [IO.Path]::GetFullPath((Join-Path $workingDirectory $evidence.NEXT_DIST_DIR))
    $evidence.BUILD_ID = (Get-Content -LiteralPath (Join-Path $evidence.serviceBuildDir 'BUILD_ID') -Raw -ErrorAction Stop).Trim()
    if ([IO.Path]::GetFullPath($workingDirectory).TrimEnd('\') -ine [IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')) { throw 'Service source root differs from selected repository' }
    # A healthy port alone is not proof that this service owns the runtime.
    $listeners = @(Get-NetTCPConnection -LocalPort 3450 -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
    if ($listeners.Count -ne 1) { throw 'Runtime listener missing or ambiguous' }
    $evidence.listenerProcessId = $listeners[0]
    $processId = [uint32]$listeners[0]
    $seen = @{}
    while ($processId -gt 0 -and -not $seen.ContainsKey($processId)) {
      if ($processId -eq $service.ProcessId) { $evidence.serviceOwnsListener = $true; break }
      $seen[$processId] = $true
      $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction Stop
      if (-not $process) { break }
      $processId = [uint32]$process.ParentProcessId
    }
    if (-not $evidence.serviceOwnsListener) { throw 'HTTP listener is not a descendant of the selected service' }
  } catch { $errors.Add("Service collection: $($_.Exception.Message)") }
  foreach ($operation in @('qc', 'query')) {
    try {
      $raw = & sc.exe $operation $ServiceName 2>&1
      $code = $LASTEXITCODE
      if ($operation -eq 'qc') { $evidence.scQc = ($raw -join "`n") } else { $evidence.scQuery = ($raw -join "`n") }
      if ($code -ne 0) { throw "sc.exe $operation exited $code" }
    } catch { $errors.Add($_.Exception.Message) }
  }
  try {
    $sourcePath = if ([IO.Path]::IsPathRooted($SourceBuildDir)) { $SourceBuildDir } else { Join-Path $RepoRoot $SourceBuildDir }
    $evidence.sourceBuildId = (Get-Content -LiteralPath (Join-Path $sourcePath 'BUILD_ID') -Raw -ErrorAction Stop).Trim()
  } catch { $errors.Add("Source BUILD_ID: $($_.Exception.Message)") }
  try {
    $commit = & git -C $RepoRoot rev-parse HEAD 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'git rev-parse HEAD failed' }
    $evidence.gitCommit = ($commit -join '').Trim()
  } catch { $errors.Add($_.Exception.Message) }
  try {
    $http = Invoke-WebRequest -Uri 'http://127.0.0.1:3450/' -Method Get -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0 -ErrorAction Stop
    $evidence.httpStatus = [int]$http.StatusCode
    $html = $http.Content.Replace('\"', '"')
    $builds = @([regex]::Matches($html, '"b":"([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    if ($builds.Count -ne 1) { throw 'HTTP build identity unavailable or ambiguous' }
    $evidence.httpBuildId = $builds[0]
  } catch {
    if ($_.Exception.Response) { $evidence.httpStatus = [int]$_.Exception.Response.StatusCode }
    $errors.Add("HTTP collection: $($_.Exception.Message)")
  }
  $evidence.errors = @($errors)
  [pscustomobject]$evidence
}

function Save-RuntimeEvidence {
  param($RunMetadata, [string]$OutDir, [ValidateSet('before', 'after')][string]$Phase,
    [string]$ServiceName, [string]$SourceBuildDir, [string]$RepoRoot)
  $target = Join-Path $OutDir "runtime-$Phase.json"
  if (Test-Path -LiteralPath $target) { throw "Evidence already exists: $target" }
  $evidence = Get-RuntimeEvidence -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir -RepoRoot $RepoRoot
  $validation = Test-RuntimeEvidence $evidence $RunMetadata
  $evidence | Add-Member -NotePropertyMembers @{
    phase = $Phase; observationOnly = $true; validation = $validation
    selectedRun = @{ buildId = $RunMetadata.buildId; gitCommit = $RunMetadata.gitCommit }
  }
  [IO.Directory]::CreateDirectory([IO.Path]::GetFullPath($OutDir)) | Out-Null
  $json = $evidence | ConvertTo-Json -Depth 8
  # CreateNew also rejects races; failed evidence is retained, never replaced.
  $stream = [IO.File]::Open($target, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
  try {
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
    $stream.Write($bytes, 0, $bytes.Length)
  } finally { $stream.Dispose() }
  $validation
}

if ($MyInvocation.InvocationName -ne '.') {
  $ErrorActionPreference = 'Stop'
  try {
    if (-not $RunMetadataPath -or -not $OutDir) { throw 'RunMetadataPath and OutDir are required' }
    $metadata = Get-Content -LiteralPath $RunMetadataPath -Raw | ConvertFrom-Json
    $validation = Save-RuntimeEvidence -RunMetadata $metadata -OutDir $OutDir -Phase $Phase -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir -RepoRoot $RepoRoot
    $validation | ConvertTo-Json -Depth 5
    if (-not $validation.compatible) { exit 1 }
    exit 0
  } catch { Write-Error $_; exit 1 }
}
