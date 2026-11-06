import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('PowerShell wrapper flattens a JSON batch array before filtering BatchId', async () => {
  const source = await readFile(new URL('../run-batch500-resumable.ps1', import.meta.url), 'utf8');
  assert.match(
    source,
    /\$ranges\s*\|\s*ConvertFrom-Json\s*\|\s*Write-Output/,
    'Windows PowerShell 5 emits a JSON array as one pipeline item; the wrapper must explicitly enumerate it before selecting a single batch',
  );
});

test('PowerShell wrapper lets Node supply UTF-8 default fixture roots', async () => {
  const source = await readFile(new URL('../run-batch500-resumable.ps1', import.meta.url), 'utf8');
  assert.match(
    source,
    /\$PSBoundParameters\.ContainsKey\('FixtureRoots'\)/,
    'passing the Thai default roots through Windows PowerShell corrupts the Node argument encoding; only explicit overrides may be forwarded',
  );
});
