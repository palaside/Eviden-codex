import {matchLegalSignalsInText} from './legal-signal-matcher.mjs';
const cache=new Map();
const recordCache=new WeakMap();
/** Match the complete Memo; bounded cache avoids repeated full scans on render. */
export function evaluateLegalSignals(text) {
  if(typeof text!=='string'||!text)return [];
  if(text.length>50000)throw new Error('Memo exceeds 50,000 characters');
  if(cache.has(text))return cache.get(text);
  const matches=matchLegalSignalsInText(text);
  if(cache.size>=16)cache.delete(cache.keys().next().value);
  cache.set(text,matches);return matches;
}
export function buildMemoLegalSignalHits(records){
  return records.flatMap(record=>{
    const text=record.data?.transaction?.note;if(!text)return [];
    let cached=recordCache.get(record.data);
    if(!cached||cached.text!==text){cached={text,matches:evaluateLegalSignals(text)};recordCache.set(record.data,cached);}
    return cached.matches.map((match,index)=>({
      id:`${record.id}-memo-${index}-${match.provisionId}`,sourceItemId:record.sourceItemId,sourceFileName:record.source,
      page:Number.parseInt(record.chatPage,10)||1,text,confidence:0,bounds:null,
      provisionId:match.provisionId,lawId:match.lawId,phrase:match.phrase,sourceKind:`${match.sourceKind}:memo_raw_ocr`,
      sourceSha256:record.sha256||null,sourceUrl:match.sourceUrl||null,sourceStatus:match.sourceStatus||null,
      sourceVersion:match.sourceVersion||null,locator:match.locator||null,reviewStatus:'human_review_required',legalDecision:false,
      missingEvidence:match.missingEvidence,counterIndicators:match.counterIndicators,
    }));
  });
}
