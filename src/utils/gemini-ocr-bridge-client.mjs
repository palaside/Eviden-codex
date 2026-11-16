/** Same-origin bridge. The user key is read only from the browser vault. */
import {validateGeminiReviewOutput,GEMINI_REVIEW_FORMAT} from './gemini-ocr-assessment.mjs';
import {readProviderKey} from './ocr-provider-vault.mjs';

export const GEMINI_VAULT_STORAGE_KEY = 'gemini_key';
export function readGeminiVaultKey() {
  return readProviderKey('gemini');
}
export function writeGeminiVaultKey(value) {
  if(!globalThis.localStorage)throw new Error('Browser storage is unavailable');
  const key=value.trim();
  if(key)globalThis.localStorage.setItem(GEMINI_VAULT_STORAGE_KEY,key);
  else globalThis.localStorage.removeItem(GEMINI_VAULT_STORAGE_KEY);
  globalThis.localStorage.removeItem('digital_evi_gemini_api_key');
}

const errorSubscribers = new Set();
export function subscribeGeminiBridgeErrors(listener) {
  errorSubscribers.add(listener);
  return () => { errorSubscribers.delete(listener); };
}
function failure(code, status = null, providerLabel = 'Gemini', upstreamStatus = null) {
  const messages = {
    GEMINI_QUOTA_EXCEEDED: 'Gemini quota เต็ม (429) หยุดคำขอแล้ว ไม่มีการ retry',
    GEMINI_TIMEOUT: 'Gemini ใช้เวลานานเกินกำหนด คำขอถูกยกเลิกแล้ว',
    GEMINI_NOT_CONFIGURED: 'โปรดกรอก API Key ก่อนสกัดรายละเอียด',
    GEMINI_INVALID_API_KEY: 'API Key มีอักขระที่ส่งใน HTTP header ไม่ได้ หรือยาวเกินกำหนด ไม่ได้จำกัด prefix ของคีย์',
    GEMINI_SCHEMA_MISMATCH: 'Gemini ส่ง JSON ที่ไม่ตรงรูปแบบ จึงไม่ใช้ผลนี้',
    GEMINI_INVALID_JSON: 'Gemini ตอบกลับเป็น JSON ที่อ่านไม่ได้',
    GEMINI_UNSUPPORTED_FIELD: 'ผล Gemini มี field ที่ไม่ผ่านข้อกำหนดหลักฐาน',
    GEMINI_BLOCKED: 'Gemini ปฏิเสธการประมวลผลภาพนี้',
    GEMINI_INCOMPLETE_RESPONSE: 'Gemini ส่งผลไม่ครบหรือหยุดก่อนจบ จึงไม่ใช้ผลนี้',
    GEMINI_NETWORK_ERROR: 'Server ติดต่อ Google Gemini ไม่สำเร็จ',
    GEMINI_BRIDGE_ERROR: 'เบราว์เซอร์ติดต่อ Server Bridge ไม่สำเร็จ หรืออ่าน response ไม่ได้',
    GEMINI_BRIDGE_ORIGIN: 'Server ปฏิเสธ origin ของหน้าเว็บ กรุณาตรวจ URL ของ Staging',
    GEMINI_HTTP_ERROR: upstreamStatus===401?'Google ปฏิเสธการยืนยันตัวตนของคีย์':upstreamStatus===403?'Google ปฏิเสธสิทธิ์ใช้งาน โปรดตรวจสิทธิ์คีย์และโปรเจกต์':upstreamStatus===404?'Google ไม่พบโมเดลหรือ endpoint ที่ร้องขอ':upstreamStatus===400?'Google ปฏิเสธคำขอ โปรดตรวจคีย์และรูปแบบ request':upstreamStatus>=500?'บริการ Google Gemini ขัดข้อง':'Google ปฏิเสธคำขอ Gemini',
    OCR_INVALID_ENDPOINT: 'Endpoint ต้องเป็น HTTPS ของ Provider ที่เลือก และไม่ใส่คีย์ใน URL',
    OCR_OUTPUT_MAPPING_REQUIRED: 'Provider คืนข้อความหรือ layout แต่ยังไม่มี field/พิกัดสลิปตามสัญญา ต้องตรวจและเชื่อมตัวแปลงผลก่อน',
    OCR_MEMO_TOO_LONG: 'ข้อความ OCR เกิน 50,000 ตัวอักษร ระบบไม่ได้ตัดข้อความทิ้ง กรุณาแบ่งเอกสารเพื่อตรวจทาน',
  };
  const message = `${(messages[code] || (code==='OCR_PROVIDER_NOT_CONFIGURED'?'ยังไม่ได้เชื่อม inference endpoint สำหรับโมเดลนี้':'ประมวลผล OCR ไม่สำเร็จ')).replaceAll('Gemini',providerLabel)} [${/^[A-Z0-9_]+$/.test(code)?code:'OCR_ERROR'}${Number.isInteger(upstreamStatus)?` · Google HTTP ${upstreamStatus}`:''}] — review_required`;
  for (const listener of errorSubscribers) { try { listener(message); } catch { /* Notification must not hide the OCR error. */ } }
  return {ok:false,error:{code,message,status,retryable:false,reviewStatus:'review_required'}};
}

