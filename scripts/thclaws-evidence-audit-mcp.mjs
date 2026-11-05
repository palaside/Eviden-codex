import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';

const root = path.resolve(process.env.EVIDENCE_AUDIT_ROOT || path.join(process.cwd(), 'For Test Results', 'thclaws-audit'));
const safePath = (value) => { const target = path.resolve(root, value || ''); if (target !== root && !target.startsWith(root + path.sep)) throw new Error('path outside read-only audit root'); return target; };
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
const tools = [
  { name: 'audit_manifest', description: 'Read the latest local audit manifest. Read-only.', inputSchema: { type: 'object', properties: {} } },
  { name: 'read_audit_report', description: 'Read a JSON audit report under the audit root. Read-only.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } }
];
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') return reply(msg.id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'digital-evidence-audit', version: '1.0.0' } });
  if (msg.method === 'notifications/initialized') return;
  if (msg.method === 'tools/list') return reply(msg.id, { tools });
  if (msg.method === 'tools/call') {
    try {
      const name = msg.params?.name;
      const target = name === 'audit_manifest' ? (await fs.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).sort().pop() : null;
      const file = name === 'audit_manifest' ? (target ? path.join(root, target.name, 'audit-manifest.json') : null) : safePath(msg.params?.arguments?.path);
      if (!file) throw new Error('no audit report found');
      const text = await fs.readFile(file, 'utf8');
      return reply(msg.id, { content: [{ type: 'text', text }] });
    } catch (error) { return reply(msg.id, { isError: true, content: [{ type: 'text', text: String(error.message || error) }] }); }
  }
  if (msg.id !== undefined) reply(msg.id, { error: { code: -32601, message: 'method not found' } });
});
