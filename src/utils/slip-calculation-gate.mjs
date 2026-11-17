import policy from '../schemas/slip-components.policy.json' with { type:'json' };
import assessmentSchema from '../schemas/slip-assessment.schema.json' with { type:'json' };

export { policy as slipCalculationPolicy };
const requiredFound = parts => policy.components.filter(rule => rule.required).every(rule => parts.find(c => c.id === rule.id)?.status === 'found');

// Specific contract validation, not a general-purpose JSON Schema engine.
export function validateSlipAssessment(value) {
  const errors = [];
  for (const key of assessmentSchema.required) if (!(key in value)) errors.push(`missing:${key}`);
  if (value.policyVersion !== policy.policyVersion) errors.push('policyVersion');
  if (!assessmentSchema.properties.score.enum.includes(value.score)) errors.push('score');
  if (!assessmentSchema.properties.assessmentStatus.enum.includes(value.assessmentStatus)) errors.push('assessmentStatus');
  if (typeof value.eligible !== 'boolean') errors.push('eligible');
  if (value.amount !== null && (typeof value.amount !== 'number' || !Number.isFinite(value.amount) || value.amount <= 0)) errors.push('amount');
  if (!assessmentSchema.properties.reviewStatus.enum.includes(value.reviewStatus)) errors.push('reviewStatus');
  const parts = value.components || [];
  if (parts.length !== policy.components.length || new Set(parts.map(c => c.id)).size !== parts.length) errors.push('components');
  for (const rule of policy.components) {
    const c = parts.find(c => c.id === rule.id);
    if (!c || !assessmentSchema.properties.components.items.properties.status.enum.includes(c.status)
      || !Array.isArray(c.evidence) || (c.status === 'found' && !c.evidence.length)) errors.push(rule.id);
  }
  if (value.eligible && (value.score !== policy.requiredScore || value.assessmentStatus !== 'complete'
    || !requiredFound(parts) || !(value.amount > 0))) errors.push('eligibility');
  if (value.assessmentStatus !== 'complete' && (value.score !== null || value.eligible)) errors.push('unknown');
  if (value.score === 100 && (value.assessmentStatus !== 'complete' || !requiredFound(parts))) errors.push('completeness');
  const expectedBonus = parts.find(c => c.id === 'note')?.status === 'found' ? policy.components.find(c => c.id === 'note').bonusWeight : 0;
  if (value.bonusScore !== expectedBonus) errors.push('bonusScore');
  return errors;
}

export function evaluateSlipCalculation(record) {
  const boxes = (record.ocrTextBoxes || []).filter(b => b.classification === 'slip_evidence'
    && b.bounds && b.bounds.width > 0 && b.bounds.height > 0 && b.confidence > 0);
  const components = policy.components.filter(rule => rule.pattern).map(({id,label,weight,required,bonusWeight,pattern}) => {
    const matcher = new RegExp(pattern,'u');
    const evidence = boxes.filter(b => matcher.test(String(b.rawOcr || b.text || '').normalize('NFC').replace(/\u0e4d\u0e32/gu,'ำ'))
      || (id === 'note' && b.supportsFields?.some(field => field === 'note' || field === 'transaction_note') && String(b.rawOcr || b.text || '').trim()))
      .map(b => ({ text: b.rawOcr || b.text, bounds: b.bounds, confidence: b.confidence }));
    return { id,label,weight,required,...(bonusWeight ? {bonusWeight} : {}),found: evidence.length > 0,status:evidence.length ? 'found' : policy.unreadComponentStatus,evidence };
  });
  // Only a decoded payload belonging to this occurrence proves the QR component.
  const payload = (record.data?.raw_text || []).find(t => /^(?:000201\d{10,}|00\d{2}0006000001[A-Za-z0-9]+5102TH[A-Za-z0-9]*)$/u.test(t.trim()));
  const qrRule = policy.components.find(rule => rule.id === 'qr');
  components.push({ ...qrRule,found:!!payload,status:payload ? 'found' : policy.unreadComponentStatus,evidence:payload ? [{ text:payload, source:'decoded_qr_payload' }] : [] });
  const regionInvalid = record.regionQuality === 'fail' || record.fieldQualitySummary?.region_quality === 'fail';
  const complete = !regionInvalid && requiredFound(components);
  const score = complete ? policy.requiredScore : policy.unknownScore;
  const amount = record.data?.transaction?.amount;
  const validAmount = typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  const missing = components.filter(c => c.required && !c.found).map(c => c.label);
  const memo = components.find(c => c.id === 'note');
  const result = { policyVersion:policy.policyVersion, score, bonusScore:memo.found ? memo.bonusWeight : 0, assessmentStatus:regionInvalid ? 'region_invalid' : complete ? 'complete' : 'unknown', components, missing,
    amount:validAmount ? amount : null, eligible:complete && validAmount,
    reason:regionInvalid ? 'กรอบสลิปไม่ผ่าน — ต้องตรวจกรอบก่อนประเมิน' : !complete ? `OCR ยังอ่านองค์ประกอบไม่ครบ: ${missing.join(', ')} — รอตรวจภาพ ไม่ได้ยืนยันว่าองค์ประกอบหาย` : !validAmount ? 'พบองค์ประกอบครบ แต่รายการยังไม่มียอดสำหรับคำนวณ' : 'ครบ 100 คะแนน',
    reviewStatus:record.isConfirmed ? 'human_reviewed' : 'review_required' };
  const errors = validateSlipAssessment(result);
  if (errors.length) throw new Error(`Invalid slip assessment: ${errors.join(',')}`);
  return result;
}

export function evaluateSlipBatch(records) {
  const seen = new Map();
  return records.map(record => {
    const result = evaluateSlipCalculation(record);
    if (!result.eligible) return result;
    const ref = String(record.data?.transaction?.reference_no || '').trim().toUpperCase();
    if (!ref || /^(CHAT|SLIP)-/u.test(ref)) return { ...result,eligible:false,reason:'ไม่มีรหัสอ้างอิงสำหรับตรวจธุรกรรมซ้ำ' };
    if (seen.has(ref)) return { ...result,eligible:false,duplicateOf:seen.get(ref),reason:'รหัสอ้างอิงซ้ำ — ไม่นับยอดซ้ำ' };
    seen.set(ref,record.id);
    return result;
  });
}

export function projectSlipCalculationRecords(records) {
  const gates = evaluateSlipBatch(records);
  return records.map((r,i) => ({ id:r.id, isConfirmed:!!r.isConfirmed && gates[i].eligible,
    amount:gates[i].eligible ? gates[i].amount : null,
    referenceNo:r.data?.transaction?.reference_no,
    recipientName:r.data?.receiver?.name,
    calculationGate:gates[i] }));
}
