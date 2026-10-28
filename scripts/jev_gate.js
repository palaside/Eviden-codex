// Simple placeholder JEF gate
// Scans input directory, decides if files are chat or slip based on filename.
// Writes decision to a file `decision.txt` in the input directory.

async function main() {
  const [{ default: fs }, { default: path }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
  ]);

  const inputDir = process.argv[2];
  if (!inputDir) {
    console.error('Usage: node jev_gate.js <input-directory>');
    process.exit(1);
  }

  let hasChat = false;
  let hasSlip = false;

  fs.readdirSync(inputDir).forEach(file => {
    const lower = file.toLowerCase();
    if (lower.includes('chat')) hasChat = true;
    if (lower.includes('slip') || lower.includes('receipt')) hasSlip = true;
  });

  let decision = 'unknown';
  if (hasChat && !hasSlip) decision = 'chat';
  else if (hasSlip && !hasChat) decision = 'slip';
  else if (hasChat && hasSlip) decision = 'mixed';

  fs.writeFileSync(path.join(inputDir, 'decision.txt'), decision, 'utf8');
  console.log(`JEF gate decision: ${decision}`);
}

void main();
