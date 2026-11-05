import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../promote-enterprise-build.ps1', import.meta.url));
const root = path.dirname(path.dirname(script));
const cases = [
  { name: 'default relative paths' },
  { name: 'nested relative paths with spaces', source: 'staging builds/source', target: 'release builds/target' },
  { name: 'absolute paths inside project (no duplicated root)', source: path.join(root, 'source build'), target: path.join(root, 'target build') },
  { name: 'absolute paths on another drive', source: 'Z:\\builds\\source build', target: 'Z:\\builds\\target build' },
  { name: 'UNC absolute paths', source: '\\\\build-server\\share\\source build', target: '\\\\build-server\\share\\target build' },
  { name: 'absolute source and relative target', source: 'Z:\\builds\\source', target: 'release/target' },
  { name: 'relative source and absolute target', source: 'staging/source', target: 'Z:\\builds\\target' },
  { name: 'dot relative paths retain Join-Path behavior', source: '.\\staging\\source', target: '..\\release\\target',
    expectedSource: root + '\\.\\staging\\source', expectedTarget: root + '\\..\\release\\target' },
  { name: 'rooted paths use the project drive root', source: '\\staging\\source', target: '\\release\\target',
    expectedSource: path.win32.join(path.win32.parse(root).root, 'staging/source'),
    expectedTarget: path.win32.join(path.win32.parse(root).root, 'release/target') },
  { name: 'rooted paths normalize parent segments', source: '\\staging\\..\\source', target: '/release/../target',
    expectedSource: path.win32.join(path.win32.parse(root).root, 'source'),
    expectedTarget: path.win32.join(path.win32.parse(root).root, 'target') },
  { name: 'drive-relative source is rejected before promotion', source: 'C:staging\\source',
    expectedError: 'Drive-relative build path is ambiguous: C:staging\\source. Use an absolute path.' },
  { name: 'drive-relative target is rejected before promotion', target: 'C:staging\\source',
    expectedError: 'Drive-relative build path is ambiguous: C:staging\\source. Use an absolute path.' },
];

// Parse the real script, but execute ONLY its three path assignments. Never
// invoke/dot-source the promotion script, even with -WhatIf: its preflight
// checks access the filesystem and service manager before ShouldProcess.
const harness = String.raw`
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:PROMOTE_TEST_SCRIPT, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$assignments = @($ast.EndBlock.Statements | Where-Object {
  $_ -is [System.Management.Automation.Language.AssignmentStatementAst] -and
  $_.Left.VariablePath.UserPath -in @('projectRoot', 'sourcePath', 'targetPath')
})
if ($assignments.Count -ne 3) { throw 'Expected exactly three path assignments' }
$code = ($assignments | ForEach-Object { $_.Extent.Text }) -join "
"
$pathAst = [System.Management.Automation.Language.Parser]::ParseInput($code, [ref]$tokens, [ref]$errors)
$commands = $pathAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.CommandAst] }, $true)
foreach ($command in $commands) {
  if ($command.GetCommandName() -notin @('Split-Path', 'Join-Path')) { throw 'Unsafe command in path assignments' }
}
$methods = $pathAst.FindAll({ param($node) $node -is [System.Management.Automation.Language.InvokeMemberExpressionAst] }, $true)
foreach ($method in $methods) {
  $isPathMethod = $method.Static -and $method.Expression.Extent.Text -eq '[System.IO.Path]' -and
    $method.Member.Value -in @('IsPathRooted', 'GetFullPath', 'GetPathRoot')
  $isRootRemoval = -not $method.Static -and $method.Expression.Extent.Text -in @('$BuildSource', '$BuildTarget') -and
    $method.Member.Value -eq 'Substring' -and $method.Arguments.Count -eq 1 -and $method.Arguments[0].Extent.Text -eq '1'
  if (-not ($isPathMethod -or $isRootRemoval)) {
    throw 'Unsafe method in path assignments'
  }
}
$defaults = @{}
foreach ($parameter in $ast.ParamBlock.Parameters) {
  if ($parameter.Name.VariablePath.UserPath -in @('BuildSource', 'BuildTarget')) {
    $defaults[$parameter.Name.VariablePath.UserPath] = $parameter.DefaultValue.SafeGetValue()
  }
}
$results = foreach ($case in (ConvertFrom-Json $env:PROMOTE_TEST_CASES)) {
  & {
    param($case, $defaults, $code)
    $BuildSource = $defaults.BuildSource
    $BuildTarget = $defaults.BuildTarget
    if ($null -ne $case.source) { $BuildSource = $case.source }
    if ($null -ne $case.target) { $BuildTarget = $case.target }
    try {
      . ([scriptblock]::Create('param($PSScriptRoot)' + [Environment]::NewLine + $code)) (Split-Path -Parent $env:PROMOTE_TEST_SCRIPT)
      @{ source = $sourcePath; target = $targetPath; name = $case.name }
    } catch {
      @{ error = $_.Exception.Message; name = $case.name }
    }
  } $case $defaults $code
}
ConvertTo-Json -InputObject @($results) -Compress
`;

for (const shell of process.platform === 'win32' ? ['powershell.exe', 'pwsh'] : ['pwsh']) {
  for (const cwd of [tmpdir(), root]) {
    test(`${shell} from ${cwd}: PowerShell syntax and isolated promotion path contract`, async (t) => {
      const result = spawnSync(shell, ['-NoProfile', '-NonInteractive', '-EncodedCommand',
        Buffer.from(harness, 'utf16le').toString('base64')], {
        encoding: 'utf8', timeout: 20000, cwd,
        env: { ...process.env, PROMOTE_TEST_SCRIPT: script, PROMOTE_TEST_CASES: JSON.stringify(cases) },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr || result.stdout);
      const actual = JSON.parse(result.stdout.trim());
      assert.equal(actual.length, cases.length);
      for (const [index, input] of cases.entries()) {
        await t.test(input.name, () => {
          if (input.expectedError) {
            assert.equal(actual[index].error, input.expectedError);
            return;
          }
          assert.equal(actual[index].error, undefined);
          const source = input.source ?? 'build-output-e2e-20261028-final2';
          const target = input.target ?? 'build-output-enterprise';
          assert.equal(actual[index].source, input.expectedSource ?? (path.isAbsolute(source) ? source : path.join(root, source)));
          assert.equal(actual[index].target, input.expectedTarget ?? (path.isAbsolute(target) ? target : path.join(root, target)));
        });
      }
    });
  }
}
