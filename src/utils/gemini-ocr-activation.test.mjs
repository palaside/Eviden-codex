import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiBridgeHandler} from './gemini-ocr-bridge.server.mjs';
import * as bridge from './gemini-ocr-bridge-client.mjs';

const image=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
const dimensions={width:100,height:200};
const originalStorage=globalThis.localStorage;
test.beforeEach(()=>{globalThis.localStorage={getItem:()=> 'test-client-key'};});
test.afterEach(()=>{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});

test('client reports quota failure immediately to existing notification subscriber',async()=>{
  const notices=[];const unsubscribe=bridge.subscribeGeminiBridgeErrors(message=>notices.push(message));
  try {
    const client=bridge.createGeminiBridgeClient({fetchImpl:async()=>Response.json({ok:false,error:{code:'GEMINI_QUOTA_EXCEEDED',message:'Quota'}},{status:429})});
    const result=await client(image(),dimensions);
    assert.equal(result.error.reviewStatus,'review_required');assert.equal(notices.length,1);assert.match(notices[0],/429/);
  } finally{unsubscribe();}
});
test('client aborts a stalled HTTP request and reports timeout without retry',async()=>{
  let calls=0;
  const client=bridge.createGeminiBridgeClient({timeoutMs:10,fetchImpl:async(_url,{signal})=>{
    calls++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}));
  }});
  const result=await client(image(),dimensions);
  assert.equal(result.error.code,'GEMINI_TIMEOUT');assert.equal(calls,1);
});
test('invalid success JSON is reported rather than accepted as extraction',async()=>{
  const client=bridge.createGeminiBridgeClient({fetchImpl:async()=>Response.json({ok:true,value:{invented:'data'}})});
  const result=await client(image(),dimensions);assert.equal(result.ok,false);assert.equal(result.error.reviewStatus,'review_required');
});
test('default server handler uses real transport path and server-only key header',async()=>{
  const oldFetch=globalThis.fetch,oldKey=process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY='test-server-only-key';let calls=0;
  globalThis.fetch=async(url,options)=>{
    calls++;assert.match(url,/^https:\/\/generativelanguage.googleapis.com\/v1beta\/models\/gemini-3\.1-pro-preview:generateContent$/);
    assert.equal(options.headers['x-goog-api-key'],'test-server-only-key');
    assert.equal(JSON.parse(options.body).contents[0].parts[1].inlineData.data,Buffer.from(new Uint8Array([137,80,78,71,13,10,26,10])).toString('base64'));
    return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({slips:[],pageLines:[]})}]}}]});
  };
  try{
    const body=new FormData();body.set('image',image(),'image.png');body.set('width','100');body.set('height','200');
    const response=await createGeminiBridgeHandler()(new Request('http://localhost:3450/api/ocr/gemini',{method:'POST',headers:{'x-api-key':'test-server-only-key'},body}));
    assert.equal(response.status,200);assert.equal(calls,1);
    assert.doesNotMatch(JSON.stringify(await response.json()),/test-server-only-key/);
  }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;}
});

test('explicit Gemini button compatibility keeps source hash and exact memo',async()=>{
  const oldFetch=globalThis.fetch,oldBitmap=globalThis.createImageBitmap;
  const file=new File([await image().arrayBuffer()],'slip.png',{type:'image/png'});
  const data={document_type:'bank_transfer_slip',bank:{name:null,confidence:0},
    transaction:{date:null,time:null,amount:null,currency:'THB',fee:null,reference_no:null,transaction_id:null,note:'ยืมเงิน'},
    sender:{name:null,bank:null,account_no:null},receiver:{name:null,bank:null,account_no:null},
    confidence:{date:0,time:0,amount:0,reference_no:0,sender_name:0,receiver_name:0,sender_account:0,receiver_account:0},raw_text:['ยืมเงิน'],warnings:['review_required']};
  globalThis.createImageBitmap=async()=>({width:100,height:200,close(){}});
  globalThis.fetch=async(url)=>{
    assert.equal(url,'/api/ocr/gemini');
    return Response.json({ok:true,value:{slips:[{bounds:{x:10,y:20,width:80,height:160},data,
      ocrTextBoxes:[{text:'ยืมเงิน',confidence:.8,bounds:{x:15,y:30,width:40,height:10},classification:'slip_evidence',supportsFields:['note']}]}],pageLines:[]}});
  };
  try {
    const result=await (await bridge.fetchGeminiDetectionBridge(file)).json();
    assert.deepEqual(result.candidates[0].bbox_1000,[100,100,900,900]);
    assert.deepEqual(result.candidates[0].data,data);
    const sha=Buffer.from(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).toString('hex');
    assert.equal(result.metadata.sha256,sha);assert.equal(result.metadata.file_name,'slip.png');
  }finally{globalThis.fetch=oldFetch;if(oldBitmap===undefined)delete globalThis.createImageBitmap;else globalThis.createImageBitmap=oldBitmap;}
});
