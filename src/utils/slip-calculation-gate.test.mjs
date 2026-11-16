import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSlipCalculation, evaluateSlipBatch, validateSlipAssessment, slipCalculationPolicy } from './slip-calculation-gate.mjs';

test('JSON policy defines nine unique components totalling 100 and guards malformed assessments', () => {
  assert.equal(slipCalculationPolicy.components.length,9);
  assert.equal(new Set(slipCalculationPolicy.components.map(c => c.id)).size,9);
  assert.equal(slipCalculationPolicy.components.filter(c => c.required).reduce((sum,c) => sum+c.weight,0),100);
  const valid = evaluateSlipCalculation(make('valid'));
  assert.deepEqual(validateSlipAssessment(valid),[]);
  assert.ok(validateSlipAssessment({...valid,components:valid.components.slice(1)}).length);
  assert.ok(validateSlipAssessment({...valid,score:null}).length);
  assert.ok(validateSlipAssessment({...valid,reviewStatus:'auto_confirmed'}).length);
  assert.ok(validateSlipAssessment({...valid,amount:0}).length);
});

test('memo is optional and adds a separate 10.1 bonus without replacing required evidence', () => {
  const noMemo = evaluateSlipCalculation(make('no-memo',labels.filter(l => l !== 'บันทึกความจำ')));
  assert.equal(noMemo.eligible,true);
  assert.equal(noMemo.score,100);
  assert.equal(noMemo.bonusScore,0);
  assert.equal(noMemo.missing.includes('บันทึกความจำ'),false);
  const withMemo = evaluateSlipCalculation(make('memo'));
  assert.equal(withMemo.bonusScore,10.1);
  const noDate = evaluateSlipCalculation(make('missing-date',labels.filter(l => l !== 'วันเวลา')));
  assert.equal(noDate.eligible,false);
  assert.equal(noDate.bonusScore,10.1);
});
test('fixed slip labels tolerate OCR decoration without changing names or raw text', () => {
  const r=make('decorated');
  r.ocrTextBoxes.find(b=>b.text==='จาก').text='©   จาก          |';
  r.ocrTextBoxes.find(b=>b.text==='ค่าธรรมเนียม').text='คําธรรมเนียม 0.00 บาท';
  assert.equal(evaluateSlipCalculation(r).eligible,true);
});
test('a positioned memo field can contain a reason without the literal memo label',()=>{
  const r=make('reason',labels.filter(l=>l!=='บันทึกความจำ'));
  r.ocrTextBoxes.push({text:'ค่าอาหาร',classification:'slip_evidence',confidence:.95,bounds:{x:1,y:200,width:90,height:20},supportsFields:['note']});
  const result=evaluateSlipCalculation(r);
  assert.equal(result.bonusScore,10.1);
  assert.equal(result.eligible,true);
});

test('unread OCR is unknown, never a low completeness score or zero transfer', () => {
  const result = evaluateSlipCalculation(make('partial', labels.slice(0,4)));
  assert.equal(result.score,null);
  assert.equal(result.assessmentStatus,'unknown');
  assert.equal(result.components.find(c => c.id === 'note').status,'unknown');
  assert.equal(result.amount,10000);
  assert.match(result.reason,/OCR ยังอ่านองค์ประกอบไม่ครบ/u);
  assert.doesNotMatch(result.reason,/ยังประเมินไม่ได้/u);
});
test('a failed region cannot qualify even when all nine labels are read', () => {
  const result = evaluateSlipCalculation({ ...make('bad-crop'), regionQuality:'fail' });
  assert.equal(result.score,null);
  assert.equal(result.eligible,false);
  assert.equal(result.assessmentStatus,'region_invalid');
});

const labels = ['โอนเงินสำเร็จ','รหัสอ้างอิง','จาก','ไปยัง','จำนวนเงิน','ค่าธรรมเนียม','วันเวลา','บันทึกความจำ'];
const make = (id, texts = labels, ref = id) => ({ id, data: { transaction: { amount: 10000, reference_no: ref }, raw_text: ['0002010102121234567890'] }, ocrTextBoxes: texts.map(text => ({ text, classification: 'slip_evidence', confidence: .95, bounds: { x: 1, y: 2, width: 100, height: 20 } })) });
test('three occurrences count only the complete slip', () => {
  const result = evaluateSlipBatch([make('page1'), make('page3', labels.slice(0,6)), make('page4', labels.slice(0,4))]);
  assert.equal(result.filter(r => r.eligible).reduce((n,r) => n + r.amount, 0), 10000);
  assert.equal(result[0].score, 100);
  assert.equal(result[1].eligible, false);
});
test('never combines evidence across slips or includes chat context', () => {
  const a = make('a', labels.slice(0,4));
  a.ocrTextBoxes.push(...make('b', labels.slice(4)).ocrTextBoxes.map(b => ({ ...b, classification: 'chat_context' })));
  assert.equal(evaluateSlipCalculation(a).eligible, false);
});
test('counts a repeated reference once, preferring the complete occurrence', () => {
  const result = evaluateSlipBatch([make('a', [], 'same'),make('b', labels, 'same'),make('c', labels, 'same')]);
  assert.deepEqual(result.map(r => r.eligible), [false,true,false]);
  assert.equal(result[2].duplicateOf, 'b');
});
test('missing QR, missing amount and missing evidence fail closed without changing review', () => {
  const a = make('a'); a.data.raw_text = [];
  assert.equal(evaluateSlipCalculation(a).eligible, false);
  const b = make('b'); b.data.transaction.amount = null;
  assert.equal(evaluateSlipCalculation(b).eligible, false);
  assert.equal(evaluateSlipCalculation({ data: { transaction: { amount: 10000 } }, isConfirmed: true }).eligible, false);
});
test('accepts the decoded local bank-slip QR format and decomposed Thai labels', () => {
  const record = make('thai');
  record.data.raw_text = ['0038000600000101030060217A885bbdab3b6748625102TH910400BC'];
  record.ocrTextBoxes[0].text = 'โอนเงินสําเร็จ';
  record.ocrTextBoxes[4].text = 'จํานวนเงิน';
  assert.equal(evaluateSlipCalculation(record).score,100);
});
