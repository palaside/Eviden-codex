import test from 'node:test';
import assert from 'node:assert/strict';

const png=()=>new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,1])],{type:'image/png'});
const context={width:100,height:200,consent:true};
const box={x:2,y:3,width:90,height:150};
function responseDocument(){
  const raw='น.ส. จิณห์...';
  return {slips:[{bounds:{...box},data:{document_type:'bank_transfer_slip',bank:{name:null,confidence:0},
    transaction:{date:null,time:null,amount:7200,currency:'THB',fee:null,reference_no:null,transaction_id:null,note:null},
    sender:{name:null,bank:null,account_no:null},receiver:{name:raw,bank:null,account_no:null},
    confidence:{date:0,time:0,amount:.9,reference_no:0,sender_name:0,receiver_name:.5,sender_account:0,receiver_account:0},
    raw_text:[raw,'7,200.00'],warnings:['review_required']},
    ocrTextBoxes:[{text:raw,confidence:.5,bounds:{x:3,y:10,width:70,height:10},classification:'slip_evidence',supportsFields:['receiver_name']},
      {text:'7,200.00',confidence:.9,bounds:{x:3,y:30,width:40,height:10},classification:'slip_evidence',supportsFields:['amount']}]}],
    pageLines:[{text:'ขอยืมเงิน',confidence:.8,bounds:{x:2,y:170,width:60,height:10}}]};
}
const apiResponse=(value=responseDocument(),extra={})=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]},...extra}]}),{status:200});
async function api(){return import('./gemini-ocr-api.server.mjs');}

test('Gemini implementation exists',async()=>{
  const implementation=await api().catch(()=>null);
  assert.equal(typeof implementation?.createGeminiImageTransport,'function');
});

test('masked names and abbreviations are returned without correction',async()=>{
  const {createGeminiImageTransport}=await api();
  const document=responseDocument();const exact='น.ส. จิณห์ s***';
  document.slips[0].data.receiver.name=exact;
  document.slips[0].data.raw_text[0]=exact;
  document.slips[0].ocrTextBoxes[0].text=exact;
  const result=await createGeminiImageTransport({apiKey:'test',fetchImpl:async()=>apiResponse(document)})(png(),context);
  assert.equal(result.ok,true);assert.equal(result.value.slips[0].data.receiver.name,exact);
  assert.equal(result.value.slips[0].data.raw_text[0],exact);
});

test('rejects field values that omit a prefix or mask preserved in single-field OCR evidence',async()=>{
  const {createGeminiImageTransport}=await api();
  for(const [line,value] of [['น.ส. จิณห์...','จิณห์...'],['น.ส. จิณห์... s***','น.ส. จิณห์...']]){
    const document=responseDocument();document.slips[0].ocrTextBoxes[0].text=line;document.slips[0].data.raw_text[0]=line;document.slips[0].data.receiver.name=value;
    const result=await createGeminiImageTransport({apiKey:'test',fetchImpl:async()=>apiResponse(document)})(png(),context);
    assert.equal(result.ok,false);assert.equal(result.error.code,'GEMINI_UNSUPPORTED_FIELD');
  }
});

test('posts real Blob bytes with server key header, model, system prompt and responseSchema',async()=>{
  const {createGeminiImageTransport}=await api();let calls=0;
  const transport=createGeminiImageTransport({apiKey:'test-key-not-real',fetchImpl:async(url,request)=>{
    calls++; assert.match(url,/gemini-3\.1-pro-preview:generateContent$/);
    assert.ok(!url.includes('test-key'));assert.equal(request.headers['x-goog-api-key'],'test-key-not-real');
    const body=JSON.parse(request.body);
    assert.match(body.systemInstruction.parts[0].text,/Exact Transcription/);
    assert.match(body.systemInstruction.parts[0].text,/ห้ามเดา/);
    assert.match(body.systemInstruction.parts[0].text,/CRITICAL OCR CONSTRAINTS - STRICT EXACT TRANSCRIPTION/);
    assert.match(body.systemInstruction.parts[0].text,/NO AUTOCORRECT/);
    assert.match(body.systemInstruction.parts[0].text,/PRESERVE RAW DATA/);
    assert.match(body.systemInstruction.parts[0].text,/NO HALLUCINATION/);
    assert.equal(Object.hasOwn(body.generationConfig,'temperature'),false);
    assert.equal(body.generationConfig.responseMimeType,'application/json');
    assert.ok(body.generationConfig.responseSchema.properties.slips.items.properties.data.properties.transaction.properties.reference_no);
    const image=body.contents[0].parts.find(p=>p.inlineData).inlineData;
    assert.equal(image.mimeType,'image/png');
    assert.deepEqual(Buffer.from(image.data,'base64'),Buffer.from(await png().arrayBuffer()));
    return apiResponse();
  }});
  const result=await transport(png(),context);
  assert.equal(result.ok,true);assert.equal(calls,1);
  assert.equal(result.value.slips[0].data.receiver.name,'น.ส. จิณห์...');
  assert.equal(result.value.slips[0].data.sender.name,null);
});

