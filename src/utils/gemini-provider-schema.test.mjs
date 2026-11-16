import test from 'node:test';
import assert from 'node:assert/strict';
import {GEMINI_OCR_RESPONSE_SCHEMA,EXACT_TRANSCRIPTION_PROMPT,validateGeminiOcrDocument} from './gemini-ocr-contract.mjs';

test('prompt states contract constants omitted from provider schema without altering OCR text',()=>{
  assert.match(EXACT_TRANSCRIPTION_PROMPT,/data\.document_type exactly to "bank_transfer_slip"/);
  assert.match(EXACT_TRANSCRIPTION_PROMPT,/confidence is a NUMBER between 0 and 1/);
  assert.match(EXACT_TRANSCRIPTION_PROMPT,/All properties shown in the supplied schema must be present/);
});

test('provider schema contains only structural types and nullable, without expensive constraints',()=>{
  function check(schema){
    assert.ok(['OBJECT','ARRAY','STRING','NUMBER'].includes(schema.type));
    for(const key of Object.keys(schema))assert.ok(['type','nullable','properties','items'].includes(key),key);
    Object.values(schema.properties||{}).forEach(check);
    if(schema.items)check(schema.items);
  }
  check(GEMINI_OCR_RESPONSE_SCHEMA);
});
test('local validation still requires fields, rejects extra keys and invalid geometry/confidence',()=>{
  const context={width:100,height:100};
  for(const document of [{slips:[]},{slips:[],pageLines:[],extra:true},
    {slips:[],pageLines:[{text:'test',confidence:2,bounds:{x:0,y:0,width:10,height:10}}]},
    {slips:[],pageLines:[{text:'test',confidence:0.9,bounds:{x:0,y:0,width:0,height:10}}]}])
    assert.throws(()=>validateGeminiOcrDocument(document,context),{code:'GEMINI_SCHEMA_MISMATCH'});
});
test('validation reports a safe field path without copying rejected values',()=>{
  assert.throws(()=>validateGeminiOcrDocument({slips:[],pageLines:[{text:'private text',confidence:67,bounds:{x:0,y:0,width:10,height:10}}]},{width:100,height:100}),error=>{
    assert.match(error.message,/\$\.pageLines\[0\]\.confidence/);
    assert.doesNotMatch(error.message,/private text/);
    return true;
  });
});
