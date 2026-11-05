import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/run-service-reboot-audit.ps1');
function ps(code) {
  assert.ok(existsSync(script), 'Task 5 recovery audit is missing');
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference='Stop'; . '${script.replaceAll("'", "''")}'; ${code}`], { encoding: 'utf8', timeout: 20000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return JSON.parse(r.stdout.trim());
}
const recovery = `
  $global:state='Running'; $global:actions=@();
  $read={ $global:state }; $stop={ $global:actions+='stop'; $global:state='Stopped' };
  $start={ $global:actions+='start'; $global:state='Running' };
`;

test('restart records stop/wait/start/wait without claiming OS reboot', () => {
  const r = ps(`${recovery}
    $r=Invoke-ServiceRecovery -ReadState $read -StopAction $stop -StartAction $start -TimeoutSeconds 1;
    @{result=$r;actions=$global:actions}|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(r.result.status, 'recovered');
  assert.equal(r.result.kind, 'restart_fallback');
  assert.deepEqual(r.actions, ['stop', 'start']);
  assert.deepEqual(r.result.states.map(x => x.state), ['Running', 'Stopped', 'Running']);
});

test('stop timeout while still Running is not_run and does not submit another start', () => {
  const r = ps(`${recovery}
    $r=Invoke-ServiceRecovery -ReadState $read -StopAction { $global:actions+='stop' } -StartAction $start -TimeoutSeconds 0;
    @{result=$r;actions=$global:actions}|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(r.result.status, 'not_run');
  assert.match(r.result.blocker, /Timeout.*Stopped/);
  assert.deepEqual(r.actions, ['stop']);
  assert.equal(r.result.restoration.status, 'recovered');
});

test('stop timeout waits for terminal Stopped before restoration and verifies Running', () => {
  const r = ps(`${recovery}
    $global:pendingReads=0;
    $read={if($global:state -eq 'StopPending'){$global:pendingReads++;if($global:pendingReads -gt 2){$global:state='Stopped'}};$global:state};
    $stop={$global:actions+='stop';$global:state='StopPending'};
    $start={$global:actions+="start:$global:state";if($global:state -ne 'Stopped'){throw 'start before terminal Stopped'};$global:state='Running'};
    $r=Invoke-ServiceRecovery -ReadState $read -StopAction $stop -StartAction $start -TimeoutSeconds 0;
    @{result=$r;actions=$global:actions}|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(r.result.status, 'not_run');
  assert.match(r.result.blocker, /Timeout.*Stopped.*StopPending/);
  assert.equal(r.result.restoration.status, 'recovered');
  assert.deepEqual(r.actions, ['stop', 'start:Stopped']);
  assert.deepEqual(r.result.states.map(x => x.state), ['Running', 'StopPending', 'Stopped', 'Running']);
});

test('permanent StopPending exhausts restoration window without starting', () => {
  const r = ps(`${recovery}
    $timer=[Diagnostics.Stopwatch]::StartNew();
    $r=Invoke-ServiceRecovery -ReadState $read -StopAction {$global:actions+='stop';$global:state='StopPending'} -StartAction $start -TimeoutSeconds 1;
    @{result=$r;actions=$global:actions;elapsed=$timer.Elapsed.TotalSeconds}|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(r.result.status, 'not_run');
  assert.equal(r.result.restoration.status, 'not_run');
  assert.match(r.result.restoration.blocker, /Timeout.*Stopped.*StopPending/);
  assert.deepEqual(r.actions, ['stop']);
  assert.ok(r.elapsed >= 2 && r.elapsed < 4, `stop and restoration windows: ${r.elapsed}s`);
});

test('restoration start alone cannot claim recovered before Running', () => {
  const r = ps(`${recovery}
    $global:pendingReads=0;
    $read={if($global:state -eq 'StopPending'){$global:pendingReads++;if($global:pendingReads -gt 2){$global:state='Stopped'}};$global:state};
    Invoke-ServiceRecovery -ReadState $read -StopAction {$global:state='StopPending'} -StartAction {$global:state='StartPending'} -TimeoutSeconds 0 | ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(r.status, 'not_run');
  assert.equal(r.restoration.status, 'not_run');
  assert.match(r.restoration.blocker, /Timeout.*Running.*StartPending/);
});

test('start timeout and stop errors retain failure and restoration evidence', () => {
  const results = ps(`${recovery}
    $a=Invoke-ServiceRecovery -ReadState $read -StopAction $stop -StartAction {} -TimeoutSeconds 0;
    $global:state='Running';
    $b=Invoke-ServiceRecovery -ReadState $read -StopAction {throw 'access denied'} -StartAction $start -TimeoutSeconds 0;
    @($a,$b)|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(results[0].status, 'not_run');
  assert.match(results[0].blocker, /Timeout.*Running/);
  assert.match(results[1].blocker, /access denied/);
  assert.equal(results[1].restoration.status, 'recovered');
});

test('post-recovery requires HTTP 200, matching identities and owned listener', () => {
  const results = ps(`
    $m=[pscustomobject]@{buildId='build';gitCommit='commit'};
    $e=[pscustomobject]@{serviceName='svc';status='Running';startType='Auto';binaryPath='svc.exe';BUILD_ID='build';sourceBuildId='build';httpBuildId='build';gitCommit='commit';httpStatus=200;NEXT_DIST_DIR='dist';timestamp='now';serviceOwnsListener=$true;errors=@()};
    $good=Test-RecoveryHealth $e $m;
    $bad=@(@{httpStatus=503},@{httpBuildId='wrong'},@{BUILD_ID='wrong'},@{sourceBuildId='wrong'},@{gitCommit='wrong'},@{serviceOwnsListener=$false},@{startType='Manual'})|ForEach-Object {$c=$e.PSObject.Copy();foreach($k in $_.Keys){$c.$k=$_[$k]};Test-RecoveryHealth $c $m};
    @{good=$good;bad=@($bad)}|ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(results.good.compatible, true);
  for (const r of results.bad) assert.equal(r.compatible, false);
});

test('reboot requires explicit confirmation and Administrator; resume requires changed boot', () => {
  const r = ps(`@{
    unconfirmed=(Test-RebootGate -Administrator $true -Confirmed $false);
    unprivileged=(Test-RebootGate -Administrator $false -Confirmed $true);
    allowed=(Test-RebootGate -Administrator $true -Confirmed $true);
    same=(Test-BootBoundary 'boot1' 'boot1'); changed=(Test-BootBoundary 'boot1' 'boot2'); missing=(Test-BootBoundary '' 'boot2')
  }|ConvertTo-Json -Depth 5 -Compress`);
  assert.match(r.unconfirmed.blocker, /ConfirmReboot/);
  assert.match(r.unprivileged.blocker, /Administrator/);
  assert.equal(r.allowed.allowed, true);
  assert.equal(r.same, false);
  assert.equal(r.changed, true);
  assert.equal(r.missing, false);
});

test('CLI preflight failure writes fresh negative evidence and never runs recovery or E2E', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'task5-audit-')), 'fresh');
  const r = ps(`
    function Get-RuntimeEvidence { [pscustomobject]@{httpStatus=503;errors=@('fixture unavailable')} }
    function Stop-Service { throw 'MUST NOT STOP' }; function Start-Service { throw 'MUST NOT START' }
    Invoke-RecoveryAudit -Mode Restart -OutDir '${out.replaceAll("'", "''")}' -RunMetadata ([pscustomobject]@{buildId='b';gitCommit='c'}) -FixturePath 'missing.jpg' | ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(r.status, 'not_run');
  assert.equal(r.shortE2E.status, 'not_run');
  assert.equal(r.reboot.status, 'not_run');
  assert.match(r.blocker, /Preflight/);
  for (const f of ['service-reboot-report.json', 'health-after-reboot.json', 'runtime-before.json']) {
    assert.ok(existsSync(path.join(out, f)), f);
  }
  assert.equal(JSON.parse(readFileSync(path.join(out, 'health-after-reboot.json'))).status, 'not_run');
  const skipped = JSON.parse(readFileSync(path.join(out, 'short-e2e', 'report.json')));
  assert.equal(skipped.status, 'not_run');
  assert.equal(skipped.consoleErrors, null);
  assert.equal(skipped.pageErrors, null);
  const again = ps(`$rejected=$false;try{Invoke-RecoveryAudit -Mode Restart -OutDir '${out.replaceAll("'", "''")}' -RunMetadata @{} }catch{$rejected=$true};$rejected|ConvertTo-Json`);
  assert.equal(again, true);
});

test('loading collector preserves explicit audit CLI parameters', () => {
  assert.ok(existsSync(script));
  const r = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
    `. '${script.replaceAll("'", "''")}' -RunMetadataPath selected.json -OutDir chosen-output -ServiceName selected-service -SourceBuildDir selected-build; @{metadata=$RunMetadataPath;out=$OutDir;service=$ServiceName;build=$SourceBuildDir}|ConvertTo-Json -Compress`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { metadata: 'selected.json', out: 'chosen-output', service: 'selected-service', build: 'selected-build' });
});

const healthy = `
  $m=[pscustomobject]@{buildId='build';gitCommit='commit'};
  function Get-RuntimeEvidence { [pscustomobject]@{serviceName='svc';status='Running';startType='Auto';binaryPath='svc.exe';BUILD_ID='build';sourceBuildId='build';httpBuildId='build';gitCommit='commit';httpStatus=200;NEXT_DIST_DIR='dist';timestamp='now';serviceOwnsListener=$true;errors=@()} }
`;

test('AfterReboot waits for service and HTTP before identity preflight, retaining gates and artifacts', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'task5-ready-')).replaceAll("'", "''");
  const r = ps(`${healthy}
    $global:events=@();$global:serviceReads=0;$global:httpReads=0;$global:shortCalls=0;
    function Get-AuditBoot {'new-boot'}
    function Restart-Computer {throw 'MUST NOT REBOOT'}
    function Get-Service {$global:serviceReads++;$s=if($global:serviceReads -le 2){'StartPending'}else{'Running'};$global:events+=$s;[pscustomobject]@{Status=$s}}
    function Invoke-WebRequest {$global:httpReads++;$global:events+='http';if($global:httpReads -eq 1){throw 'connection refused'};[pscustomobject]@{StatusCode=200}}
    $getHealthy=(Get-Command Get-RuntimeEvidence).ScriptBlock;
    function Get-RuntimeEvidence {$global:events+='identity';$e=& $getHealthy;if($global:httpReads -lt 2){$e.status='StartPending';$e.httpStatus=503};$e}
    function Invoke-ShortAuditE2E {$global:shortCalls++;@{status='review_required'}}
    $prior=Join-Path '${base}' 'prior.json';
    Write-AuditJson $prior @{mode='Reboot';serviceName='digitalevidenceenterprise.exe';selectedRun=$m;reboot=@{status='requested';bootBefore='old-boot';machine=[Environment]::MachineName}};
    $r=Invoke-RecoveryAudit -Mode AfterReboot -PriorReportPath $prior -OutDir (Join-Path '${base}' 'audit') -RunMetadata $m -FixturePath '${script.replaceAll("'", "''")}' -TimeoutSeconds 3;
    @{result=$r;events=$global:events;shortCalls=$global:shortCalls}|ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(r.result.status, 'completed');
  assert.equal(r.result.reboot.status, 'observed');
  assert.equal(r.result.recovery.kind, 'os_reboot');
  assert.equal(r.shortCalls, 1);
  assert.ok(r.events.indexOf('identity') > r.events.lastIndexOf('http'));
  assert.equal(r.events.filter(x => x === 'http').length, 2);
  assert.deepEqual(r.events.slice(0, 2), ['StartPending', 'StartPending']);
  const out = path.join(base, 'audit');
  assert.equal(JSON.parse(readFileSync(path.join(out, 'runtime-before.json'))).status, 'Running');
  assert.equal(JSON.parse(readFileSync(path.join(out, 'health-after-reboot.json'))).status, 'healthy');
});

test('AfterReboot readiness is bounded and a ready wrong identity still fails closed', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'task5-ready-negative-')).replaceAll("'", "''");
  const results = ps(`${healthy}
    function Get-AuditBoot {'new-boot'}
    function Restart-Computer {throw 'MUST NOT REBOOT'}
    $global:shortCalls=0;function Invoke-ShortAuditE2E {$global:shortCalls++;throw 'MUST NOT BROWSE'}
    $getHealthy=(Get-Command Get-RuntimeEvidence).ScriptBlock;
    function Get-Service {[pscustomobject]@{Status=$(if($global:scenario -eq 'service'){'StartPending'}else{'Running'})}}
    function Invoke-WebRequest {if($global:scenario -eq 'http'){[pscustomobject]@{StatusCode=503}}else{[pscustomobject]@{StatusCode=200}}}
    function Get-RuntimeEvidence {$e=& $getHealthy;$e.httpBuildId='wrong';$e}
    $prior=Join-Path '${base}' 'prior.json';
    Write-AuditJson $prior @{mode='Reboot';serviceName='digitalevidenceenterprise.exe';selectedRun=$m;reboot=@{status='requested';bootBefore='old-boot';machine=[Environment]::MachineName}};
    $results=@();foreach($scenario in @('service','http','identity')){
      $global:scenario=$scenario;$timer=[Diagnostics.Stopwatch]::StartNew();
      $r=Invoke-RecoveryAudit -Mode AfterReboot -PriorReportPath $prior -OutDir (Join-Path '${base}' $scenario) -RunMetadata $m -TimeoutSeconds 1;
      $results+=@{result=$r;elapsed=$timer.Elapsed.TotalSeconds}
    };@{cases=$results;shortCalls=$global:shortCalls}|ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(results.shortCalls, 0);
  for (const [i, c] of results.cases.entries()) {
    assert.equal(c.result.status, 'not_run');
    assert.equal(c.result.shortE2E.status, 'not_run');
    assert.ok(c.elapsed < 4, `bounded readiness: ${c.elapsed}s`);
    assert.match(c.result.blocker, i < 2 ? /Timeout.*readiness/ : /Preflight rejected.*httpBuildId mismatch/);
  }
  for (const scenario of ['service', 'http', 'identity']) {
    const out = path.join(base, scenario);
    assert.equal(JSON.parse(readFileSync(path.join(out, 'service-reboot-report.json'))).status, 'not_run');
    assert.equal(JSON.parse(readFileSync(path.join(out, 'short-e2e', 'report.json'))).consoleErrors, null);
  }
});
test('audit orchestration records restart fallback and blocks browser on post-recovery mismatch', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'task5-flow-')).replaceAll("'", "''");
  const r = ps(`${healthy}
    $fixture=Join-Path '${base}' 'slip.jpg'; [IO.File]::WriteAllText($fixture,'synthetic fixture');
    $global:state='Running';$global:shortCalls=0;
    function Get-Service { [pscustomobject]@{Status=$global:state} }
    function sc.exe {param($operation,$name); $global:state=if($operation -eq 'stop'){'Stopped'}else{'Running'};$global:LASTEXITCODE=0 }
    function Invoke-ShortAuditE2E {$global:shortCalls++;@{status='review_required'}}
    $a=Invoke-RecoveryAudit -Mode Restart -OutDir (Join-Path '${base}' 'good') -RunMetadata $m -FixturePath $fixture;
    $global:reads=0;
    function Get-RuntimeEvidence { $global:reads++;[pscustomobject]@{serviceName='svc';status='Running';startType='Auto';binaryPath='svc.exe';BUILD_ID='build';sourceBuildId='build';httpBuildId=$(if($global:reads -eq 1){'build'}else{'wrong'});gitCommit='commit';httpStatus=200;NEXT_DIST_DIR='dist';timestamp='now';serviceOwnsListener=$true;errors=@()} }
    $b=Invoke-RecoveryAudit -Mode Restart -OutDir (Join-Path '${base}' 'mismatch') -RunMetadata $m -FixturePath $fixture;
    @{good=$a;bad=$b;shortCalls=$global:shortCalls}|ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(r.good.status, 'completed');
  assert.equal(r.good.shortE2E.status, 'review_required');
  assert.equal(r.good.reboot.status, 'not_run');
  assert.equal(r.bad.status, 'not_run');
  assert.match(r.bad.blocker, /Post-recovery identity rejected.*httpBuildId mismatch/);
  assert.equal(r.shortCalls, 1);
  assert.equal(JSON.parse(readFileSync(path.join(base, 'good', 'health-after-reboot.json'))).recoveryKind, 'restart_fallback');
  assert.ok(existsSync(path.join(base, 'mismatch', 'runtime-after.json')));
});

test('an E2E exception is failed rather than falsely not_run', () => {
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'task5-e2e-error-')), 'fresh').replaceAll("'", "''");
  const r = ps(`${healthy}
    function Invoke-ServiceRecovery { @{status='recovered';kind='restart_fallback'} }
    function Invoke-ShortAuditE2E { throw 'browser launch failed' }
    Invoke-RecoveryAudit -Mode Restart -OutDir '${out}' -RunMetadata $m -FixturePath '${script.replaceAll("'", "''")}' | ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(r.shortE2E.status, 'failed');
  assert.match(r.shortE2E.blocker, /browser launch failed/);
});