export function createGeminiBridgeClient({fetchImpl=(...args)=>globalThis.fetch(...args),timeoutMs=100_000,getApiKey=readGeminiVaultKey,endpoint='/api/ocr/gemini',providerLabel='Gemini',getConfig,validateOutput=validateGeminiReviewOutput} = {}) {
  return async function fetchFromGeminiBridge(imageBlob, context = {}) {
  let bitmap;
  let timeout;
  try {
    const config=getConfig?.();
    const apiKey=(config?.apiKey??getApiKey())?.trim();
    if(!apiKey)return failure('GEMINI_NOT_CONFIGURED',401,providerLabel);
    if (!context.width || !context.height) {
      bitmap = await createImageBitmap(imageBlob);
      context = {...context, width: bitmap.width, height: bitmap.height};
    }
    const body = new FormData();
    body.set('image', imageBlob, 'ocr-image');
    body.set('width', String(context.width));
    body.set('height', String(context.height));
    if(context.jobKind)body.set('jobKind',context.jobKind);
    if(config){body.set('provider',config.provider);body.set('endpoint',config.endpoint);body.set('model',config.model);}
    console.info(`[${providerLabel} OCR] ส่งภาพไป provider`);
    const controller = new AbortController();
    timeout = setTimeout(()=>controller.abort(), timeoutMs);
    const response = await fetchImpl(endpoint, {method: 'POST',headers:{'x-api-key':apiKey}, body, cache: 'no-store',signal:controller.signal});
    const result = await response.json();
    if (!response.ok || result?.ok !== true) {
      console.warn(`[${providerLabel} OCR] คำขอไม่สำเร็จ`, response.status);
      const code=result?.error?.code || 'GEMINI_BRIDGE_ERROR';
      return failure(code,response.status,providerLabel,code==='GEMINI_HTTP_ERROR'||code==='GEMINI_QUOTA_EXCEEDED'?result?.error?.status:null);
    }
    const accepted=validateOutput(result.value,context);
    console.info(`[${providerLabel} OCR] ได้รับข้อมูลกลับมาแล้ว`);
    return {...result,value:accepted};
  } catch (error) {
    console.warn(`[${providerLabel} OCR] ติดต่อ bridge หรืออ่าน response ไม่สำเร็จ`);
    return failure(error?.name === 'AbortError' ? 'GEMINI_TIMEOUT' : error?.code || 'GEMINI_BRIDGE_ERROR',null,providerLabel);
  } finally { if(timeout)clearTimeout(timeout); bitmap?.close(); }
  };
}

export const fetchFromGeminiBridge = createGeminiBridgeClient();

/** Compatibility envelope for the existing explicit Gemini button. */
export async function fetchGeminiDetectionBridge(file) {
  const bitmap = await createImageBitmap(file);
  const size = {width:bitmap.width,height:bitmap.height};
  bitmap.close();
  const result = await fetchFromGeminiBridge(file,size);
  if(!result.ok)return Response.json({success:false,message:result.error.message},{status:result.error.status || 502});
  const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
  return Response.json({success:true,candidates:result.value.slips.map(slip=>({
    bbox_1000:[slip.bounds.y/size.height*1000,slip.bounds.x/size.width*1000,
      (slip.bounds.y+slip.bounds.height)/size.height*1000,(slip.bounds.x+slip.bounds.width)/size.width*1000],
    visual_cues:slip.data.raw_text,data:slip.data,ocrTextBoxes:slip.ocrTextBoxes,sourceIndex:slip.sourceIndex,
    geminiReview:result.value.format===GEMINI_REVIEW_FORMAT?result.value:null,
  })),geminiReview:result.value.format===GEMINI_REVIEW_FORMAT?result.value:null,metadata:{file_name:file.name,mime_type:file.type,sha256,size_bytes:file.size,
    extracted_at:new Date().toISOString(),template_mode:'review_only'}});
}
