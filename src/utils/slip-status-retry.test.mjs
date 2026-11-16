import test from 'node:test';
import assert from 'node:assert/strict';
import {getSlipStatusRetryBounds} from './slip-status-retry.mjs';
test('isolate a partially read success label from the QR without inventing text',()=>{
  const plan=getSlipStatusRetryBounds([{text:') อนเงินสําเร็จ [qr]',bbox:{x0:100,y0:200,x1:550,y1:253}}],{x:471,y:211,width:79,height:79},{width:600,height:900});
  assert.ok(plan);
  assert.ok(plan.x+plan.width < 471);
  assert.ok(plan.y<=200 && plan.y+plan.height>=253);
});
test('do not retry a correctly read success label or a page without a label anchor',()=>{
  assert.equal(getSlipStatusRetryBounds([{text:'โอนเงินสำเร็จ',bbox:{x0:1,y0:1,x1:20,y1:10}}],{x:40,y:1,width:5,height:5},{width:100,height:100}),null);
  assert.equal(getSlipStatusRetryBounds([{text:'ฝันดีนะ',bbox:{x0:1,y0:1,x1:20,y1:10}}],{x:40,y:1,width:5,height:5},{width:100,height:100}),null);
});
test('exclude the check icon and next reference row from a single-line status crop',()=>{
  const result=getSlipStatusRetryBounds([
    {text:') อนเงินสําเร็จ QR',bbox:{x0:100,y0:200,x1:550,y1:253}},
    {text:'รหัสอ้างอิง ABC123',bbox:{x0:173,y0:242,x1:540,y1:263}},
  ],{x:471,y:211,width:79,height:79},{width:600,height:900});
  assert.ok(result.x>=168);
  assert.ok(result.y+result.height<242);
});

test('reference anchor tolerates observed OCR suffix noise for cropping only',()=>{
  const result=getSlipStatusRetryBounds([
    {text:') อนเงินสําเร็จ QR',bbox:{x0:100,y0:200,x1:550,y1:253}},
    {text:'รหัสอ้างอัง ABC123',bbox:{x0:173,y0:242,x1:540,y1:263}},
  ],{x:471,y:211,width:79,height:79},{width:600,height:900});
  assert.ok(result.x>=168);
  assert.ok(result.y+result.height<242);
});
