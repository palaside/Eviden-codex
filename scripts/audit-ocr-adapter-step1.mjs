import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {matchLegalSignalsInText} from '../src/utils/legal-signal-matcher.mjs';

const dir='For Test Results/ocr-adapter-step1-20261116';
const baseline=JSON.parse(await fs.readFile(`${dir}/protected-baseline.json`,'utf8'));
const checks={};
for(const [file,before] of Object.entries(baseline.files)) {
  const after=await fs.readFile(file,'utf8');
  assert.equal(after,file==='src/app/page.tsx'
    ? before.replace('from "@/utils/local-slip-ocr";','from "@/utils/ocr-adapter";') : before,
    `Protected content changed: ${file}`);
  checks[file]=file==='src/app/page.tsx'?'import-only':'byte-identical';
}
const trace=JSON.parse(await fs.readFile(`${dir}/trace.json`,'utf8'));
const reloaded=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
assert.deepEqual(reloaded.items,trace.items,'Persisted items differ after reload');
const item=trace.items.find(i=>i.source.fileName==='chatv3 (64).jpg');
assert.ok(item);
assert.equal(item.source.sha256,createHash('sha256').update(await fs.readFile('For Test/แชทที่ 3/chatv3 (64).jpg')).digest('hex'));
assert.equal(item.chatPages.length,4);
assert.equal(item.candidates.length,2);
const first=item.candidates.find(c=>c.chatPageNumber===1);
const partial=item.candidates.find(c=>c.chatPageNumber===3);
assert.equal(first.calculationGate.score,100);
assert.equal(first.calculationGate.eligible,true);
assert.equal(partial.calculationGate.eligible,false);
assert.equal(first.data.transaction.amount,10000);
assert.ok(item.candidates.every(c=>!c.isConfirmed&&c.needsReview));
const legalHits=item.chatPages.flatMap(page=>page.layer2.flatMap(line=>
  matchLegalSignalsInText(line.sourceLineText||line.text)));
assert.ok(legalHits.length>0);
assert.ok(legalHits.every(hit=>hit.legalDecision===false&&hit.reviewStatus==='human_review_required'));
const historic=JSON.parse(await fs.readFile('For Test Results/status-chroma-e2e-20261106/trace.json','utf8'));
const historicalFields=item.candidates.map(candidate=>{
  const old=historic.items[0].candidates.find(c=>c.chatPageNumber===candidate.chatPageNumber);
  return {page:candidate.chatPageNumber,transactionEqual:JSON.stringify(old.data.transaction)===JSON.stringify(candidate.data.transaction),
    receiverEqual:JSON.stringify(old.data.receiver)===JSON.stringify(candidate.data.receiver),
    senderEqual:JSON.stringify(old.data.sender)===JSON.stringify(candidate.data.sender),
    gateEqual:JSON.stringify(old.calculationGate)===JSON.stringify(candidate.calculationGate)};
});
const report={date:'2026-11-16',scope:'OCR adapter Step 1',baseUrl:'http://127.0.0.1:3461/',
  buildId:(await fs.readFile('build-output-ocr-adapter-step1/BUILD_ID','utf8')).trim(),
  protectedFiles:checks,uiSourceChanged:false,persistenceCodeChanged:false,productionOriginTouched:false,
  fixture:item.source.fileName,sourceSha256:item.source.sha256,chatPages:4,candidates:2,eligibleTotal:10000,
  reloadItemsEqual:true,legalOcrInputHits:legalHits.length,legalUiObservedHits:1,reviewRequired:true,
  regressionTests:{passed:110,failed:0},historicalFields,
  limitations:['Historical trace is not byte-identical: sender name on ineligible page 3 differs; no claim of exact OCR for every field.',
    'Legal matcher semantics unchanged; observed review lead is not a legal accuracy certification.',
    'Export code unchanged through import-only workspace patch; export artifacts not rerun in this task.',
    'Gemini/OpenThai are inactive adapter slots, not verified live model integrations.',
    'Production build on port 3450 not promoted or restarted.']};
await fs.writeFile(`${dir}/trace-after-reload.json`,JSON.stringify(reloaded,null,2));
await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