test('unprivileged Reboot and same-boot AfterReboot never call reboot or browser', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'task5-boot-')).replaceAll("'", "''");
  const r = ps(`${healthy}
    function Test-AuditAdministrator {$false}; function Get-AuditBoot {'same-boot'}
    function Restart-Computer {throw 'MUST NOT REBOOT'};function Invoke-ShortAuditE2E {throw 'MUST NOT BROWSE'}
    $a=Invoke-RecoveryAudit -Mode Reboot -ConfirmReboot -OutDir (Join-Path '${base}' 'unprivileged') -RunMetadata $m;
    $prior=Join-Path '${base}' 'prior.json';
    Write-AuditJson $prior @{mode='Reboot';serviceName='digitalevidenceenterprise.exe';selectedRun=$m;reboot=@{status='requested';bootBefore='same-boot';machine=[Environment]::MachineName}};
    $b=Invoke-RecoveryAudit -Mode AfterReboot -PriorReportPath $prior -OutDir (Join-Path '${base}' 'same') -RunMetadata $m;
    @($a,$b)|ConvertTo-Json -Depth 10 -Compress`);
  assert.match(r[0].reboot.blocker, /Administrator/);
  assert.match(r[1].blocker, /reboot boundary/);
  for (const result of r) assert.equal(result.shortE2E.status, 'not_run');
});

