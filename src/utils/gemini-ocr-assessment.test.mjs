import test from 'node:test';
import assert from 'node:assert/strict';
import {assessGeminiOcrDocument,validateGeminiReviewOutput,createGeminiReviewTrace,mergeGeminiReviewedCandidate} from './gemini-ocr-assessment.mjs';

const context={width:200,height:300};
test('unrecognized valid JSON is available verbatim for review after revalidation; no ledger candidate',()=>{
  for(const raw of [{bank:'Krungthai',amount:'13,500.00'},[],null,'OCR text',{slips:{}}]){
    const text=JSON.stringify(raw,null,2);
    const report=validateGeminiReviewOutput(assessGeminiOcrDocument(raw,{...context,rawResponseText:text}),context);
    assert.equal(report.rawResponseText,text);
    assert.equal(report.reviewStatus,'review_required');
    assert.deepEqual(report.slips,[]);
    assert.ok(report.issues.some(issue=>issue.reason==='unrecognized_slip_structure'));
  }
});
test('bounded assessment retains every raw occurrence and assesses unaffected entries',()=>{
  const raw=syntheticDocument();
  raw.pageLines=Array(5001).fill(null);
  raw.slips.push(...Array(20).fill(null));
  const report=assessGeminiOcrDocument(raw,context);
  assert.equal(report.slips[0].data.transaction.amount,7200);
  assert.equal(JSON.parse(report.rawResponseText).slips.length,21);
  assert.ok(report.issues.some(issue=>issue.path==='$.slips'&&issue.reason.includes('limit')));
});
test('excessive response size and mismatched dimensions fail with distinct causes',()=>{
  assert.throws(()=>assessGeminiOcrDocument({}, {...context,rawResponseText:' '.repeat(2000001)}),{code:'GEMINI_RESPONSE_LIMIT'});
  const report=assessGeminiOcrDocument(syntheticDocument(),context);
  assert.throws(()=>validateGeminiReviewOutput(report,{...context,width:199}),{code:'GEMINI_SOURCE_MISMATCH'});
});
export function syntheticDocument(){
  const bounds={x:10,y:10,width:180,height:260};
  return {pageLines:[{text:'chat',confidence:.8,bounds:{x:0,y:-1,width:40,height:10}}],slips:[{
    bounds,data:{document_type:'slip',bank:{name:null,confidence:0},transaction:{amount:7200},
      sender:{name:'น.ส. s***'},receiver:{},confidence:{amount:.9,sender_name:.8}},
    ocrTextBoxes:[{text:'7,200.00',confidence:.9,bounds:{x:15,y:100,width:100,height:20},classification:'slip_evidence',supportsFields:['amount']},
      {text:'น.ส. s***',confidence:.8,bounds:{x:15,y:130,width:100,height:20},classification:'slip_evidence',supportsFields:['sender_name']}]
  }]};
}
test('bad chat coordinates and metadata cannot discard supported slip fields',()=>{
  const raw=syntheticDocument(),before=structuredClone(raw);
  const result=assessGeminiOcrDocument(raw,context);
  assert.equal(result.slips[0].data.transaction.amount,7200);
  assert.equal(result.slips[0].data.sender.name,'น.ส. s***');
  assert.ok(result.issues.some(i=>i.path==='$.pageLines[0].bounds.y'));
  assert.equal(result.reviewStatus,'review_required');
  assert.equal(result.slips[0].data._fallback_meta.needs_human_review,true);
  assert.deepEqual(raw,before);
});
test('unpositioned field is a proposal only; its amount cannot reach canonical data',()=>{
  const raw=syntheticDocument();raw.slips[0].ocrTextBoxes[0].bounds.x=-1;
  const result=assessGeminiOcrDocument(raw,context);
  assert.equal(result.slips[0].data.transaction.amount,null);
  assert.equal(result.slipAssessments[0].fieldAssessments.amount.value,7200);
  assert.equal(result.slipAssessments[0].fieldAssessments.amount.status,'unverified');
  assert.equal(result.slipAssessments[0].fieldAssessments.amount.bounds,null);
});
test('missing masks remain rejected and invalid slip cannot discard a different occurrence',()=>{
  const raw=syntheticDocument();raw.slips.push(structuredClone(raw.slips[0]));
  raw.slips[0].bounds.width=1000;raw.slips[1].data.sender.name='s';
  const result=assessGeminiOcrDocument(raw,context);
  assert.equal(result.slips.length,1);assert.equal(result.slips[0].sourceIndex,1);
  assert.equal(result.slips[0].data.sender.name,null);
  assert.equal(result.slipAssessments[0].candidate,null);
});
test('no slip bounds means no synthetic full image candidate; raw remains available',()=>{
  const raw=syntheticDocument();delete raw.slips[0].bounds;
  const result=assessGeminiOcrDocument(raw,context);
  assert.deepEqual(result.slips,[]);assert.equal(JSON.parse(result.rawResponseText).slips.length,1);
});
test('review envelope is re-assessed, not trusted as client-supplied canonical data',()=>{
  const value=assessGeminiOcrDocument(syntheticDocument(),context);
  value.slips[0].data.transaction.amount=999999;
  assert.equal(validateGeminiReviewOutput(value,context).slips[0].data.transaction.amount,7200);
});
test('duplicate field alternatives remain conflict instead of selecting by confidence',()=>{
  const raw=syntheticDocument();raw.slips[0].data.transaction.amount=[7200,7300];
  const result=assessGeminiOcrDocument(raw,context);
  assert.equal(result.slips[0].data.transaction.amount,null);
  assert.equal(result.slipAssessments[0].fieldAssessments.amount.status,'conflict');
});

