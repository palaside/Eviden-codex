[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Restart', 'Reboot', 'AfterReboot')][string]$Mode = 'Preflight',
  [string]$RunMetadataPath,
  [string]$OutDir = ('For Test Results/task5-recovery-' + [guid]::NewGuid().ToString('N')),
  [string]$ServiceName = 'digitalevidenceenterprise.exe',
  [string]$SourceBuildDir = 'build-output-enterprise',
  [string]$FixturePath,
  [string]$PriorReportPath,
  [ValidateRange(0, 300)][int]$TimeoutSeconds = 45,
  [switch]$ConfirmReboot
)

. (Join-Path $PSScriptRoot 'collect-runtime-evidence.ps1') -RunMetadataPath $RunMetadataPath -OutDir $OutDir -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir

function Write-AuditJson {
  param([string]$Path, $Value)
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 30))
  $stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
}

function Wait-AuditState {
  param([scriptblock]$ReadState, [string]$Expected, [int]$TimeoutSeconds, $States)
  $timer = [Diagnostics.Stopwatch]::StartNew()
  do {
    $observed = [string](& $ReadState)
    $States.Add([pscustomobject]@{ timestamp = [DateTime]::UtcNow.ToString('o'); expected = $Expected; state = $observed })
    if ($observed -eq $Expected) { return }
    if ($timer.Elapsed.TotalSeconds -ge $TimeoutSeconds) { throw "Timeout waiting for service $Expected; last state $observed" }
    Start-Sleep -Milliseconds 250
  } while ($true)
}

# Injectable OS boundaries let tests exercise the real controller without stopping a service.
function Invoke-ServiceRecovery {
  param([scriptblock]$ReadState, [scriptblock]$StopAction, [scriptblock]$StartAction, [int]$TimeoutSeconds = 45)
  $states = [Collections.Generic.List[object]]::new()
  $result = [ordered]@{ kind = 'restart_fallback'; status = 'not_run'; blocker = $null; states = $states; restoration = $null }
  $stopAttempted = $false
  try {
    Wait-AuditState $ReadState 'Running' $TimeoutSeconds $states
    $stopAttempted = $true
    & $StopAction | Out-Null
    Wait-AuditState $ReadState 'Stopped' $TimeoutSeconds $states
    & $StartAction | Out-Null
    Wait-AuditState $ReadState 'Running' $TimeoutSeconds $states
    $result.status = 'recovered'
  } catch {
    $result.blocker = $_.Exception.Message
    if ($stopAttempted) {
      try {
        $state = [string](& $ReadState)
        if ($state -notin @('Running', 'StartPending')) {
          # A timed-out stop may still complete. Never start while StopPending.
          Wait-AuditState $ReadState 'Stopped' $TimeoutSeconds $states
          & $StartAction | Out-Null
        }
        Wait-AuditState $ReadState 'Running' $TimeoutSeconds $states
        $result.restoration = @{ status = 'recovered' }
      } catch { $result.restoration = @{ status = 'not_run'; blocker = $_.Exception.Message } }
    }
  }
  [pscustomobject]$result
}

function Wait-AuditReadiness {
  param([scriptblock]$ReadState, [int]$TimeoutSeconds, $States)
  # Service startup and HTTP share one readiness budget, before identity collection.
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $last = 'HTTP not ready'
  do {
    $state = [string](& $ReadState)
    $States.Add([pscustomobject]@{ timestamp = [DateTime]::UtcNow.ToString('o'); expected = 'Running'; state = $state })
    $remaining = $TimeoutSeconds - $timer.Elapsed.TotalSeconds
    if ($state -eq 'Running' -and $remaining -gt 0) {
      try {
        # Invoke-WebRequest accepts whole seconds; never use its default long timeout.
        $http = Invoke-WebRequest -Uri 'http://127.0.0.1:3450/' -Method Get -UseBasicParsing -TimeoutSec ([Math]::Max(1, [Math]::Ceiling($remaining))) -MaximumRedirection 0 -ErrorAction Stop
        $last = "HTTP status $($http.StatusCode)"
        if ($http.StatusCode -eq 200 -and $timer.Elapsed.TotalSeconds -le $TimeoutSeconds) { return }
      } catch { $last = $_.Exception.Message }
    }
    $remaining = $TimeoutSeconds - $timer.Elapsed.TotalSeconds
    if ($remaining -le 0) { throw "Timeout waiting for service/HTTP readiness; last state $state; $last" }
    Start-Sleep -Milliseconds ([Math]::Min(250, [Math]::Ceiling($remaining * 1000)))
  } while ($true)
}

