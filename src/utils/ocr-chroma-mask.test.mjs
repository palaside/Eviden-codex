import test from 'node:test';
import assert from 'node:assert/strict';
import * as preprocessing from './enhance-for-ocr.mjs';

test('chroma OCR mask keeps colored ink at the same pixels without gray background texture',()=>{
  const pixels=new Uint8ClampedArray([130,180,20,255, 240,240,235,255, 80,80,80,255, 200,30,40,255]);
  const before=pixels.slice();
  const actual=preprocessing.separateChromaInk(pixels);
  assert.deepEqual([...actual],[0,0,0,255,255,255,255,255,255,255,255,255,0,0,0,255]);
  assert.deepEqual(pixels,before);
});
