import {GeminiOcrError,validateGeminiOcrDocument} from './gemini-ocr-contract.mjs';

export const GEMINI_REVIEW_FORMAT='digital-evidence.gemini-review.v1';
const MAX_RAW=2_000_000;
const confidenceFields=['date','time','amount','reference_no','sender_name','receiver_name','sender_account','receiver_account'];
const fields={bank:['bank','name'],sender_name:['sender','name'],sender_bank:['sender','bank'],sender_account:['sender','account_no'],
  receiver_name:['receiver','name'],receiver_bank:['receiver','bank'],receiver_account:['receiver','account_no'],
  ...Object.fromEntries(['date','time','amount','fee','reference_no','transaction_id','note'].map(key=>[key,['transaction',key]]))};
const supportedFields=new Set(['bank','sender_name','sender_bank','sender_account','receiver_name','receiver_bank','receiver_account','amount','fee','date_time','reference_no','transaction_id','note']);
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const confidence=value=>Number.isFinite(value)&&value>=0&&value<=1;
const blank=()=>({document_type:'bank_transfer_slip',bank:{name:null,confidence:0},transaction:{date:null,time:null,amount:null,currency:'THB',fee:null,reference_no:null,transaction_id:null,note:null},
  sender:{name:null,bank:null,account_no:null},receiver:{name:null,bank:null,account_no:null},confidence:Object.fromEntries(confidenceFields.map(key=>[key,0])),raw_text:[],warnings:[]});
const reject=(code)=>{throw new GeminiOcrError(code,'Gemini review could not be attached safely');};
const checkText=text=>{
  if(typeof text!=='string')reject('GEMINI_REVIEW_TEXT_MISSING');
  if(text.length>MAX_RAW)reject('GEMINI_RESPONSE_LIMIT');
};

export function assessGeminiOcrDocument(rawDocument,{width,height,rawResponseText}={}){
  if(!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1)reject('GEMINI_SOURCE_MISMATCH');
  const rawText=rawResponseText??JSON.stringify(rawDocument);
  checkText(rawText);
  const issues=[];
  const issue=(path,reason)=>{issues.push({path,reason});};
  function boundsValid(bounds,path,container={x:0,y:0,width,height}){
    if(!isObject(bounds)){issue(path,'missing_bounds');return false;}
    for(const key of ['x','y','width','height']){
      if(!Number.isFinite(bounds[key])||bounds[key]<(key==='width'||key==='height'?1:0)){issue(`${path}.${key}`,'invalid_coordinate');return false;}
    }
    if(bounds.x<container.x||bounds.y<container.y||bounds.x+bounds.width>container.x+container.width||bounds.y+bounds.height>container.y+container.height){issue(path,'outside_source_or_slip');return false;}
    return true;
  }
  function linesOf(lines,path,container,evidence=false){
    if(!Array.isArray(lines)){issue(path,'missing_lines');return [];}
    const limit=evidence?2000:5000;
    if(lines.length>limit)issue(path,`assessment_limit_${limit}_remaining_in_raw`);
    return lines.slice(0,limit).flatMap((line,index)=>{
      const at=`${path}[${index}]`;
      if(!isObject(line)||typeof line.text!=='string'||!line.text.trim()||!confidence(line.confidence)){issue(at,'invalid_text_or_confidence');return [];}
      if(!boundsValid(line.bounds,`${at}.bounds`,container))return [];
      const normalized={text:line.text,confidence:line.confidence,bounds:Object.fromEntries(['x','y','width','height'].map(key=>[key,line.bounds[key]]))};
      if(evidence){
        if(!['slip_evidence','chat_context','uncertain'].includes(line.classification)||!Array.isArray(line.supportsFields)||line.supportsFields.length>14||line.supportsFields.some(key=>!supportedFields.has(key))){issue(at,'invalid_evidence_classification');return [];}
        return [{...normalized,classification:line.classification,supportsFields:[...line.supportsFields]}];
      }
      return [normalized];
    });
  }
  const pageLines=linesOf(rawDocument?.pageLines,'$.pageLines');
  const slips=[],slipAssessments=[];
  const sources=rawDocument?.slips;
  if(!Array.isArray(sources))issue('$.slips','unrecognized_slip_structure');
  if(Array.isArray(sources)&&sources.length>20)issue('$.slips','assessment_limit_20_remaining_in_raw');
  (Array.isArray(sources)?sources.slice(0,20):[]).forEach((source,sourceIndex)=>{
    const at=`$.slips[${sourceIndex}]`;
    const assessment={sourceIndex,candidate:null,fieldAssessments:{},issues:[]};
    const start=issues.length;
    const validSlip=isObject(source)&&boundsValid(source.bounds,`${at}.bounds`);
    const slipBounds=validSlip?Object.fromEntries(['x','y','width','height'].map(key=>[key,source.bounds[key]])):null;
    const data=blank();
    const sourceData=isObject(source?.data)?source.data:{};
    if(sourceData.document_type!=='bank_transfer_slip')issue(`${at}.data.document_type`,'application_metadata_not_provider_text');
    const boxes=validSlip?linesOf(source.ocrTextBoxes,`${at}.ocrTextBoxes`,source.bounds,true):[];
    for(const [field,[group,key]] of Object.entries(fields)){
      const value=sourceData[group]?.[key]??null;
      const path=`${at}.data.${group}.${key}`;
      const entry={value,status:value===null?'unavailable':Array.isArray(value)?'conflict':'unverified',sourcePath:path,bounds:null,confidence:0,reason:'missing_value'};
      if(value!==null){
        const evidenceKey=field==='date'||field==='time'?'date_time':field;
        const evidence=boxes.filter(line=>line.classification==='slip_evidence'&&line.supportsFields.includes(evidenceKey));
        const probe=blank();probe[group][key]=value;
        // Reuse the strict field/date/mask/semantic checks, one field at a time.
        try{
          if(!validSlip)throw new Error('no verified slip bounds');
          validateGeminiOcrDocument({slips:[{data:probe,bounds:slipBounds,ocrTextBoxes:evidence}],pageLines:[]},{width,height});
          data[group][key]=value;
          const modelConfidence=field==='bank'?sourceData.bank?.confidence:sourceData.confidence?.[field];
          const acceptedConfidence=confidence(modelConfidence)?modelConfidence:0;
          if(!confidence(modelConfidence))issue(path,'confidence_missing_or_invalid_not_inferred');
          entry.status='supported';entry.reason='positioned_text_support';entry.confidence=acceptedConfidence;
          // A field may be supported by several lines; do not invent a merged rectangle.
          entry.bounds=evidence.map(line=>line.bounds);
          if(field==='bank')data.bank.confidence=acceptedConfidence;
          if(confidenceFields.includes(field))data.confidence[field]=acceptedConfidence;
        }catch{
          entry.reason=Array.isArray(value)?'conflicting_values':'invalid_value_or_positioned_support';
          issue(path,entry.reason);
        }
      }
      assessment.fieldAssessments[field]=entry;
    }
    assessment.issues=issues.slice(start);
    if(validSlip){
      data.raw_text=boxes.map(line=>line.text);
      // Keep every issue in the trace, not the legacy bounded warnings array.
      data.warnings=['review_required',`${assessment.issues.length} field/evidence issues; see Gemini review trace`];
      // Validate sanitized canonical data before attaching review-only metadata.
      try{validateGeminiOcrDocument({slips:[{data,bounds:slipBounds,ocrTextBoxes:boxes}],pageLines:[]},{width,height});}
      catch(error){
        if(!(error instanceof GeminiOcrError))throw error;
        issue(at,'candidate_not_eligible_for_ledger');
        assessment.issues=issues.slice(start);
        slipAssessments.push(assessment);
        return;
      }
      data._fallback_meta={needs_human_review:true,unclear_fields:Object.entries(assessment.fieldAssessments).filter(([,entry])=>entry.status!=='supported').map(([field])=>field)};
      const candidate={sourceIndex,data,bounds:slipBounds,ocrTextBoxes:boxes};
      assessment.candidate=candidate;slips.push(candidate);
    }
    slipAssessments.push(assessment);
  });
  return {format:GEMINI_REVIEW_FORMAT,rawResponseText:rawText,sourceDimensions:{width,height},pageLines,slips,slipAssessments,issues,reviewStatus:'review_required'};
}

