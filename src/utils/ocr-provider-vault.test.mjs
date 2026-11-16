import test from 'node:test';
import assert from 'node:assert/strict';
import {OCR_MODELS,loadProviderKeys,saveProviderKeys,readProviderKey,selectOcrModel,loadProviderSettings,saveProviderSettings,readProviderConfig} from './ocr-provider-vault.mjs';
import {fetchFromSelectedOcrBridge} from './ocr-provider-bridges.mjs';
import {createProviderBridgeHandler,validateProviderEndpoint} from './ocr-provider-bridge.server.mjs';

function storage(initial={}){const map=new Map(Object.entries(initial));return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
test('four models use three independent keys with legacy Gemini migration',()=>{
  const store=storage({digital_evi_gemini_api_key:'legacy','evidence-queue':'preserve'});
  assert.equal(OCR_MODELS.length,4);assert.equal(readProviderKey('gemini',store),'legacy');
  saveProviderKeys({gemini:' Google ',typhoon:' Typhoon ',hf:' HF '},store);
  assert.deepEqual(loadProviderKeys(store),{gemini:'Google',typhoon:'Typhoon',hf:'HF'});
  assert.equal(store.getItem('evidence-queue'),'preserve');assert.equal(store.getItem('digital_evi_gemini_api_key'),null);
  assert.equal(readProviderKey('openthai-markdown',store),'HF');
  saveProviderKeys({gemini:'',typhoon:'',hf:''},store);assert.equal(readProviderKey('gemini',store),'');
});
test('failed multi-key save restores old values',()=>{
  const store=storage({gemini_key:'old-g',typhoon_key:'old-t',hf_key:'old-h'});const set=store.setItem;
  store.setItem=(k,v)=>{if(k==='hf_key'&&v==='new-h')throw new Error('Quota');set(k,v);};
  assert.throws(()=>saveProviderKeys({gemini:'new-g',typhoon:'new-t',hf:'new-h'},store));
  assert.deepEqual(loadProviderKeys(store),{gemini:'old-g',typhoon:'old-t',hf:'old-h'});
});
test('four model settings persist separate keys, providers, models and endpoints',()=>{
  const store=storage();const settings=loadProviderSettings(store);
  settings['openthai-text']={apiKey:'iApp-Text',provider:'iapp',model:'TextModel',endpoint:'https://api.iapp.co.th/v3/store/ocr/document/layout'};
  settings['openthai-markdown']={apiKey:'hf-markdown',provider:'huggingface',model:'MarkdownModel',endpoint:'https://example.endpoints.huggingface.cloud/'};
  settings.typhoon.endpoint='https://api.opentyphoon.ai/v1/chat/completions';
  saveProviderSettings(settings,store);assert.deepEqual(loadProviderSettings(store),settings);
  assert.equal(readProviderKey('openthai-text',store),'iApp-Text');assert.equal(readProviderKey('openthai-markdown',store),'hf-markdown');
  assert.equal(readProviderConfig('openthai-text',store).provider,'iapp');
});
test('endpoint guard prevents cross-provider key leaks, local URLs, query secrets and redirects',()=>{
  assert.equal(validateProviderEndpoint('https://api.iapp.co.th/v3/store/ocr/document/markdown','iapp'),'https://api.iapp.co.th/v3/store/ocr/document/markdown');
  for(const endpoint of ['http://api.iapp.co.th/','https://127.0.0.1/','https://evil.example/','https://api.iapp.co.th.evil.example/','https://api.iapp.co.th/?apikey=secret','https://user:pass@api.iapp.co.th/'])assert.throws(()=>validateProviderEndpoint(endpoint,'iapp'));
  assert.throws(()=>validateProviderEndpoint('https://api.iapp.co.th/','huggingface'));
});
test('selected bridge sends only its own key to its fixed endpoint',async()=>{
  const oldStorage=globalThis.localStorage,oldFetch=globalThis.fetch;
  globalThis.localStorage=storage({gemini_key:'Google-only',typhoon_key:'Typhoon-only',hf_key:'HF-only'});
  try{
    for(const [id,key] of [['gemini','Google-only'],['typhoon','Typhoon-only'],['openthai-text','HF-only'],['openthai-markdown','HF-only']]){
      selectOcrModel(id);let calls=0;
      globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,`/api/ocr/${id}`);assert.equal(options.headers['x-api-key'],key);return Response.json({ok:true,value:{slips:[],pageLines:[]}});};
      assert.equal((await fetchFromSelectedOcrBridge(new Blob(['test']),{width:100,height:200})).ok,true);assert.equal(calls,1);
    }
  }finally{selectOcrModel('gemini');globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
test('missing selected key never falls back to another provider',async()=>{
  const oldStorage=globalThis.localStorage,oldFetch=globalThis.fetch;let calls=0;
  globalThis.localStorage=storage({gemini_key:'Google'});globalThis.fetch=async()=>{calls++;};selectOcrModel('typhoon');
  try{assert.equal((await fetchFromSelectedOcrBridge(null)).ok,false);assert.equal(calls,0);}
  finally{selectOcrModel('gemini');globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;}
});
function upload(){const body=new FormData();body.set('image',new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),'image.png');body.set('width','100');body.set('height','200');return new Request('http://localhost/api/ocr/typhoon',{method:'POST',headers:{'x-api-key':'Typhoon-only'},body});}
test('Typhoon server calls only documented provider using request key',async()=>{
  let calls=0;const handler=createProviderBridgeHandler('typhoon',{fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.opentyphoon.ai/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer Typhoon-only');assert.equal(JSON.parse(options.body).model,'typhoon-ocr');
    const payload=JSON.parse(options.body);assert.equal(payload.temperature,0);
    assert.equal(payload.messages[0].role,'system');assert.match(payload.messages[0].content,/NO AUTOCORRECT/);
    assert.match(payload.messages[0].content,/s\*\*\*/);assert.equal(payload.messages[1].role,'user');
    return Response.json({choices:[{finish_reason:'stop',message:{content:'{"slips":[],"pageLines":[]}'}}]});
  }});
  assert.equal((await handler(upload())).status,200);assert.equal(calls,1);
});
test('OpenThai with no endpoint fails closed without forwarding HF token',async()=>{
  for(const id of ['openthai-text','openthai-markdown']){let calls=0;
    const response=await createProviderBridgeHandler(id,{fetchImpl:async()=>{calls++;}})(upload());
    assert.equal(response.status,503);assert.equal((await response.json()).error.code,'OCR_PROVIDER_NOT_CONFIGURED');assert.equal(calls,0);
  }
});
test('OpenThai iApp uses multipart apikey and configured endpoint; native layout is not fabricated into slip fields',async()=>{
  const body=new FormData();body.set('provider','iapp');body.set('endpoint','https://api.iapp.co.th/v3/store/ocr/document/markdown');body.set('model','OpenThai-Markdown');body.set('width','100');body.set('height','200');body.set('image',new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),'image.png');
  let calls=0;
  const handler=createProviderBridgeHandler('openthai-markdown',{fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.iapp.co.th/v3/store/ocr/document/markdown');assert.equal(options.headers.apikey,'iapp-only');assert.ok(options.body.get('file') instanceof Blob);assert.equal(options.redirect,'manual');return Response.json({markdown:'ข้อความจริง',pages:[]});}});
  const response=await handler(new Request('http://localhost/api/ocr/openthai-markdown',{method:'POST',headers:{'x-api-key':'iapp-only'},body}));
  assert.equal(calls,1);assert.equal(response.status,200);const mapped=await response.json();assert.equal(mapped.value.rawText,'ข้อความจริง');assert.equal(mapped.value.candidates.length,0);
});
test('OpenThai HF endpoint uses only Bearer token and binary image',async()=>{
  const body=new FormData();body.set('provider','huggingface');body.set('endpoint','https://example.endpoints.huggingface.cloud/');body.set('width','100');body.set('height','200');body.set('image',new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'}),'image.png');
  const handler=createProviderBridgeHandler('openthai-text',{fetchImpl:async(url,options)=>{assert.equal(url,'https://example.endpoints.huggingface.cloud/');assert.equal(options.headers.Authorization,'Bearer hf-only');assert.ok(options.body instanceof Blob);return Response.json({slips:[],pageLines:[]});}});
  assert.equal((await handler(new Request('http://localhost/api/ocr/openthai-text',{method:'POST',headers:{'x-api-key':'hf-only'},body}))).status,200);
});
test('Typhoon malformed or quota response never becomes a candidate',async()=>{
  for(const [response,status] of [[Response.json({choices:[]}),502],[new Response('',{status:429}),429]]){
    const result=await createProviderBridgeHandler('typhoon',{fetchImpl:async()=>response})(upload());assert.equal(result.status,status);assert.equal((await result.json()).ok,false);
  }
});