test('429 returns redacted structured error, review_required, and never retries',async()=>{
  const {createGeminiImageTransport}=await api();let count=0;
  const transport=createGeminiImageTransport({apiKey:'secret-test',fetchImpl:async()=>{
    count++;return new Response('secret-test sensitive provider text',{status:429});
  }});
  const result=await transport(png(),context);
  assert.equal(result.ok,false);assert.equal(result.error.code,'GEMINI_QUOTA_EXCEEDED');
  assert.equal(result.error.status,429);assert.equal(result.error.reviewStatus,'review_required');
  assert.equal(result.error.retryable,false);assert.equal(count,1);
  assert.doesNotMatch(JSON.stringify(result),/secret-test|sensitive provider/);
});

for(const [name,make,code] of [
  ['invalid JSON',()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'not-json'}]}}]})),'GEMINI_INVALID_JSON'],
  ['truncated output',()=>apiResponse(responseDocument(),{finishReason:'MAX_TOKENS'}),'GEMINI_INCOMPLETE_RESPONSE'],
  ['blocked output',()=>new Response(JSON.stringify({promptFeedback:{blockReason:'SAFETY'}})),'GEMINI_BLOCKED'],
  ['invalid bounds',()=>{const d=responseDocument();d.slips[0].bounds.width=1000;return apiResponse(d);},'GEMINI_SCHEMA_MISMATCH'],
  ['missing field',()=>{const d=responseDocument();delete d.slips[0].data.sender;return apiResponse(d);},'GEMINI_SCHEMA_MISMATCH'],
  ['invented name absent from evidence',()=>{const d=responseDocument();d.slips[0].data.receiver.name='ชื่อที่ไม่มีในภาพ';return apiResponse(d);},'GEMINI_UNSUPPORTED_FIELD'],
  ['invalid confidence',()=>{const d=responseDocument();d.pageLines[0].confidence=9;return apiResponse(d);},'GEMINI_SCHEMA_MISMATCH'],
])test(`rejects ${name} rather than returning successful empty extraction`,async()=>{
  const {createGeminiImageTransport}=await api();
  const result=await createGeminiImageTransport({apiKey:'test',fetchImpl:async()=>make()})(png(),context);
  assert.equal(result.ok,false);assert.equal(result.error.code,code);
});

test('does not transmit without consent or with unsupported image',async()=>{
  const {createGeminiImageTransport}=await api();let calls=0;
  const transport=createGeminiImageTransport({apiKey:'test',fetchImpl:async()=>{calls++;return apiResponse();}});
  assert.equal((await transport(png(),{...context,consent:false})).error.code,'GEMINI_CONSENT_REQUIRED');
  assert.equal((await transport(new Blob(['text'],{type:'text/plain'}),context)).error.code,'GEMINI_INVALID_IMAGE');
  assert.equal(calls,0);
});

