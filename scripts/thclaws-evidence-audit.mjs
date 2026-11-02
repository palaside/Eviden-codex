import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || process.cwd());
const input = process.argv[3] || 'For Test\\แชทที่ 3\\chatv3 (97).jpg';
const outputRoot = path.resolve(process.argv[4] || path.join(root, 'For Test Results', 'thclaws-audit'));
const auditId = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join(outputRoot, auditId);
const rel = (p) => path.relative(root, p).replaceAll('\\', '/');
const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

async function walk(dir, predicate, limit = 5000, maxDepth = 8) {
  const result = [];
  async function visit(current, depth) {
    if (result.length >= limit) return;
    if (depth > maxDepth) return;
    let entries = [];
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (result.length >= limit) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink() && !['node_modules', '.git', '.next', 'dist', 'build', '__pycache__'].includes(entry.name)) await visit(full, depth + 1);
      else if (entry.isFile() && predicate(full)) result.push(full);
    }
  }
  await visit(dir, 0);
  return result;
}

function containsAny(text, terms) { return terms.some((term) => text.toLowerCase().includes(term.toLowerCase())); }

async function main() {
  console.error('[audit] start');
  const rootAgents = path.join(root, 'AGENTS.md');
  const skillFiles = await walk(path.join(root, 'skills'), (p) => p.endsWith('SKILL.md'));
  console.error(`[audit] skills=${skillFiles.length}`);
  const sourceFiles = [
    ...(await walk(path.join(root, 'src'), (p) => /\.(ts|tsx|js|mjs|json)$/.test(p))),
    ...(await walk(path.join(root, 'scripts'), (p) => /\.(js|mjs|py|ps1|json)$/.test(p)))
  ];
  const traceFiles = await walk(path.join(root, 'For Test Results'), (p) => p.endsWith('.json'));
  const legalReferencePath = path.join(root, 'src', 'data', 'raw_thai_law_master_reference.json');
  let legalReference = null;
  try { legalReference = JSON.parse(await fs.readFile(legalReferencePath, 'utf8')); } catch { legalReference = null; }
  console.error(`[audit] source=${sourceFiles.length} traces=${traceFiles.length}`);
  const parseable = [];
  const unreadable = [];
  const skippedLarge = [];
  const statusCounts = {};
  const traceClassCounts = {};
  const traceClassSamples = {};
  const signalFiles = [];
  for (const file of traceFiles) {
    try {
      const stat = await fs.stat(file);
      if (stat.size > 2_000_000) { skippedLarge.push(file); continue; }
      const raw = await fs.readFile(file, 'utf8');
      const data = JSON.parse(raw);
      parseable.push(file);
      const status = data?.status || data?.overallStatus || data?.reviewStatus || data?.result?.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const statusText = String(status).toLowerCase();
      const processed = Number.isFinite(Number(data?.processed)) ? Number(data.processed) : null;
      const failed = Number.isFinite(Number(data?.failed)) ? Number(data.failed) : null;
      let traceClass = 'unknown';
      if (/(partial-report|partial)/i.test(path.basename(file))) traceClass = 'partial_or_incomplete';
      else if (failed !== null && failed > 0 || /error|blocked|fail|denied|timeout|429/.test(statusText)) traceClass = 'failed_or_blocked';
      else if (processed !== null && processed > 0 && (failed === null || failed === 0) && (Array.isArray(data?.results) || /success|review_only|captured|complete|pass/.test(statusText))) traceClass = 'completed_or_review_only';
      traceClassCounts[traceClass] = (traceClassCounts[traceClass] || 0) + 1;
      if (!traceClassSamples[traceClass]) traceClassSamples[traceClass] = [];
      if (traceClassSamples[traceClass].length < 10) traceClassSamples[traceClass].push(rel(file));
      if (containsAny(raw, ['ocr', 'crop', 'candidate', 'review_required', 'trace'])) signalFiles.push(file);
    } catch { unreadable.push(file); }
  }
  const sourceFilesForContent = sourceFiles.filter((file) => /(?:page|slip|ocr|qr|extract|crop|trace|review|field|route|pipeline|audit)/i.test(path.basename(file)) || /(?:package\.json|AGENTS\.md)/i.test(path.basename(file))).slice(0, 700);
  const sourceText = {};
  for (const file of sourceFilesForContent) {
    try {
      const stat = await fs.stat(file);
      sourceText[file] = stat.size <= 1_000_000 ? await fs.readFile(file, 'utf8') : '';
    } catch { sourceText[file] = ''; }
  }
  const evidence = (files) => files.slice(0, 20).map(rel);
  const has = (terms) => Object.entries(sourceText).filter(([, text]) => containsAny(text, terms)).map(([file]) => rel(file));
  const inputPath = path.resolve(root, input);
  const inputExists = await exists(inputPath);
  const inputHash = inputExists ? sha256(await fs.readFile(inputPath)) : null;
  const legalProvisions = Array.isArray(legalReference?.statutory_provisions) ? legalReference.statutory_provisions : [];
  const officialSources = Array.isArray(legalReference?.system_metadata?.official_sources) ? legalReference.system_metadata.official_sources : [];
  const provisionsWithOfficialUrl = legalProvisions.filter((provision) => typeof provision?.source_url === 'string' && provision.source_url.trim()).length;
  const legalSourceAudit = {
    referencePath: rel(legalReferencePath),
    referenceVersion: legalReference?.system_metadata?.version || null,
    lastUpdated: legalReference?.system_metadata?.last_updated || null,
    officialSourceCount: officialSources.length,
    provisionCount: legalProvisions.length,
    provisionsWithOfficialUrl,
    provisionsMissingOfficialUrl: Math.max(0, legalProvisions.length - provisionsWithOfficialUrl),
    status: legalProvisions.length > 0 && provisionsWithOfficialUrl === legalProvisions.length ? 'source_links_present_needs_currentness_check' : 'needs_official_crosscheck',
    externalCalls: 0,
  };
  const checks = [
    { id: 'instructions_loaded', status: (await exists(rootAgents) && skillFiles.length > 0) ? 'observed' : 'not_observed', evidence: [rel(rootAgents), ...evidence(skillFiles)], notes: `AGENTS.md และ SKILL.md ที่อยู่ใน scope: ${skillFiles.length} ไฟล์` },
    { id: 'trace_inventory', status: traceFiles.length > 0 ? 'observed' : 'not_observed', evidence: evidence(signalFiles), notes: `พบ JSON trace ${traceFiles.length} ไฟล์, parse ได้ ${parseable.length}, อ่านไม่ได้ ${unreadable.length}` },
    { id: 'source_to_crop', status: has(['sliceChatImageLocally', 'extractSlipsLocally', 'fieldCrops']).length ? 'observed' : 'unknown', evidence: has(['sliceChatImageLocally', 'extractSlipsLocally', 'fieldCrops']), notes: 'พบสัญญาณใน source แต่ audit นี้ยังไม่ถือเป็น proof ของ runtime flow' },
    { id: 'crop_to_ocr', status: has(['ocrTextBoxes', 'ocr', 'tesseract', 'typhoon']).length ? 'observed' : 'unknown', evidence: has(['ocrTextBoxes', 'ocr', 'tesseract', 'typhoon']), notes: 'พบเส้นทาง OCR ใน source/trace; ยังไม่ยืนยันผลจาก UI ด้วยตัวเอง' },
    { id: 'ocr_to_ui', status: has(['candidate', 'reviewStatus', 'review_required', 'fieldCrops']).length ? 'observed' : 'unknown', evidence: has(['candidate', 'reviewStatus', 'review_required', 'fieldCrops']), notes: 'พบชื่อ state/field ที่สื่อถึงการส่งผลขึ้น UI; ต้องดู E2E report ประกอบ' },
    { id: 'provenance', status: has(['sha256', 'hash', 'bbox', 'provenance', 'originalPreviewUrl']).length ? 'observed' : 'unknown', evidence: has(['sha256', 'hash', 'bbox', 'provenance', 'originalPreviewUrl']), notes: 'พบกลไก provenance บางส่วนใน source; ยังไม่ตรวจครบทุก artifact' },
    { id: 'review_gate', status: has(['review_required', 'human review', 'reviewStatus']).length ? 'observed' : 'unknown', evidence: has(['review_required', 'human review', 'reviewStatus']), notes: 'พบสถานะ review ใน source/trace; audit ไม่เปลี่ยนสถานะหรือยืนยันข้อมูล' },
    { id: 'legal_source_provenance', status: legalSourceAudit.status === 'source_links_present_needs_currentness_check' ? 'incomplete' : 'needs_official_crosscheck', evidence: [legalSourceAudit.referencePath], notes: `พบ provisions ${legalSourceAudit.provisionCount} รายการ แต่มี source URL รายมาตรา ${legalSourceAudit.provisionsWithOfficialUrl} รายการ; audit นี้ไม่เรียกเว็บภายนอก` },
    { id: 'external_provider', status: has(['gemini', 'fourcorners', 'provider']).length ? 'observed' : 'unknown', evidence: has(['gemini', 'fourcorners', 'provider']), notes: 'ตรวจพบ integration/reference แต่ audit นี้ไม่เรียก provider ภายนอก' }
  ];
  const report = {
    schemaVersion: '1.0.0', auditId, createdAt: new Date().toISOString(), readOnly: true,
    scope: { root, input: rel(inputPath), sourceFiles: sourceFiles.map(rel), traceFiles: traceFiles.map(rel) },
    input: { exists: inputExists, sha256: inputHash }, checks, legalSourceAudit,
    traceInventory: { jsonFiles: traceFiles.length, parseable: parseable.length, unreadable: unreadable.length, skippedLarge: skippedLarge.length, statusCounts, traceClassCounts, traceClassSamples, sampleFiles: evidence(parseable) },
    mcp: { configured: await exists(path.join(root, '.thclaws', 'mcp.json')), mode: 'read-only local stdio', externalCalls: 0 },
    e2e: { status: 'not_run_by_audit_script', reason: 'E2E ต้องใช้ browser runtime และตรวจ UI แยกจาก static audit' },
    notes: ['ไม่แก้ source code', 'ไม่แก้หรือเขียนทับ trace เดิม', 'ผล observed ไม่ใช่ข้อพิสูจน์ว่า E2E ผ่าน']
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'audit-report.json'), JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(path.join(outDir, 'audit-manifest.json'), JSON.stringify({ auditId, input: report.input, sourceCount: sourceFiles.length, traceCount: traceFiles.length, traceSha256: sha256(JSON.stringify(report.traceInventory)) }, null, 2), 'utf8');
  console.log(JSON.stringify({ auditId, report: rel(path.join(outDir, 'audit-report.json')), sourceCount: sourceFiles.length, traceCount: traceFiles.length, parseable: parseable.length, inputExists }, null, 2));
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
