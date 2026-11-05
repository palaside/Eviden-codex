import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleUrl = new URL('../build-cleanup-manifest.mjs', import.meta.url);
const cli = fileURLToPath(moduleUrl);
const load = () => import(moduleUrl.href);
async function fixture(files = ['unknown.bin']) {
  // Keep fixtures as evidence; neither tests nor generator delete/move files.
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-task6-'));
  for (const file of files) {
    const target = path.join(repoRoot, '.cache', file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `evidence:${file}`, { flag: 'wx' });
  }
  return { repoRoot, roots: [path.join(repoRoot, '.cache')] };
}

test('module exposes the planned read-only manifest interface', async () => {
  assert.equal(typeof (await load()).buildCleanupManifest, 'function');
});

for (const name of ['For Test Results/evidence.bin', 'src/raw.bin', 'code.mjs', 'config.json', 'config.yaml', 'schema.sql', '.env.local',
  'models/weights.bin', 'weights.onnx', 'tha.traineddata', '.next/BUILD_ID', 'dist/bundle.bin']) {
  test(`protected ${name} is retained even with an unreferenced/regenerable claim`, async () => {
    const f = await fixture([name]);
    const target = path.join(f.roots[0], name);
    const referenceIndex = { [target]: { status: 'unreferenced', recoverability: 'regenerable' } };
    const r = await (await load()).buildCleanupManifest({ ...f, referenceIndex });
    const entry = r.entries.find(e => e.path === target || target.startsWith(e.path + path.sep) && e.reason.includes('protected'));
    assert.ok(entry);
    assert.equal(entry.decision, 'retain');
    assert.match(entry.reason, /protected/);
  });
}

test('unknown references retain; only explicit unreferenced and regenerable files are candidates', async () => {
  const f = await fixture(['unknown.bin', 'referenced.bin', 'regenerate.bin', 'irreplaceable.bin']);
  const p = name => path.join(f.roots[0], name);
  const referenceIndex = {
    [p('referenced.bin')]: { status: 'referenced', recoverability: 'regenerable' },
    [p('regenerate.bin')]: { status: 'unreferenced', recoverability: 'regenerable' },
    [p('irreplaceable.bin')]: { status: 'unreferenced' },
  };
  const r = await (await load()).buildCleanupManifest({ ...f, referenceIndex });
  for (const e of r.entries) {
    assert.ok(path.isAbsolute(e.path));
    assert.equal(typeof e.size, 'number');
    assert.ok(Number.isFinite(Date.parse(e.mtime)));
    for (const key of ['type', 'reason', 'referenceStatus', 'recoverability', 'decision']) assert.ok(e[key]);
    assert.equal(e.decision, e.path === p('regenerate.bin') ? 'candidate_for_cleanup' : 'retain');
  }
  assert.equal(r.entries.find(e => e.path === p('unknown.bin')).referenceStatus, 'unknown');
});

test('custom protected paths are pruned and source bytes/mtime stay unchanged', async () => {
  const f = await fixture(['private/raw.bin', 'other.bin']);
  const target = path.join(f.roots[0], 'private/raw.bin');
  const before = { bytes: await fs.readFile(target), stat: await fs.stat(target) };
  const r = await (await load()).buildCleanupManifest({ ...f, protectedPaths: [path.dirname(target)] });
  assert.ok(r.entries.some(e => e.path === path.dirname(target) && e.decision === 'retain'));
  assert.ok(!r.entries.some(e => e.path === target));
  assert.deepEqual(await fs.readFile(target), before.bytes);
  assert.equal((await fs.stat(target)).mtimeMs, before.stat.mtimeMs);
});

test('reject arbitrary/source/build/evidence roots and paths outside repository', async () => {
  const f = await fixture();
  const { buildCleanupManifest } = await load();
  for (const root of ['.', 'src', 'For Test Results', '.next', '../.cache']) {
    await assert.rejects(buildCleanupManifest({ repoRoot: f.repoRoot, roots: [path.resolve(f.repoRoot, root)] }), /cache\/scratch/);
  }
});

test('symlink roots are rejected; linked descendants retained without following', async () => {
  const f = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'cleanup-outside-'));
  await fs.writeFile(path.join(outside, 'secret.bin'), 'outside', { flag: 'wx' });
  await fs.symlink(outside, path.join(f.roots[0], 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.symlink(outside, path.join(f.repoRoot, 'scratch'), process.platform === 'win32' ? 'junction' : 'dir');
  const { buildCleanupManifest } = await load();
  const r = await buildCleanupManifest(f);
  assert.equal(r.entries.find(e => e.path.endsWith(`${path.sep}link`)).decision, 'retain');
  assert.ok(!r.entries.some(e => e.path.includes('secret.bin')));
  await assert.rejects(buildCleanupManifest({ ...f, roots: [path.join(f.repoRoot, 'scratch')] }), /symlink/);
});

test('CLI writes only explicit new manifest, detects package/script references, refuses overwrite and destructive flags', async t => {
  const f = await fixture(['linked.bin', 'script-used.bin', 'unknown.bin']);
  await fs.writeFile(path.join(f.repoRoot, 'package.json'), JSON.stringify({ scripts: { use: 'tool .cache/linked.bin' } }), { flag: 'wx' });
  await fs.mkdir(path.join(f.repoRoot, 'scripts'));
  await fs.writeFile(path.join(f.repoRoot, 'scripts/use.mjs'), 'const input = "script-used.bin";', { flag: 'wx' });
  const output = path.join(f.repoRoot, 'cleanup-manifest.json');
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: f.repoRoot, encoding: 'utf8' });
  assert.notEqual(run(['--root', '.cache']).status, 0);
  assert.equal(await fs.stat(output).catch(() => null), null);
  const args = ['--root', '.cache', '--output', output];
  const first = run(args);
  assert.equal(first.status, 0, first.stderr);
  const bytes = await fs.readFile(output, 'utf8');
  const manifest = JSON.parse(bytes);
  t.diagnostic(`CLI fixture manifest: ${output}`);
  for (const name of ['linked.bin', 'script-used.bin']) {
    assert.equal(manifest.entries.find(e => e.path.endsWith(name)).referenceStatus, 'referenced');
  }
  assert.ok(manifest.entries.every(e => e.decision === 'retain'));
  assert.notEqual(run(args).status, 0);
  assert.equal(await fs.readFile(output, 'utf8'), bytes);
  for (const flag of ['--delete', '--move', '--overwrite', '--force']) assert.notEqual(run([...args, flag]).status, 0);
  assert.notEqual(run(['--root', '.cache', '--output', path.join(f.roots[0], 'cleanup-manifest.json')]).status, 0);
  assert.equal(await fs.readFile(path.join(f.roots[0], 'unknown.bin'), 'utf8'), 'evidence:unknown.bin');
});

test('missing approved roots are reported without fabricating entries', async () => {
  const f = await fixture();
  const r = await (await load()).buildCleanupManifest({ ...f, roots: [path.join(f.repoRoot, 'scratch')] });
  assert.deepEqual(r.entries, []);
  assert.equal(r.roots[0].status, 'missing');
});
