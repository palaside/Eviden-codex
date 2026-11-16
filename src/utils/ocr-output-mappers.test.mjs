import test from 'node:test';
import assert from 'node:assert/strict';

const text='กรุงไทย\nโอนเงินสำเร็จ\nรหัสอ้างอิง A785efee8358b4e89\nจาก\nสิบตรีณัฐชัย s***\nXXX-X-XX526-6\nไปยัง\nน.ส. จิณห์นิภา ประสาทเขตรการ\nจำนวนเงิน 15,000.00 บาท\nค่าธรรมเนียม 0.00 บาท\nวันที่ทำรายการ 04 เม.ย. 2568 - 16:06\nบันทึก ยืมเงิน';
const size={width:1000,height:1500,jobKind:'SLIP'};
const api=()=>import('./ocr-output-mappers.mjs');
test('raw OpenThai text maps labeled fields and all raw text to Memo without invented coordinates',async()=>{
  const {mapOpenThaiOutput}=await api();const result=mapOpenThaiOutput({text:[text]},size,'openthai-text');
  assert.equal(result.candidates.length,1);const candidate=result.candidates[0];
  assert.equal(candidate.data.transaction.amount,15000);assert.equal(candidate.data.transaction.fee,0);
  assert.equal(candidate.data.transaction.date,'2025-04-04');assert.equal(candidate.data.transaction.time,'16:06');
  assert.equal(candidate.data.transaction.reference_no,'A785efee8358b4e89');
  assert.equal(candidate.data.sender.name,'สิบตรีณัฐชัย s***');assert.equal(candidate.data.receiver.name,'น.ส. จิณห์นิภา ประสาทเขตรการ');
  assert.equal(candidate.data.transaction.note,text);assert.deepEqual(candidate.data.raw_text,[text]);
  assert.deepEqual(candidate.ocrTextBoxes,[]);assert.equal(candidate.data.confidence.amount,0);
  assert.equal(candidate.data._fallback_meta.needs_human_review,true);
});
test('Typhoon raw Markdown and JSON content map without guessing missing fields',async()=>{
  const {mapTyphoonOutput}=await api();
  const result=mapTyphoonOutput({choices:[{finish_reason:'stop',message:{content:text}}]},size);
  assert.equal(result.candidates[0].data.transaction.amount,15000);
  assert.equal(result.candidates[0].data.transaction.reference_no,'A785efee8358b4e89');
  const structured={document_type:'bank_transfer_slip',raw_text:text.split('\n')};
  const json=mapTyphoonOutput({choices:[{finish_reason:'stop',message:{content:JSON.stringify(structured)}}]},size);
  assert.equal(json.candidates[0].data.sender.name,'สิบตรีณัฐชัย s***');
});
test('amount conflicts remain null and fee zero never substitutes transfer amount',async()=>{
  const {mapOpenThaiOutput}=await api();
  const result=mapOpenThaiOutput({text:[text+'\nจำนวนเงิน 16,000.00 บาท']},size,'openthai-text');
  assert.equal(result.candidates[0].data.transaction.amount,null);
  const missing=mapOpenThaiOutput({text:[text.replace('จำนวนเงิน 15,000.00 บาท','จำนวนเงิน อ่านไม่ได้')]},size,'openthai-text');
  assert.equal(missing.candidates[0].data.transaction.amount,null);assert.equal(missing.candidates[0].data.transaction.fee,0);
});
test('non-slip text and long-chat/multiple-slip input are not auto-detected as one transaction',async()=>{
  const {mapOpenThaiOutput}=await api();
  assert.equal(mapOpenThaiOutput('อาหาร 150 บาท',size,'openthai-text').candidates.length,0);
  assert.equal(mapOpenThaiOutput(text,{...size,jobKind:'CHAT'},'openthai-text').candidates.length,0);
  assert.equal(mapOpenThaiOutput(text+'\n'+text,size,'openthai-text').candidates.length,0);
});
test('Markdown raw formatting and native block coordinates are preserved separately',async()=>{
  const {mapOpenThaiOutput}=await api();const markdown='# สลิป\n'+text;
  const result=mapOpenThaiOutput({markdown,pages:[{width:500,height:750,truncated:false,blocks:[{text:'จำนวนเงิน 15,000.00 บาท',bbox:[10,100,200,120],class:'Text'}]}]},size,'openthai-markdown');
  assert.equal(result.candidates[0].data.transaction.note,markdown);
  assert.deepEqual(result.candidates[0].ocrTextBoxes[0].bounds,{x:20,y:200,width:380,height:40});
});
test('Hugging Face generated_text is accepted and truncated provider output is rejected',async()=>{
  const {mapOpenThaiOutput,mapTyphoonOutput}=await api();
  assert.equal(mapOpenThaiOutput([{generated_text:text}],size,'openthai-markdown').candidates[0].data.transaction.amount,15000);
  assert.throws(()=>mapTyphoonOutput({choices:[{finish_reason:'length',message:{content:text}}]},size));
  assert.throws(()=>mapOpenThaiOutput({markdown:text,pages:[{truncated:true}]},size,'openthai-markdown'));
});