test('short wrapper limits to one, retains review_required, validates artifacts and restores environment', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'task5-short-')).replaceAll("'", "''");
  const r = ps(`
    $fixture=Join-Path '${base}' 'synthetic.jpg';[IO.File]::WriteAllText($fixture,'synthetic test bytes, not a real slip');
    $global:case='review_required';$global:limits=@();$global:provider=0;
    function node {
      $global:limits+=$env:E2E_BATCH_LIMIT;
      New-Item -ItemType Directory -Path $env:E2E_OUT_DIR|Out-Null;
      $trace=Join-Path $env:E2E_OUT_DIR '001-trace.json';
      Write-AuditJson $trace @{items=@(@{candidates=@(@{needsReview=$true;isConfirmed=$false})})};
      [IO.File]::WriteAllText((Join-Path $env:E2E_OUT_DIR '001.png'),'synthetic screenshot placeholder');
      $sha=(Get-FileHash -LiteralPath $env:E2E_FIXTURE_FILES -Algorithm SHA256).Hash.ToLowerInvariant();
      Write-AuditJson (Join-Path $env:E2E_OUT_DIR 'report.json') @{processed=1;externalProviderCalls=$global:provider;results=@(@{sourceSha256=$sha;processingStatus='completed';status=$global:case;tracePath=$trace;consoleErrors=@();pageErrors=@()})};
      $global:LASTEXITCODE=0;
    }
    $env:E2E_BATCH_LIMIT='previous';$m=@{buildId='build'};
    $results=@();foreach($scenario in @('review_required','completed','provider')){
      $global:case=if($scenario -eq 'provider'){'review_required'}else{$scenario};$global:provider=if($scenario -eq 'provider'){1}else{0};
      $out=Join-Path '${base}' $scenario;New-Item -ItemType Directory -Path $out|Out-Null;
      try{$value=Invoke-ShortAuditE2E -FixturePath $fixture -OutDir $out -SourceBuildDir dist -RunMetadata $m -RepoRoot (Get-Location).Path;$results+=@{status=$value.status}}catch{$results+=@{error=$_.Exception.Message}}
    };@{results=$results;limits=$global:limits;restored=$env:E2E_BATCH_LIMIT}|ConvertTo-Json -Depth 10 -Compress`);
  assert.equal(r.results[0].status, 'review_required');
  assert.match(r.results[1].error, /must remain review_required/);
  assert.match(r.results[2].error, /Unauthorized provider/);
  assert.deepEqual(r.limits, ['1', '1', '1']);
  assert.equal(r.restored, 'previous');
});
