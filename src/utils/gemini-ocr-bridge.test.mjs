import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiBridgeHandler} from './gemini-ocr-bridge.server.mjs';
import {fetchFromGeminiBridge} from './gemini-ocr-bridge-client.mjs';
import {createGeminiBridgeClient} from './gemini-ocr-bridge-client.mjs';

test('client shows upstream status and safe reason without exposing provider message',async()=>{
  const client=createGeminiBridgeClient({getApiKey:()=> 'AQ.test',fetchImpl:async()=>Response.json({ok:false,error:{code:'GEMINI_HTTP_ERROR',status:403,message:'secret-provider-details'}},{status:502})});
  const result=await client(new Blob(['test']),{width:100,height:100});
  assert.match(result.error.message,/สิทธิ์/);
  assert.match(result.error.message,/Google HTTP 403/);
  assert.doesNotMatch(result.error.message,/secret-provider-details/);
  assert.equal(result.error.reviewStatus,'review_required');
});

const image=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
const originalStorage=globalThis.localStorage;
test.beforeEach(()=>{globalThis.localStorage={getItem:()=> 'test-client-key'};});
test.afterEach(()=>{if(originalStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=originalStorage;});
function request(origin='http://localhost:3450') {
  const body=new FormData();body.set('image',image(),'slip.png');body.set('width','100');body.set('height','200');
  return new Request('http://localhost:3450/api/ocr/gemini',{method:'POST',headers:{origin,'x-api-key':'test-client-key'},body});
}

test('Next internal localhost URL accepts exact loopback Host origin, rejects other ports and sites',async()=>{
  const handler=createGeminiBridgeHandler();
  for(const [origin,expected] of [['http://127.0.0.1:3461',401],['http://127.0.0.1:3450',403],['https://evil.example',403]]) {
    const response=await handler(new Request('http://localhost:3461/api/ocr/gemini',{method:'POST',headers:{host:'127.0.0.1:3461',origin}}));
    assert.equal(response.status,expected);
  }
});

test('loopback exception does not trust forwarded or external hosts',async()=>{
  const handler=createGeminiBridgeHandler();
  for(const headers of [
    {origin:'https://evil.example',host:'evil.example'},
    {origin:'http://127.0.0.1:3461',host:'localhost:3461','x-forwarded-host':'127.0.0.1:3461'},
    {origin:'http://127.0.0.1:3450',host:'127.0.0.1:3450'}
  ])assert.equal((await handler(new Request('http://localhost:3461/api/ocr/gemini',{method:'POST',headers}))).status,403);
});
test('client -> multipart bridge -> transport -> client preserves response',async()=>{
  const original=globalThis.fetch;
  const expected={ok:true,value:{slips:[],pageLines:[]}};
  const handler=createGeminiBridgeHandler({transcribeImage:async(blob,ctx)=>{
    assert.equal(blob.type,'image/png');assert.deepEqual(ctx,{width:100,height:200,consent:true});return expected;
  }});
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'/api/ocr/gemini');
    return handler(new Request(`http://localhost:3450${url}`,options));
  };
  try{assert.deepEqual(await fetchFromGeminiBridge(image(),{width:100,height:200}),expected);}
  finally{globalThis.fetch=original;}
});
test('429 passes through without retry or changing review status',async()=>{
  let calls=0;
  const handler=createGeminiBridgeHandler({transcribeImage:async()=>{calls++;return {ok:false,error:{code:'GEMINI_QUOTA_EXCEEDED',message:'Quota',status:429,retryable:false,reviewStatus:'review_required'}};}});
  const response=await handler(request());assert.equal(response.status,429);
  assert.equal((await response.json()).error.reviewStatus,'review_required');assert.equal(calls,1);
});
test('cross-origin and malformed uploads never invoke transport',async()=>{
  let calls=0;const handler=createGeminiBridgeHandler({transcribeImage:async()=>{calls++;}});
  assert.equal((await handler(request('https://example.com'))).status,403);
  assert.equal((await handler(new Request('http://localhost:3450/api/ocr/gemini',{method:'POST',headers:{'x-api-key':'test-client-key'},body:'bad'}))).status,400);
  assert.equal(calls,0);
});
test('client network failure yields structured error without retry',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('private details');};
  try{const result=await fetchFromGeminiBridge(image(),{width:100,height:200});assert.equal(result.ok,false);assert.equal(result.error.reviewStatus,'review_required');assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(result),/private details/);}
  finally{globalThis.fetch=original;}
});