test('many bad lines cannot overflow legacy warnings and discard a supported amount',()=>{
  const raw=syntheticDocument();
  raw.slips[0].ocrTextBoxes.push(...Array.from({length:110},()=>({text:'bad line',confidence:.5,bounds:{x:-1,y:0,width:1,height:1}})));
  const result=assessGeminiOcrDocument(raw,context);
  assert.equal(result.slips[0].data.transaction.amount,7200);
  assert.ok(result.issues.length>=110);
  assert.ok(result.slips[0].data.warnings.length<=100);
});

test('client -> bridge -> Google transport -> selected adapter preserves partial fields and raw trace',async()=>{
  const {createGeminiBridgeHandler}=await import('./gemini-ocr-bridge.server.mjs');
  const {createGeminiImageTransport}=await import('./gemini-ocr-api.server.mjs');
  const {createGeminiBridgeClient}=await import('./gemini-ocr-bridge-client.mjs');
  const {createGeminiOcrAdapter}=await import('./gemini-ocr-adapter.mjs');
  const {validateMappedOrNormalizedOutput}=await import('./ocr-output-mappers.mjs');
  let providerCalls=0;
  const raw=syntheticDocument();
  const transport=createGeminiImageTransport({apiKey:'test-only',fetchImpl:async()=>{
    providerCalls++;
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(raw)}]}}]});
  }});
  const handler=createGeminiBridgeHandler({transcribeImage:transport});
  const client=createGeminiBridgeClient({getApiKey:()=> 'test-only',fetchImpl:async(_url,options)=>handler(new Request('http://localhost:3461/api/ocr/gemini',options))});
  const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
  const canvas={...context,toBlob:callback=>callback(png)};
  const adapter=createGeminiOcrAdapter({consent:true,transcribeImage:client,validateOutput:validateMappedOrNormalizedOutput,cropImage:()=> 'derived-test-crop'});
  const candidates=await adapter.extractSlipCandidates(canvas);
  assert.equal(providerCalls,1);
  assert.equal(candidates[0].data.transaction.amount,7200);
  assert.equal(candidates[0].ocrDiagnosticTrace.geminiReview.rawResponseText,JSON.stringify(raw));
  assert.equal(candidates[0].ocrDiagnosticTrace.geminiSourceIndex,0);
  assert.deepEqual(adapter.getCachedChatEvidenceLayers(canvas).ocrDiagnosticTrace.geminiReview.issues,candidates[0].ocrDiagnosticTrace.geminiReview.issues);
});

test('trace export and existing queue snapshot retain review metadata without migration or calculation',async()=>{
  const {buildEvidenceDiagnosticTrace}=await import('./evidence-diagnostic-trace.mjs');
  const {serializeEvidenceQueueSnapshot,restoreEvidenceQueueSnapshot,EXTRACTION_VERSION}=await import('./evidence-queue-persistence.ts');
  const review=assessGeminiOcrDocument(syntheticDocument(),context);
  const data=review.slips[0].data;
  const item={id:'source',category:'SLIP',status:'done',extractionVersion:EXTRACTION_VERSION,file:new File(['test'],'synthetic.png'),previewUrl:'blob:test',
    data,isConfirmed:false,meta:{sha256:'source-hash'},sourceBounds:review.slips[0].bounds,ocrTextBoxes:review.slips[0].ocrTextBoxes,ocrDiagnosticTrace:createGeminiReviewTrace(review,0)};
  const report=buildEvidenceDiagnosticTrace([item],[]);
  assert.equal(report.items[0].candidates[0].ocrDiagnosticTrace.geminiReview.rawResponseText,review.rawResponseText);
  assert.equal(report.statistics.calculationTotal,null);
  const restored=await restoreEvidenceQueueSnapshot(serializeEvidenceQueueSnapshot([item],[]),()=> 'blob:restored');
  assert.equal(restored.stagedQueue[0].ocrDiagnosticTrace.geminiReview.rawResponseText,review.rawResponseText);
  assert.equal(restored.stagedQueue[0].isConfirmed,false);
  const old=structuredClone(data);old.transaction.amount=999999;old.sender.name='human';old.reviewed_fields=['sender_name'];
  const merged=mergeGeminiReviewedCandidate(old,data);
  assert.equal(merged.transaction.amount,7200);assert.equal(merged.sender.name,'human');
});