export function validateGeminiReviewOutput(value,context){
  if(value?.format!==GEMINI_REVIEW_FORMAT)return validateGeminiOcrDocument(value,context);
  if(value.sourceDimensions?.width!==context.width||value.sourceDimensions?.height!==context.height)reject('GEMINI_SOURCE_MISMATCH');
  checkText(value.rawResponseText);
  let raw;
  try{raw=JSON.parse(value.rawResponseText);}catch{reject('GEMINI_INVALID_JSON');}
  // Recompute from the immutable provider text rather than trust transported proposals.
  return assessGeminiOcrDocument(raw,{...context,rawResponseText:value.rawResponseText});
}

export function createGeminiReviewTrace(review,sourceIndex){
  return {schemaVersion:'digital-evidence.slip-ocr-trace.v2',sourceDimensions:review.sourceDimensions,
    objectBounds:review.slips.map(slip=>slip.bounds),qrBounds:[],
    attempts:[{id:'gemini-exact-1',scope:'full_page',trigger:'initial',sourceBounds:{x:0,y:0,...review.sourceDimensions},inputDimensions:review.sourceDimensions,scale:1,
      meanConfidence:0,lines:review.pageLines.map((line,index)=>({...line,id:`gemini-line-${index}`,confidence:line.confidence*100}))}],
    regions:[],parserRejectionReasons:review.issues.map(issue=>`${issue.path}: ${issue.reason}`),imageArtifacts:[],geminiReview:review,
    ...(sourceIndex===undefined?{}:{geminiSourceIndex:sourceIndex})};
}

export function mergeGeminiReviewedCandidate(local,proposed){
  const result=structuredClone(proposed);
  const reviewed=Array.isArray(local?.reviewed_fields)?local.reviewed_fields:[];
  for(const field of reviewed){
    const path=fields[field];
    if(!path)continue;
    const [group,key]=path;
    result[group][key]=local[group][key];
    if(confidenceFields.includes(field))result.confidence[field]=0;
    result.warnings.push(`human_review_preserved:${field}`);
  }
  if(reviewed.length)result.reviewed_fields=[...reviewed];
  return result;
}
