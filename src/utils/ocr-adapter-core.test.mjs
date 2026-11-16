import test from 'node:test';
import assert from 'node:assert/strict';
import {matchLegalSignalsInText} from './legal-signal-matcher.mjs';

test('adapter contract exists before connecting the workspace',async()=>{
  const adapterModule=await import('./ocr-adapter-core.mjs').catch(()=>null);
  assert.equal(typeof adapterModule?.createOcrAdapter,'function');
});

test('forwards extraction inputs, callback and exact result/Promise without remapping',async()=>{
  const {createOcrAdapter}=await import('./ocr-adapter-core.mjs');
  const canvas={width:100,height:200}; const qr=[{bounds:{x:1,y:2,width:3,height:4}}];
  const options={jobKind:'CHAT',onRetryDiagnostic:message=>assert.equal(message,'retained')};
  const result=[{id:'candidate',needsReview:true,ocrDiagnosticTrace:{attempts:[]}}];
  const promise=Promise.resolve(result);
  const adapter=createOcrAdapter({id:'tesseract-local',extractSlipCandidates(...args){
    assert.deepEqual(args,[canvas,qr,1,options]); args[3].onRetryDiagnostic('retained'); return promise;
  },readChatPreflight(){return null;},getCachedChatEvidenceLayers(){return null;}});
  assert.equal(adapter.extractSlipCandidates(canvas,qr,1,options),promise);
  assert.equal(await promise,result);
});

test('preserves canvas identity and cached OCR text needed by Legal Signal',async()=>{
  const {createOcrAdapter}=await import('./ocr-adapter-core.mjs');
  const cache=new WeakMap(); const canvas={};
  const layers={layer2:[{text:'ขอยืมเงิน เดี๋ยวคืนให้',bounds:{x:1,y:2,width:30,height:10},confidence:.9}]};
  cache.set(canvas,layers);
  const adapter=createOcrAdapter({id:'tesseract-local',extractSlipCandidates(){return Promise.resolve([]);},
    readChatPreflight(file,slot){return {file,slot};},getCachedChatEvidenceLayers(surface){return cache.get(surface)||null;}});
  assert.equal(adapter.getCachedChatEvidenceLayers(canvas),layers);
  assert.equal(adapter.getCachedChatEvidenceLayers({}),null);
  assert.ok(matchLegalSignalsInText(adapter.getCachedChatEvidenceLayers(canvas).layer2[0].text).length>0);
  const file={name:'chat.jpg'};
  assert.deepEqual(adapter.readChatPreflight(file,1),{file,slot:1});
});

test('preserves engine rejection rather than converting failure to empty success',async()=>{
  const {createOcrAdapter}=await import('./ocr-adapter-core.mjs');
  const failure=new Error('existing engine failure');
  const adapter=createOcrAdapter({id:'tesseract-local',extractSlipCandidates(){return Promise.reject(failure);},
    readChatPreflight(){return null;},getCachedChatEvidenceLayers(){return null;}});
  await assert.rejects(adapter.extractSlipCandidates(),error=>error===failure);
});

test('future provider slots fail closed without reading image or making requests',async()=>{
  const {createPendingOcrAdapter}=await import('./ocr-adapter-core.mjs');
  for(const id of ['gemini-3.1-pro','openthai-2.0']) {
    const pending=createPendingOcrAdapter(id);
    const image=new Proxy({},{get(){throw new Error('must not read image');}});
    await assert.rejects(pending.extractSlipCandidates(image),error=>error.code==='OCR_ADAPTER_NOT_CONFIGURED');
    await assert.rejects(pending.readChatPreflight(image),error=>error.code==='OCR_ADAPTER_NOT_CONFIGURED');
    assert.throws(()=>pending.getCachedChatEvidenceLayers(image),error=>error.code==='OCR_ADAPTER_NOT_CONFIGURED');
  }
});