function Test-RecoveryHealth {
  param($Evidence, $RunMetadata)
  $validation = Test-RuntimeEvidence $Evidence $RunMetadata
  $reasons = @($validation.reasons)
  if ($Evidence.serviceOwnsListener -ne $true) { $reasons += 'Service does not own HTTP listener' }
  if ($Evidence.startType -ne 'Auto') { $reasons += 'Service start type must be Automatic' }
  [pscustomobject]@{ compatible = ($reasons.Count -eq 0); reasons = @($reasons) }
}

function Test-RebootGate {
  param([bool]$Administrator, [bool]$Confirmed)
  $blocker = if (-not $Confirmed) { 'Explicit -ConfirmReboot is required; no OS reboot authorized by default' }
    elseif (-not $Administrator) { 'Reboot mode requires Administrator execution' } else { $null }
  [pscustomobject]@{ allowed = (-not $blocker); blocker = $blocker }
}

function Test-BootBoundary {
  param([string]$Before, [string]$After)
  (-not [string]::IsNullOrWhiteSpace($Before)) -and (-not [string]::IsNullOrWhiteSpace($After)) -and ($Before -cne $After)
}

function Get-AuditBoot {
  (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).LastBootUpTime.ToUniversalTime().ToString('o')
}

function Test-AuditAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  try { ([Security.Principal.WindowsPrincipal]::new($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }
  finally { $identity.Dispose() }
}

function Invoke-ShortAuditE2E {
  param([string]$FixturePath, [string]$OutDir, [string]$SourceBuildDir, $RunMetadata, [string]$RepoRoot)
  $names = @('E2E_BASE_URL', 'E2E_OUT_DIR', 'E2E_BUILD_DIR', 'E2E_BUILD_ID', 'E2E_BATCH_LIMIT', 'E2E_BATCH_OFFSET', 'E2E_FIXTURE_FILES', 'E2E_FIXTURE_ROOTS', 'E2E_PROCESS_TIMEOUT_MS', 'E2E_PROCESSING_VERSION', 'E2E_REQUIRE_REVIEW_DERIVED_PREVIEW')
  $saved = @{}
  foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  $before = (Get-FileHash -LiteralPath $FixturePath -Algorithm SHA256).Hash.ToLowerInvariant()
  try {
    # Only this child process receives these options; no persisted environment/config changes.
    $env:E2E_BASE_URL = 'http://127.0.0.1:3450/'
    $env:E2E_OUT_DIR = Join-Path $OutDir 'short-e2e'
    $env:E2E_BUILD_DIR = $SourceBuildDir
    $env:E2E_BUILD_ID = $RunMetadata.buildId
    $env:E2E_BATCH_LIMIT = '1'
    $env:E2E_BATCH_OFFSET = '0'
    $env:E2E_FIXTURE_FILES = $FixturePath
    $env:E2E_FIXTURE_ROOTS = Split-Path -Parent $FixturePath
    $env:E2E_PROCESS_TIMEOUT_MS = '120000'
    $env:E2E_PROCESSING_VERSION = if ($RunMetadata.processingVersion) { $RunMetadata.processingVersion } else { 'batch-local-e2e.v1' }
    $env:E2E_REQUIRE_REVIEW_DERIVED_PREVIEW = 'true'
    Push-Location $RepoRoot
    try {
      & node (Join-Path $PSScriptRoot 'e2e-batch-local.mjs') 2>&1 | Out-File -LiteralPath (Join-Path $OutDir 'short-e2e.log') -Encoding utf8
      $code = $LASTEXITCODE
    } finally { Pop-Location }
    $reportPath = Join-Path $OutDir 'short-e2e/report.json'
    if (-not (Test-Path -LiteralPath $reportPath)) { throw "Short E2E produced no report (exit $code); see short-e2e.log" }
    $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
    $results = @($report.results)
    if ($report.processed -ne 1 -or $results.Count -ne 1) { throw 'Short E2E must process exactly one fixture' }
    $item = $results[0]
    $after = (Get-FileHash -LiteralPath $FixturePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($before -cne $after -or $item.sourceSha256 -cne $before) { throw 'Source SHA-256 changed or differs from E2E report' }
    if ($code -ne 0 -or $item.processingStatus -ne 'completed' -or $item.error) { throw "Short E2E failed (exit $code); retain original report for details" }
    if ($report.externalProviderCalls -ne 0 -or $item.externalProviderCall) { throw 'Unauthorized provider route attempted (blocked by existing browser runner)' }
    if (@($item.consoleErrors).Count -ne 0 -or @($item.pageErrors).Count -ne 0) { throw 'Browser console/page errors observed' }
    if (-not $item.tracePath -or -not (Test-Path -LiteralPath $item.tracePath)) { throw 'JSON trace missing' }
    $trace = Get-Content -LiteralPath $item.tracePath -Raw | ConvertFrom-Json
    $candidates = @($trace.items | ForEach-Object { $_.candidates } | Where-Object { $null -ne $_ })
    $uncertain = ($candidates.Count -eq 0) -or @($candidates | Where-Object { $_.needsReview -eq $true -or $_.isConfirmed -ne $true }).Count -gt 0
    if ($uncertain -and $item.status -ne 'review_required') { throw 'Insufficient evidence must remain review_required' }
    if (@(Get-ChildItem -LiteralPath (Join-Path $OutDir 'short-e2e') -Filter '*.png' -File).Count -eq 0) { throw 'Browser screenshot missing' }
    [pscustomobject]@{ status = $item.status; processingStatus = $item.processingStatus; reportPath = $reportPath; sourceSha256 = $before; sourceUnchanged = $true; consoleErrors = 0; pageErrors = 0; externalProviderCalls = 0; tracePath = $item.tracePath }
  } finally {
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
  }
}

function Invoke-RecoveryAudit {
  param(
    [ValidateSet('Preflight', 'Restart', 'Reboot', 'AfterReboot')][string]$Mode = 'Preflight',
    [string]$OutDir, $RunMetadata, [string]$FixturePath, [string]$PriorReportPath,
    [string]$ServiceName = 'digitalevidenceenterprise.exe', [string]$SourceBuildDir = 'build-output-enterprise',
    [int]$TimeoutSeconds = 45, [switch]$ConfirmReboot,
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
  )
  $ErrorActionPreference = 'Stop'
  $OutDir = [IO.Path]::GetFullPath($OutDir)
  if (Test-Path -LiteralPath $OutDir) { throw "Fresh output directory required: $OutDir" }
  # Directory.CreateDirectory alone accepts existing paths; New-Item rejects them.
  New-Item -ItemType Directory -Path $OutDir -ErrorAction Stop | Out-Null
  $report = [ordered]@{
    schema = 'digital-evidence.service-reboot-audit.v1'; mode = $Mode; status = 'not_run'
    startedAt = [DateTime]::UtcNow.ToString('o'); completedAt = $null; blocker = $null
    serviceName = $ServiceName; sourceBuildDir = $SourceBuildDir
    selectedRun = @{ runId = $RunMetadata.runId; buildId = $RunMetadata.buildId; gitCommit = $RunMetadata.gitCommit; processingVersion = $RunMetadata.processingVersion }
    recovery = $null; preflight = $null
    reboot = @{ status = 'not_run'; blocker = 'OS reboot not requested; restart-only is not reboot evidence' }
    shortE2E = @{ status = 'not_run'; blocker = 'Recovery and identity preflight have not passed' }
  }
  $health = @{ status = 'not_run'; blocker = 'No recovery boundary observed; preflight HTTP is not post-recovery evidence' }
  $dispatchReboot = $false
  try {
    $readState = { [string](Get-Service -Name $ServiceName -ErrorAction Stop).Status }
    if ($Mode -eq 'AfterReboot') {
      if (-not $PriorReportPath) { throw 'AfterReboot requires PriorReportPath from explicit Reboot mode' }
      $prior = Get-Content -LiteralPath $PriorReportPath -Raw | ConvertFrom-Json
      $bootAfter = Get-AuditBoot
      if ($prior.mode -ne 'Reboot' -or $prior.reboot.status -ne 'requested' -or $prior.reboot.machine -cne [Environment]::MachineName -or $prior.serviceName -cne $ServiceName -or $prior.selectedRun.buildId -cne $RunMetadata.buildId -or $prior.selectedRun.gitCommit -cne $RunMetadata.gitCommit -or -not (Test-BootBoundary $prior.reboot.bootBefore $bootAfter)) { throw 'OS reboot boundary/selected runtime not established from prior intent' }
      $states = [Collections.Generic.List[object]]::new()
      $report.reboot = @{ status = 'observed'; bootBefore = $prior.reboot.bootBefore; bootAfter = $bootAfter; priorReportPath = $PriorReportPath }
      $report.recovery = @{ kind = 'os_reboot'; status = 'not_run'; states = $states }
      Wait-AuditReadiness $readState $TimeoutSeconds $states
      $report.recovery.status = 'recovered'
    }
    $before = Get-RuntimeEvidence -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir -RepoRoot $RepoRoot
    $report.preflight = Test-RecoveryHealth $before $RunMetadata
    Write-AuditJson (Join-Path $OutDir 'runtime-before.json') $before
    if (-not $report.preflight.compatible) { throw ('Preflight rejected: ' + ($report.preflight.reasons -join '; ')) }
    if ($Mode -eq 'Preflight') { throw 'Read-only preflight selected; no recovery or reboot requested' }
    if ($Mode -eq 'Reboot') {
      $gate = Test-RebootGate -Confirmed $ConfirmReboot.IsPresent -Administrator (Test-AuditAdministrator)
      if (-not $gate.allowed) { $report.reboot.blocker = $gate.blocker; throw $gate.blocker }
      $report.reboot = @{ status = 'requested'; bootBefore = Get-AuditBoot; machine = [Environment]::MachineName; blocker = 'Reboot requested, not yet observed; run AfterReboot with this report in a new output directory' }
      $report.blocker = $report.reboot.blocker
      $dispatchReboot = $true
    } else {
      if ($Mode -eq 'Restart') {
        if (-not $FixturePath -or -not (Test-Path -LiteralPath $FixturePath -PathType Leaf)) { throw 'One explicit real-slip FixturePath is required before restart' }
        # SCM commands return after submitting the request; bounded state polling follows.
        $stopAction = { $output = & sc.exe stop $ServiceName 2>&1; if ($LASTEXITCODE -ne 0) { throw "sc.exe stop failed: $output" } }
        $startAction = { $output = & sc.exe start $ServiceName 2>&1; if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 1056) { throw "sc.exe start failed: $output" } }
        $report.recovery = Invoke-ServiceRecovery -ReadState $readState -StopAction $stopAction -StartAction $startAction -TimeoutSeconds $TimeoutSeconds
        if ($report.recovery.status -ne 'recovered') { throw $report.recovery.blocker }
      }
      $after = Get-RuntimeEvidence -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir -RepoRoot $RepoRoot
      $validation = Test-RecoveryHealth $after $RunMetadata
      Write-AuditJson (Join-Path $OutDir 'runtime-after.json') $after
      $health = @{ status = $(if ($validation.compatible) { 'healthy' } else { 'not_run' }); recoveryKind = $report.recovery.kind; httpStatus = $after.httpStatus; httpBuildId = $after.httpBuildId; validation = $validation; timestamp = $after.timestamp }
      if (-not $validation.compatible) { throw ('Post-recovery identity rejected: ' + ($validation.reasons -join '; ')) }
      if (-not $FixturePath -or -not (Test-Path -LiteralPath $FixturePath -PathType Leaf)) { throw 'One explicit real-slip FixturePath is required for short E2E' }
      $report.shortE2E = @{ status = 'failed'; blocker = 'Short E2E started but did not return a result'; reportPath = (Join-Path $OutDir 'short-e2e/report.json') }
      $report.shortE2E = Invoke-ShortAuditE2E -FixturePath ([IO.Path]::GetFullPath($FixturePath)) -OutDir $OutDir -SourceBuildDir $SourceBuildDir -RunMetadata $RunMetadata -RepoRoot $RepoRoot
      $report.status = 'completed'
    }
  } catch {
    $report.blocker = $_.Exception.Message
    if ($report.shortE2E.status -in @('not_run', 'failed')) { $report.shortE2E.blocker = $report.blocker }
    if ($report.reboot.status -eq 'not_run' -and $Mode -eq 'Reboot') { $report.reboot.blocker = $report.blocker }
  } finally {
    $report.completedAt = [DateTime]::UtcNow.ToString('o')
    $shortReportPath = Join-Path $OutDir 'short-e2e/report.json'
    if ($report.shortE2E.status -in @('not_run', 'failed') -and -not (Test-Path -LiteralPath $shortReportPath)) {
      [IO.Directory]::CreateDirectory((Split-Path -Parent $shortReportPath)) | Out-Null
      Write-AuditJson $shortReportPath @{
        schema = 'digital-evidence.short-e2e-unobserved.v1'; status = $report.shortE2E.status
        blocker = $report.shortE2E.blocker; processed = $null; consoleErrors = $null; pageErrors = $null
        screenshot = $null; tracePath = $null; note = 'No browser result observed; null counts are not zero-error evidence'
      }
    }
    Write-AuditJson (Join-Path $OutDir 'health-after-reboot.json') $health
    Write-AuditJson (Join-Path $OutDir 'service-reboot-report.json') $report
  }
  if ($dispatchReboot) {
    # Intent is durable before crossing the OS boundary. No Force, task scheduler or auto-resume installation.
    try { Restart-Computer -Confirm:$false -ErrorAction Stop }
    catch { Write-AuditJson (Join-Path $OutDir 'reboot-dispatch-error.json') @{ status = 'not_run'; blocker = $_.Exception.Message } }
  }
  [pscustomobject]$report
}

if ($MyInvocation.InvocationName -ne '.') {
  $ErrorActionPreference = 'Stop'
  try {
    if (-not $RunMetadataPath) { throw 'RunMetadataPath is required; use existing selected run metadata, not fabricated matching identity' }
    $metadata = Get-Content -LiteralPath $RunMetadataPath -Raw | ConvertFrom-Json
    $result = Invoke-RecoveryAudit -Mode $Mode -OutDir $OutDir -RunMetadata $metadata -FixturePath $FixturePath -PriorReportPath $PriorReportPath -ServiceName $ServiceName -SourceBuildDir $SourceBuildDir -TimeoutSeconds $TimeoutSeconds -ConfirmReboot:$ConfirmReboot
    $result | ConvertTo-Json -Depth 30
    if ($result.status -ne 'completed') { exit 1 }
  } catch { Write-Error $_; exit 1 }
}
