import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeminiBridgeHandler} from './gemini-ocr-bridge.server.mjs';
import {createGeminiBridgeClient,readGeminiVaultKey,writeGeminiVaultKey,GEMINI_VAULT_STORAGE_KEY} from './gemini-ocr-bridge-client.mjs';
import {EXACT_TRANSCRIPTION_PROMPT} from './gemini-ocr-contract.mjs';

test('missing client key is rejected before transport even if server environment has a key',async()=>{
  let called=false;
  const handler=createGeminiBridgeHandler({transcribeImage:async()=>{called=true;}});
  const response=await handler(new Request('http://localhost:3450/api/ocr/gemini',{method:'POST'}));
  assert.equal(response.status,401);assert.equal((await response.json()).error.message,'โปรดกรอก API Key ก่อนสกัดรายละเอียด');assert.equal(called,false);
});

test('browser vault persists only its own key and sends it in header, not body',async()=>{
  const oldStorage=globalThis.localStorage;
  const values=new Map([['existing-evidence','untouched']]);
  globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  try{
    writeGeminiVaultKey('  client-vault-key  ');
    assert.equal(readGeminiVaultKey(),'client-vault-key');
    assert.equal(values.get(GEMINI_VAULT_STORAGE_KEY),'client-vault-key');
    const client=createGeminiBridgeClient({fetchImpl:async(_url,options)=>{
      assert.equal(options.headers['x-api-key'],'client-vault-key');
      assert.equal(options.body.has('apiKey'),false);
      return Response.json({ok:true,value:{slips:[],pageLines:[]}});
    }});
    const result=await client(new Blob(['image']),{width:100,height:200});
    assert.equal(result.ok,true);assert.doesNotMatch(JSON.stringify(result),/client-vault-key/);
    writeGeminiVaultKey('');assert.equal(readGeminiVaultKey(),'');
    assert.equal(values.get('existing-evidence'),'untouched');
  }finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
test('missing browser key stops before reading image or making a request',async()=>{
  let calls=0;const client=createGeminiBridgeClient({getApiKey:()=>'',fetchImpl:async()=>{calls++;}});
  const result=await client(null);
  assert.equal(result.error.code,'GEMINI_NOT_CONFIGURED');assert.match(result.error.message,/โปรดกรอก API Key ก่อนสกัดรายละเอียด/);assert.equal(calls,0);
});
test('exact transcription explicitly forbids guessing, deleting stars and expanding abbreviations',()=>{
  assert.match(EXACT_TRANSCRIPTION_PROMPT,/ห้ามเดา/);assert.match(EXACT_TRANSCRIPTION_PROMPT,/ห้ามลบดอกจัน/);assert.match(EXACT_TRANSCRIPTION_PROMPT,/ห้ามลบหรือขยายตัวย่อ/);
});
test('client header key reaches Google header and never response',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.headers['x-goog-api-key'],'client-key-test');return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{"slips":[],"pageLines":[]}'}]}}]});};
  try{
    const body=new FormData();body.set('image',new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),'slip.png');body.set('width','100');body.set('height','200');
    const response=await createGeminiBridgeHandler()(new Request('http://localhost:3450/api/ocr/gemini',{method:'POST',headers:{'x-api-key':'client-key-test'},body}));
    assert.equal(response.status,200);assert.equal(calls,1);assert.doesNotMatch(await response.text(),/client-key-test/);
  }finally{globalThis.fetch=original;}
});