test('numeric dates, Thai digits and Markdown table tokens are read without fee confusion',async()=>{
  const {mapOpenThaiOutput}=await api();
  const raw='โอนเงินสำเร็จ\n| จาก | นาย s*** |\n| ไปยัง | น.ส. ก. |\n| จำนวนเงิน | ๗,๒๐๐.๐๐ บาท |\nค่าธรรมเนียม 0.00 บาท\nวันที่ 04/04/2568 เวลา 16:06\nRef ID ABC12345';
  const candidate=mapOpenThaiOutput(raw,size).candidates[0];
  assert.equal(candidate.data.transaction.amount,7200);assert.equal(candidate.data.transaction.date,'2025-04-04');assert.equal(candidate.data.sender.name,'นาย s***');
});
test('Memo accepts >1000 characters, preserves all 50000, and rejects overflow without truncating',async()=>{
  const {mapOpenThaiOutput}=await api();const {SlipExtractionSchema}=await import('../schemas/slip.schema.ts');
  for(const length of [1500,50000]){
    const raw=text+'\n'+'ก'.repeat(length-text.length-1);const candidate=mapOpenThaiOutput(raw,size).candidates[0];
    assert.equal(candidate.data.transaction.note,raw);assert.equal(candidate.data.transaction.note.length,length);assert.equal(SlipExtractionSchema.safeParse(candidate.data).success,true);
    assert.equal(SlipExtractionSchema.safeParse({...candidate.data,transaction:{...candidate.data.transaction,note:'ข้อมูลเดิม'}}).success,true);
  }
  assert.throws(()=>mapOpenThaiOutput(text+'ก'.repeat(50001),size),error=>error.code==='OCR_MEMO_TOO_LONG');
});
test('bridge output -> adapter -> LocalSlipCandidate -> QR merge retains Memo and masked names',async()=>{
  const {mapOpenThaiOutput,validateMappedOrNormalizedOutput}=await api();
  const {createGeminiOcrAdapter}=await import('./gemini-ocr-adapter.mjs');
  const {finalizeSlipCandidates}=await import('./finalize-slip-candidates.mjs');
  const mapped=mapOpenThaiOutput(text,size);const canvas={width:1000,height:1500,toBlob(callback){callback(new Blob(['image']));}};
  const adapter=createGeminiOcrAdapter({consent:true,validateOutput:validateMappedOrNormalizedOutput,transcribeImage:async()=>({ok:true,value:mapped}),cropImage:()=> 'data:image/png;base64,AA=='});
  const candidates=await adapter.extractSlipCandidates(canvas,[],0,{jobKind:'SLIP'});
  const final=finalizeSlipCandidates([],candidates);
  assert.equal(final[0].data.transaction.note,text);assert.equal(final[0].data.sender.name,'สิบตรีณัฐชัย s***');
  assert.equal(final[0].cropDataUrl,'data:image/png;base64,AA==');assert.equal(final[0].ocrDiagnosticTrace.objectBounds.length,0);
  const qr={...candidates[0],data:{...candidates[0].data,bank:{name:'ธนาคารไม่ระบุ',confidence:0},transaction:{...candidates[0].data.transaction,note:null},warnings:['QR reference only']}};
  const merged=finalizeSlipCandidates([qr],candidates);
  assert.equal(merged[0].data.bank.name,'กรุงไทย');assert.equal(merged[0].data.bank.confidence,0);assert.equal(merged[0].data.transaction.note,text);
});
test('complete raw Memo reaches existing Legal Signal matcher without fake coordinates',async()=>{
  const {mapOpenThaiOutput}=await api();const {buildMemoLegalSignalHits,evaluateLegalSignals}=await import('./memo-legal-signals.mjs');
  const raw=text+'\n'+'ข้อความหลักฐาน '.repeat(2000)+'ฉ้อโกง';const mapped=mapOpenThaiOutput(raw,size);
  const start=performance.now();const hits=buildMemoLegalSignalHits([{id:'case1',sourceItemId:'source1',source:'slip.png',sha256:'abc',dossierPage:4,chatPage:'-',data:mapped.candidates[0].data}]);
  assert.ok(hits.some(hit=>hit.text.endsWith('ฉ้อโกง')));assert.equal(hits[0].bounds,null);assert.equal(hits[0].legalDecision,false);
  assert.equal(hits[0].reviewStatus,'human_review_required');assert.ok(performance.now()-start<2000);
  assert.strictEqual(evaluateLegalSignals(raw),evaluateLegalSignals(raw));
  const phrase='ช่วยเหลือหรือให้ความสะดวก';
  const full='ก'.repeat(50000-phrase.length-1)+' '+phrase;
  assert.ok(evaluateLegalSignals(full).some(hit=>hit.phrase===phrase),'Known dictionary term at the end of a 50k Memo must be evaluated');
});
test('old and long Memo records round-trip through unchanged queue serializer',async()=>{
  const {mapOpenThaiOutput}=await api();
  const {serializeEvidenceQueueSnapshot,restoreEvidenceQueueSnapshot,EXTRACTION_VERSION}=await import('./evidence-queue-persistence.ts');
  const raw=text+'\n'+'ข้อมูลเดิม '.repeat(200);
  for(const memo of ['ข้อมูลสั้นเดิม',raw]){
    const data=mapOpenThaiOutput(text,size).candidates[0].data;data.transaction.note=memo;
    const file=new File(['image'],'slip.png',{type:'image/png'});
    const queue=[{id:'slip1',extractionVersion:EXTRACTION_VERSION,file,previewUrl:'blob:old',category:'SLIP',status:'done',data,isConfirmed:false}];
    const restored=await restoreEvidenceQueueSnapshot(serializeEvidenceQueueSnapshot(queue,[]),()=> 'blob:restored');
    assert.equal(restored.stagedQueue[0].data.transaction.note,memo);assert.equal(restored.stagedQueue[0].isConfirmed,false);
  }
});
test('unknown response shapes fail clearly instead of appearing as non-slip success',async()=>{
  const {mapOpenThaiOutput}=await api();assert.throws(()=>mapOpenThaiOutput({unexpected:true},size),error=>error.code==='OCR_INVALID_RESPONSE');
});
test('structured Typhoon flat fields map to nested legacy contract and remain unverified',async()=>{
  const {mapTyphoonCandidates}=await api();
  const value={bank:'กรุงไทย',amount:7200,datetime:'2025-04-04T16:06',ref:'ABC12345',sender:'น.ส. ก s***',receiver:'น.ส. ข'};
  const candidates=mapTyphoonCandidates({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]},size);
  assert.equal(candidates[0].data.transaction.amount,7200);assert.equal(candidates[0].data.transaction.time,'16:06');
  assert.equal(candidates[0].data.sender.name,'น.ส. ก s***');assert.equal(candidates[0].data._fallback_meta.needs_human_review,true);
});
