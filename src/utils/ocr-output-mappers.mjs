import {SlipExtractionSchema} from '../schemas/slip.schema.ts';
import {validateGeminiOcrDocument} from './gemini-ocr-contract.mjs';

const FORMAT='digital-evidence.mapped-ocr.v1';
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
const ascii=text=>text.replace(/[๐-๙]/gu,c=>'๐๑๒๓๔๕๖๗๘๙'.indexOf(c));
const unique=values=>[...new Set(values)];
const choose=(values,field,warnings)=>{const found=unique(values);if(found.length>1)warnings.push(`conflict:${field}`);return found.length===1?found[0]:null;};
const blank=()=>({document_type:'bank_transfer_slip',bank:{name:null,confidence:0},transaction:{date:null,time:null,amount:null,currency:'THB',fee:null,reference_no:null,transaction_id:null,note:null},sender:{name:null,bank:null,account_no:null},receiver:{name:null,bank:null,account_no:null},confidence:Object.fromEntries(['date','time','amount','reference_no','sender_name','receiver_name','sender_account','receiver_account'].map(key=>[key,0])),raw_text:[],warnings:[],_fallback_meta:{needs_human_review:true,unclear_fields:[]}});
const status=/โอนเงินสำเร็จ|โอนสำเร็จ|ทำรายการสำเร็จ|transfer\s+(?:successful|completed)/giu;
function rawOf(value){
  if(typeof value==='string'){
    try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==='object')return rawOf(parsed);}catch{/* Plain text/Markdown is native OCR output. */}
    return value;
  }
  if(Array.isArray(value))return value.map(rawOf).filter(v=>v!=='').join('\n');
  if(!value||typeof value!=='object')return '';
  if(typeof value.markdown==='string')return value.markdown;
  if(typeof value.natural_text==='string')return value.natural_text;
  if(typeof value.generated_text==='string')return rawOf(value.generated_text);
  if(Array.isArray(value.raw_text))return value.raw_text.join('\n');
  if(typeof value.text==='string'||Array.isArray(value.text))return rawOf(value.text);
  if(Array.isArray(value.components))return value.components.map(component=>typeof component.text==='string'?component.text:'').join('\n');
  if(value.data)return rawOf(value.data);
  if(Array.isArray(value.pages))return value.pages.map(page=>typeof page.markdown==='string'?page.markdown:Array.isArray(page.blocks)?page.blocks.map(block=>block.text||'').join('\n'):'').join('\n');
  return '';
}
function nativeLines(value,{width,height}){
  if(!value||typeof value!=='object'||Array.isArray(value))return [];
  const pages=value.pages||[];if(pages.some(page=>page.truncated))fail('OCR_INCOMPLETE_RESPONSE','Provider returned truncated OCR');
  if(pages.length!==1)return [];
  const page=pages[0];if(!(page.width>0&&page.height>0))return [];
  return (page.blocks||[]).flatMap(block=>{
    const b=block.bbox;if(typeof block.text!=='string'||!block.text.trim()||!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[0]<0||b[1]<0||b[2]<=b[0]||b[3]<=b[1]||b[2]>page.width||b[3]>page.height)return [];
    return [{text:block.text,confidence:0,bounds:{x:b[0]*width/page.width,y:b[1]*height/page.height,width:(b[2]-b[0])*width/page.width,height:(b[3]-b[1])*height/page.height}}];
  });
}
function extract(raw,warnings){
  const data=blank();const tokenText=raw.replace(/<br\s*\/?>/giu,'\n').replace(/<\/tr\s*>/giu,'\n').replace(/<[^>]+>/gu,' ').replaceAll('&nbsp;',' ');
  const text=ascii(tokenText);
  const money=label=>[...text.matchAll(new RegExp(`(?:${label})[\\s:*|：]*((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)(?=\\s|บาท|THB|\\||$)`,'giu'))].map(match=>Number(match[1].replaceAll(',',''))).filter(Number.isFinite);
  data.transaction.amount=choose(money('จำนวนเงิน|ยอดโอน|amount').filter(n=>n>0),'amount',warnings);
  data.transaction.fee=choose(money('ค่าธรรมเนียม|fee').filter(n=>n>=0),'fee',warnings);
  const refs=[...text.matchAll(/(?:รหัสอ้างอิง|เลขที่อ้างอิง|หมายเลขอ้างอิง|reference(?:\s*(?:id|no\.?))?|ref(?:\s*(?:id|no\.?))?)[\s:*|：]*([A-Za-z0-9][A-Za-z0-9_/-]{3,99})/giu)].map(match=>match[1]);
  data.transaction.reference_no=choose(refs,'reference_no',warnings);
  const months=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  const dates=[];
  for(const match of text.matchAll(/(\d{1,2})[\s/-]*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|\d{1,2})[\s/-]+(\d{4})/gu)){
    const year=Number(match[3])>=2400?Number(match[3])-543:Number(match[3]);
    const month=months.includes(match[2])?months.indexOf(match[2])+1:Number(match[2]);
    const iso=`${year}-${String(month).padStart(2,'0')}-${match[1].padStart(2,'0')}`;
    if(!Number.isNaN(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso)dates.push(iso);
  }
  for(const match of text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/gu))if(!Number.isNaN(Date.parse(match[1]))&&new Date(match[1]).toISOString().slice(0,10)===match[1])dates.push(match[1]);
  data.transaction.date=choose(dates,'date',warnings);
  const times=[...text.matchAll(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)/gu)].map(m=>`${m[1].padStart(2,'0')}:${m[2]}${m[3]?':'+m[3]:''}`);
  data.transaction.time=choose(times,'time',warnings);
  const lines=tokenText.split(/\r?\n/u);
  for(const [party,label] of [['sender','จาก|ผู้โอน|sender\\b|from\\b'],['receiver','ไปยัง|ผู้รับ|receiver\\b|to\\b']]){
    const names=[];
    for(let index=0;index<lines.length;index++){
      const match=new RegExp(`^\\s*\\|?\\s*(?:#{1,6}\\s*)?(?:\\*\\*)?(?:${label})(?:\\*\\*)?\\s*[:：|]?\\s*(.*?)\\s*\\|?\\s*$`,'iu').exec(lines[index]);
      if(!match)continue;const name=(match[1]||lines[index+1]||'').trim();
      if(name&&!/^(?:จำนวนเงิน|ค่าธรรมเนียม|วันที่|ไปยัง|จาก|ธนาคาร|XXX|\d)/iu.test(name))names.push(name);
    }
    data[party].name=choose(names,`${party}_name`,warnings);
  }
  const banks=[...raw.matchAll(/ธนาคารกรุงไทย|กรุงไทย|Krungthai|ธนาคารกสิกรไทย|กสิกรไทย|KBank|ธนาคารไทยพาณิชย์|ไทยพาณิชย์|SCB|ธนาคารกรุงเทพ|กรุงเทพ|Bangkok Bank|ttb|ทหารไทยธนชาต|กรุงศรี|Krungsri/giu)];
  // A header bank is a proposal; conflicting bank names elsewhere are not collapsed into one.
  data.bank.name=banks.length?banks[0][0]:null;
  data.raw_text=[raw];return data;
}
function mapNative(value,context,provider,copyMemo){
  const {width,height}=context;if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1)fail('OCR_INVALID_DIMENSIONS','Invalid source size');
  const raw=rawOf(value);if(!raw&&value&&typeof value==='object'&&!Array.isArray(value)&&!['text','markdown','natural_text','raw_text','generated_text','data','pages','components'].some(key=>Object.hasOwn(value,key)))fail('OCR_INVALID_RESPONSE','Unknown native OCR response');
  if(raw.length>50000)fail('OCR_MEMO_TOO_LONG','Raw OCR exceeds 50,000 characters; no truncation applied');
  const pageLines=nativeLines(value,context);const warnings=['review_required','heuristic_entity_extraction_not_exact','source_extent_not_detected_slip','field_coordinates_unknown_unless_provider_supplied'];
  const data=extract(raw,warnings);
  const statuses=[...raw.matchAll(status)].length;
  const likelySlip=(statuses>0&&(data.transaction.amount!==null||data.transaction.reference_no!==null))||(data.sender.name&&data.receiver.name&&data.transaction.amount!==null);
  const multiple=statuses>1||value?.pages?.length>1;
  if(multiple)warnings.push('multiple_slips_or_pages_require_verified_crops');
  if(context.jobKind==='CHAT')warnings.push('chat_auto_detection_disabled');
  const candidates=[];
  if(likelySlip&&!multiple&&context.jobKind!=='CHAT'){
    if(copyMemo){data.transaction.note=raw;warnings.push('raw_ocr_copied_to_memo_not_a_verbatim_bank_note');}
    data.warnings=warnings;data._fallback_meta.unclear_fields=Object.keys(data.confidence);
    const fields=Object.entries({amount:data.transaction.amount,reference_no:data.transaction.reference_no,sender_name:data.sender.name,receiver_name:data.receiver.name});
    const ocrTextBoxes=pageLines.map(line=>({...line,classification:'uncertain',supportsFields:fields.filter(([,v])=>v!==null&&ascii(line.text).replaceAll(',','').includes(String(v))).map(([field])=>field)}));
    candidates.push({data,bounds:{x:0,y:0,width,height},cropDataUrl:'',ocrTextBoxes});
  }
  return {format:FORMAT,provider,rawText:raw,sourceDimensions:{width,height},pageLines,candidates,warnings};
}
export function mapOpenThaiOutput(value,context,provider='openthai-text'){
  if(Array.isArray(value?.slips)&&Array.isArray(value?.pageLines))return validateGeminiOcrDocument(value,context);
  return mapNative(value,context,provider,true);
}
export function mapOpenThaiCandidates(value,context,provider='openthai-text'){const mapped=mapOpenThaiOutput(value,context,provider);return mapped.candidates??mapped.slips.map(slip=>({...slip,cropDataUrl:''}));}
function mapStructuredTyphoon(value,context){
  const data=blank();const transaction=value.transaction||{};
  data.bank.name=typeof value.bank==='string'?value.bank:value.bank?.name??null;
  for(const field of ['date','time','amount','fee','reference_no','transaction_id','note'])data.transaction[field]=transaction[field]??(field==='reference_no'?value.ref:field==='amount'?value.amount:null)??null;
  if(typeof value.datetime==='string'){
    const match=/^(\d{4}-\d{2}-\d{2})[T ]([0-2]\d:[0-5]\d(?::[0-5]\d)?)$/u.exec(value.datetime);
    if(match){data.transaction.date??=match[1];data.transaction.time??=match[2];}
  }
  for(const party of ['sender','receiver']){
    if(typeof value[party]==='string')data[party].name=value[party];
    else for(const field of ['name','bank','account_no'])data[party][field]=value[party]?.[field]??null;
  }
  const native=rawOf(value);const raw=native||JSON.stringify(value);
  const result=mapNative(native||'',context,'typhoon',false);
  if(raw.length>50000)fail('OCR_MEMO_TOO_LONG','Provider JSON exceeds audit limit');
  const explicitSlip=value.document_type==='bank_transfer_slip'||(data.transaction.amount>0&&(data.transaction.reference_no||data.receiver.name));
  result.rawText=raw;data.raw_text=[raw];
  data.warnings=[...result.warnings,'provider_json_fields_are_unverified_proposals',...(!native?['provider_json_is_not_verbatim_ocr_text']:[])];
  data._fallback_meta.unclear_fields=Object.keys(data.confidence);
  if(!SlipExtractionSchema.safeParse(data).success)fail('OCR_INVALID_RESPONSE','Structured Typhoon fields do not match the legacy schema');
  if(explicitSlip&&context.jobKind!=='CHAT'&&[...raw.matchAll(status)].length<=1)result.candidates=[{data,bounds:{x:0,y:0,width:context.width,height:context.height},cropDataUrl:'',ocrTextBoxes:[]}];
  return result;
}
export function mapTyphoonOutput(envelope,context){
  const choice=envelope?.choices?.[0];
  if(!choice||choice.finish_reason!=='stop')fail('OCR_INCOMPLETE_RESPONSE','Incomplete Typhoon response');
  const content=choice.message?.content;if(typeof content!=='string')fail('OCR_INVALID_RESPONSE','Missing Typhoon content');
  let value=content;try{value=JSON.parse(content.replace(/^```(?:json)?\s*/iu,'').replace(/\s*```$/u,''));}catch{/* Native Markdown/text. */}
  if(Array.isArray(value?.slips)&&Array.isArray(value?.pageLines))return validateGeminiOcrDocument(value,context);
  if(value&&typeof value==='object'&&(value.transaction||Object.hasOwn(value,'amount')))return mapStructuredTyphoon(value,context);
  return mapNative(value,context,'typhoon',false);
}
export function mapTyphoonCandidates(value,context){const mapped=mapTyphoonOutput(value,context);return mapped.candidates??mapped.slips.map(slip=>({...slip,cropDataUrl:''}));}
export function validateMappedOrNormalizedOutput(value,context){
  if(value?.format!==FORMAT)return validateGeminiOcrDocument(value,context);
  if(!['typhoon','openthai-text','openthai-markdown'].includes(value.provider)||typeof value.rawText!=='string'||value.rawText.length>50000||value.sourceDimensions?.width!==context.width||value.sourceDimensions?.height!==context.height||!Array.isArray(value.candidates)||value.candidates.length>1||!Array.isArray(value.pageLines))fail('OCR_INVALID_MAPPING','Invalid mapper envelope');
  const validBounds=b=>b&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=context.width&&b.y+b.height<=context.height;
  for(const line of value.pageLines)if(typeof line.text!=='string'||line.confidence!==0||!validBounds(line.bounds))fail('OCR_INVALID_MAPPING','Invalid native line');
  for(const candidate of value.candidates){
    if(!SlipExtractionSchema.safeParse(candidate.data).success||!validBounds(candidate.bounds)||candidate.data._fallback_meta?.needs_human_review!==true||!candidate.data.warnings.includes('review_required')||Object.values(candidate.data.confidence).some(n=>n!==0)||candidate.data.raw_text[0]!==value.rawText||!Array.isArray(candidate.ocrTextBoxes))fail('OCR_INVALID_MAPPING','Invalid review candidate');
    for(const box of candidate.ocrTextBoxes)if(!validBounds(box.bounds)||box.confidence!==0||box.classification!=='uncertain'||!value.pageLines.some(line=>line.text===box.text&&JSON.stringify(line.bounds)===JSON.stringify(box.bounds)))fail('OCR_INVALID_MAPPING','Invented field coordinates');
  }
  return value;
}
