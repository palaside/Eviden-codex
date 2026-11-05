import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.resolve('scripts/collect-runtime-evidence.ps1');
function ps(code) {
  assert.ok(existsSync(script), 'Task 4 PowerShell collector is missing');
  const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; . '${script.replaceAll("'", "''")}'; ${code}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}
const fixture = `$e = [pscustomobject]@{ serviceName='svc'; status='Running'; startType='Auto'; binaryPath='C:\\svc.exe'; BUILD_ID='build'; sourceBuildId='build'; gitCommit='commit'; httpStatus=200; httpBuildId='build'; NEXT_DIST_DIR='dist'; timestamp='2026-11-05T00:00:00Z'; errors=@() }; $m = [pscustomobject]@{buildId='build';gitCommit='commit'}`;

test('collector exists and exposes the required evidence contract', () => {
  assert.ok(existsSync(script), 'Task 4 PowerShell collector is missing');
  const result = ps(`${fixture}; Test-RuntimeEvidence $e $m | ConvertTo-Json -Compress`);
  assert.equal(result.compatible, true);
  assert.deepEqual(result.reasons, []);
});

test('fails closed for each missing required field', () => {
  const results = ps(`${fixture}; @('serviceName','status','startType','binaryPath','BUILD_ID','sourceBuildId','gitCommit','httpStatus','httpBuildId','NEXT_DIST_DIR','timestamp') | ForEach-Object { $copy = $e.PSObject.Copy(); $copy.$_ = $null; Test-RuntimeEvidence $copy $m } | ConvertTo-Json -Depth 5 -Compress`);
  assert.equal(results.length, 11);
  for (const result of results) assert.equal(result.compatible, false);
});

test('rejects build, source, HTTP, commit, service and collection failures independently', () => {
  const results = ps(`${fixture}; @(@{BUILD_ID='other'},@{sourceBuildId='other'},@{httpBuildId='other'},@{gitCommit='other'},@{status='Stopped'},@{httpStatus=503},@{errors=@('CIM unavailable')}) | ForEach-Object { $copy=$e.PSObject.Copy(); foreach($key in $_.Keys){$copy.$key=$_[$key]}; Test-RuntimeEvidence $copy $m } | ConvertTo-Json -Depth 5 -Compress`);
  for (const result of results) { assert.equal(result.compatible, false); assert.ok(result.reasons.length); }
  const missing = ps(`${fixture}; @([pscustomobject]@{},[pscustomobject]@{buildId='build'},[pscustomobject]@{gitCommit='commit'}) | ForEach-Object { Test-RuntimeEvidence $e $_ } | ConvertTo-Json -Depth 5 -Compress`);
  for (const result of missing) assert.equal(result.compatible, false);
});

test('writes both observation phases, retains mismatches and never overwrites evidence', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'task4-runtime-'));
  const dir = out.replaceAll("'", "''");
  const result = ps(`${fixture}; function Get-RuntimeEvidence { $e.PSObject.Copy() }; $before=Save-RuntimeEvidence -RunMetadata $m -OutDir '${dir}' -Phase before; $e.BUILD_ID='other'; $after=Save-RuntimeEvidence -RunMetadata $m -OutDir '${dir}' -Phase after; $rejected=$false; try { Save-RuntimeEvidence -RunMetadata $m -OutDir '${dir}' -Phase before } catch { $rejected=$true }; @{before=$before;after=$after;overwriteRejected=$rejected} | ConvertTo-Json -Depth 8 -Compress`);
  assert.equal(result.before.compatible, true);
  assert.equal(result.after.compatible, false);
  assert.equal(result.overwriteRejected, true);
  for (const phase of ['before', 'after']) {
    const data = JSON.parse(readFileSync(path.join(out, `runtime-${phase}.json`), 'utf8'));
    for (const key of ['serviceName','status','startType','binaryPath','BUILD_ID','sourceBuildId','gitCommit','httpStatus','NEXT_DIST_DIR','timestamp']) assert.ok(key in data, key);
    assert.equal(data.phase, phase);
    assert.equal(data.validation.compatible, phase === 'before');
    assert.equal(data.observationOnly, true);
  }
});

test('collection reads service XML, both BUILD_ID files, sc, git and HTTP; rejects an unrelated listener', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'task4-collect-')).replaceAll("'", "''");
  const result = ps(`
    $root='${dir}'; [IO.Directory]::CreateDirectory((Join-Path $root 'dist')) | Out-Null
    [IO.File]::WriteAllText((Join-Path $root 'dist/BUILD_ID'), 'build')
    $xml='<service><id>svc</id><workingdirectory>'+[Security.SecurityElement]::Escape($root)+'</workingdirectory><env name="NEXT_DIST_DIR" value="dist"/></service>'
    [IO.File]::WriteAllText((Join-Path $root 'svc.xml'), $xml)
    function Get-CimInstance { param($ClassName,$Filter)
      if($ClassName -eq 'Win32_Service'){[pscustomobject]@{State='Running';StartMode='Auto';PathName=('"'+(Join-Path $root 'svc.exe')+'"');ProcessId=10}}
      else{[pscustomobject]@{ParentProcessId=10}}
    }
    function Get-NetTCPConnection { [pscustomobject]@{OwningProcess=20} }
    function sc.exe { $global:LASTEXITCODE=0; 'SC evidence' }
    function git { $global:LASTEXITCODE=0; 'commit' }
    function Invoke-WebRequest { [pscustomobject]@{StatusCode=200;Content='{"b":"build"}'} }
    $good=Get-RuntimeEvidence -ServiceName svc -SourceBuildDir dist -RepoRoot $root
    $m=[pscustomobject]@{buildId='build';gitCommit='commit'}
    function Get-CimInstance { param($ClassName,$Filter)
      if($ClassName -eq 'Win32_Service'){[pscustomobject]@{State='Running';StartMode='Auto';PathName=('"'+(Join-Path $root 'svc.exe')+'"');ProcessId=10}}
      else{[pscustomobject]@{ParentProcessId=0}}
    }
    $bad=Get-RuntimeEvidence -ServiceName svc -SourceBuildDir dist -RepoRoot $root
    @{good=$good;validation=(Test-RuntimeEvidence $good $m);bad=(Test-RuntimeEvidence $bad $m)} | ConvertTo-Json -Depth 8 -Compress
  `);
  assert.equal(result.validation.compatible, true);
  assert.equal(result.good.BUILD_ID, 'build');
  assert.equal(result.good.sourceBuildId, 'build');
  assert.equal(result.good.httpBuildId, 'build');
  assert.equal(result.good.NEXT_DIST_DIR, 'dist');
  assert.equal(result.good.serviceOwnsListener, true);
  assert.equal(result.good.scQc, 'SC evidence');
  assert.equal(result.good.scQuery, 'SC evidence');
  assert.equal(result.bad.compatible, false);
  assert.ok(result.bad.reasons.some(x => x.includes('not a descendant')));
});