test('network/timeout and missing key produce stable non-sensitive errors',async()=>{
  const {createGeminiImageTransport}=await api();
  for(const [error,code] of [[new Error('secret URL'),'GEMINI_NETWORK_ERROR'],[new DOMException('timeout','TimeoutError'),'GEMINI_TIMEOUT']]){
    const result=await createGeminiImageTransport({apiKey:'test',fetchImpl:async()=>{throw error;}})(png(),context);
    assert.equal(result.error.code,code);assert.doesNotMatch(JSON.stringify(result),/secret URL/);
  }
  assert.equal((await createGeminiImageTransport({})(png(),context)).error.code,'GEMINI_NOT_CONFIGURED');
});

test('adapter maps candidate data unchanged and supplies cached layers to Legal Signal',async()=>{
  const {createGeminiOcrAdapter}=await import('./gemini-ocr-adapter.mjs');
  const document=responseDocument();let calls=0;
  const canvas={width:100,height:200,toBlob(callback){callback(png());}};
  const adapter=createGeminiOcrAdapter({consent:true,transcribeImage:async(blob,ctx)=>{
    calls++;assert.ok(blob instanceof Blob);assert.equal(ctx.width,100);return {ok:true,value:document};
  },cropImage:(_canvas,bounds)=>{assert.deepEqual(bounds,box);return 'data:image/png;base64,AA==';}});
  const candidates=await adapter.extractSlipCandidates(canvas,[],0,{jobKind:'CHAT'});
  assert.equal(calls,1);assert.equal(candidates[0].data.receiver.name,'น.ส. จิณห์...');
  assert.equal(candidates[0].data.transaction.amount,7200);assert.equal(candidates[0].data.sender.name,null);
  assert.deepEqual(candidates[0].ocrTextBoxes,document.slips[0].ocrTextBoxes);
  assert.equal(candidates[0].ocrDiagnosticTrace.sourceDimensions.width,100);
  const layers=adapter.getCachedChatEvidenceLayers(canvas);
  assert.ok(layers.layer2.some(line=>line.text==='ขอยืมเงิน'));
  const {matchLegalSignalsInText}=await import('./legal-signal-matcher.mjs');
  assert.deepEqual(matchLegalSignalsInText(layers.layer2.find(line=>line.text==='ขอยืมเงิน').text),matchLegalSignalsInText(document.pageLines[0].text));
  assert.equal(adapter.getCachedChatEvidenceLayers({}),null);
});

test('adapter rejects with Error object on transport failure and never exposes success []',async()=>{
  const {createGeminiOcrAdapter}=await import('./gemini-ocr-adapter.mjs');
  const adapter=createGeminiOcrAdapter({consent:true,transcribeImage:async()=>({ok:false,error:{code:'GEMINI_QUOTA_EXCEEDED',message:'Quota',status:429,retryable:false,reviewStatus:'review_required'}})});
  await assert.rejects(adapter.extractSlipCandidates({width:100,height:200,toBlob(cb){cb(png());}},[],0,{jobKind:'CHAT'}),error=>error.code==='GEMINI_QUOTA_EXCEEDED'&&error.toJSON().status===429);
});

test('failed rerun clears cached OCR instead of exposing stale evidence',async()=>{
  const {createGeminiOcrAdapter}=await import('./gemini-ocr-adapter.mjs');
  let fail=false;
  const canvas={width:100,height:200,toBlob(cb){cb(png());}};
  const adapter=createGeminiOcrAdapter({consent:true,cropImage:()=> 'data:image/png;base64,AA==',transcribeImage:async()=>fail?{ok:false,error:{code:'GEMINI_QUOTA_EXCEEDED',message:'Quota'}}:{ok:true,value:responseDocument()}});
  await adapter.extractSlipCandidates(canvas);
  assert.ok(adapter.getCachedChatEvidenceLayers(canvas));
  fail=true;
  await assert.rejects(adapter.extractSlipCandidates(canvas));
  assert.equal(adapter.getCachedChatEvidenceLayers(canvas),null);
});

test('timeout aborts the request without retrying',async()=>{
  const {createGeminiImageTransport}=await api();let calls=0;
  const transport=createGeminiImageTransport({apiKey:'test',timeoutMs:10,fetchImpl:async(_url,options)=>{
    calls++;
    return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true}));
  }});
  const result=await transport(png(),context);
  assert.equal(result.error.code,'GEMINI_TIMEOUT');assert.equal(calls,1);
});
