import { lstat, readdir, realpath, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// Deliberately narrow policy: never accept arbitrary directories as scan roots.
export const CACHE_SCRATCH_ROOTS = Object.freeze(['.cache', 'cache', '.scratch', 'scratch', 'tmp', 'temp']);
const protectedNames = /^(?:for test(?: results)?|src|source|scripts|app|pages|public|assets|models?|vendor|node_modules|\.git|\.next(?:[.-].*)?|dist|build|out|coverage|\.env(?:\..*)?)$/i;
const protectedExtension = /\.(?:[cm]?[jt]sx?|json|ya?ml|toml|sql|xml|md|py|ps1|sh|bat|cmd|html|css|scss|vue|svelte|c|cpp|h|rs|go|java|onnx|traineddata|pt|pth|safetensors|gguf|tflite|pb|h5|ckpt|weights)$/i;
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
const protectedPath = (target, protectedPaths) => target.split(path.sep).some(part => protectedNames.test(part))
  || protectedExtension.test(target) || protectedPaths.some(p => inside(p, target));
const optionalStat = async target => {
  try { return await lstat(target); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
};

/** Purely observational scan. referenceIndex is caller-supplied evidence, never inferred from a search miss.
 * A candidate is a regular file with explicit unreferenced + regenerable evidence; no action is performed.
 * Directory sizes are lstat sizes (not recursive totals). Protected directories and links are pruned.
 */
export async function buildCleanupManifest({ roots = [], protectedPaths = [], referenceIndex = {}, repoRoot = process.cwd() } = {}) {
  repoRoot = await realpath(path.resolve(repoRoot));
  protectedPaths = protectedPaths.map(p => path.resolve(repoRoot, p));
  const allowed = CACHE_SCRATCH_ROOTS.map(name => path.join(repoRoot, name));
  const resolvedRoots = [...new Set(roots.map(root => path.resolve(repoRoot, root)))];
  // Validate every root before reading any directory contents.
  for (const root of resolvedRoots) {
    if (!allowed.includes(root)) throw new Error(`Only repository cache/scratch roots are allowed: ${root}`);
    const stat = await optionalStat(root);
    if (stat && (stat.isSymbolicLink() || !stat.isDirectory() || await realpath(root) !== root)) {
      throw new Error(`Refusing symlink or non-directory scan root: ${root}`);
    }
  }
  const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), readOnly: true,
    policy: { allowedRoots: allowed, unknownReferences: 'retain', followLinks: false, directorySize: 'lstat bytes; not recursive' },
    roots: [], entries: [], counts: { candidate_for_cleanup: 0, retain: 0 } };
  async function visit(target) {
    const stat = await lstat(target);
    const type = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
    const ref = Object.hasOwn(referenceIndex, target) ? referenceIndex[target] : undefined;
    const referenceStatus = ['referenced', 'unreferenced'].includes(ref?.status) ? ref.status : 'unknown';
    const recoverability = ref?.recoverability === 'regenerable' ? 'regenerable' : 'unknown';
    const protectedEntry = protectedPath(target, protectedPaths);
    let reason = 'unknown references or recoverability; retain for review';
    let decision = 'retain';
    if (protectedEntry) reason = 'protected path or file type; retain without descending';
    else if (type !== 'file') reason = type === 'symlink' ? 'symlink/junction; retain without following' : 'non-file; retain';
    else if (referenceStatus === 'referenced') reason = 'reference found; retain';
    else if (referenceStatus === 'unreferenced' && recoverability === 'regenerable') {
      reason = 'explicit reference index marks unreferenced and regenerable; proposal only';
      decision = 'candidate_for_cleanup';
    }
    manifest.entries.push({ path: target, type, size: stat.size, mtime: stat.mtime.toISOString(),
      reason, referenceStatus, recoverability, decision });
    manifest.counts[decision]++;
    if (type === 'directory' && !protectedEntry) {
      for (const name of (await readdir(target)).sort()) await visit(path.join(target, name));
    }
  }
  for (const root of resolvedRoots) {
    const stat = await optionalStat(root);
    manifest.roots.push({ path: root, status: stat ? 'scanned' : 'missing' });
    if (stat) await visit(root);
  }
  return manifest;
}

// Search only package scripts and the scripts directory. Misses/errors are unknown,
// since a targeted text search cannot prove the absence of dynamic/external references.
async function findReferences(manifest, repoRoot) {
  let packageScripts = '';
  try { packageScripts = JSON.stringify(JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8')).scripts ?? {}); }
  catch (error) { if (error.code !== 'ENOENT') manifest.referenceWarnings.push(`package scripts unavailable: ${error.code ?? error.name}`); }
  const scripts = path.join(repoRoot, 'scripts');
  const scriptsStat = await optionalStat(scripts);
  const searchScripts = scriptsStat?.isDirectory() && !scriptsStat.isSymbolicLink();
  const index = {};
  for (const entry of manifest.entries.filter(e => e.type === 'file')) {
    const basename = path.basename(entry.path);
    if (packageScripts.includes(basename)) index[entry.path] = { status: 'referenced' };
    else if (searchScripts) {
      const search = spawnSync('rg', ['--files-with-matches', '--fixed-strings', '--', basename, scripts],
        { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024, windowsHide: true });
      if (search.status === 0) index[entry.path] = { status: 'referenced' };
      else if (search.status !== 1) manifest.referenceWarnings.push(`reference search incomplete for ${entry.path}`);
    }
  }
  return index;
}

async function main(args) {
  const roots = [];
  let output;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (!['--root', '--output'].includes(option) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error('No-delete guard: only --root <cache/scratch> and --output <new cleanup-manifest.json> are supported');
    }
    const value = args[++i];
    if (option === '--root') roots.push(value);
    else { if (output) throw new Error('Specify exactly one explicit output'); output = path.resolve(value); }
  }
  if (!output || !roots.length) throw new Error('Explicit --root and --output are required');
  const repoRoot = await realpath(process.cwd());
  const parent = await realpath(path.dirname(output));
  if (parent !== path.dirname(output) || path.basename(output) !== 'cleanup-manifest.json'
    || !inside(repoRoot, output) || protectedPath(parent, [])
    || CACHE_SCRATCH_ROOTS.some(name => inside(path.join(repoRoot, name), output))) {
    throw new Error('No-delete guard: output must be a new cleanup-manifest.json in an existing non-protected repository directory outside scan roots');
  }
  if (await optionalStat(output)) throw new Error('No-delete guard: output already exists; overwrite forbidden');
  const initial = await buildCleanupManifest({ roots, repoRoot });
  initial.referenceWarnings = [];
  const referenceIndex = await findReferences(initial, repoRoot);
  const manifest = await buildCleanupManifest({ roots, repoRoot, referenceIndex });
  manifest.referenceWarnings = initial.referenceWarnings;
  manifest.referenceScope = 'package.json scripts + targeted rg in scripts; absence remains unknown';
  // The sole filesystem mutation: exclusive creation of the explicitly named output.
  // No mkdir, temporary files, rename, truncate, move, unlink, rm, or overwrite fallback.
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ output, counts: manifest.counts, roots: manifest.roots }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
