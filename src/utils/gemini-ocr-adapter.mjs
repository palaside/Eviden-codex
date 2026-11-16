import {createOcrAdapter} from './ocr-adapter-core.mjs';
import {GeminiOcrError,validateGeminiOcrDocument} from './gemini-ocr-contract.mjs';
import {segmentOcrTextLines} from './two-layer-segmentation.mjs';
import {findChatEventTimestamp} from './chat-capture-metadata.mjs';

const canvasBlob=canvas=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new GeminiOcrError('GEMINI_INVALID_IMAGE','Cannot encode source canvas')),'image/png'));
function cropCanvas(canvas,bounds){
  const crop=document.createElement('canvas');
  crop.width=Math.ceil(bounds.width);crop.height=Math.ceil(bounds.height);
  const context=crop.getContext('2d');
  if(!context)throw new GeminiOcrError('GEMINI_IMAGE_ERROR','Cannot create evidence crop');
  context.drawImage(canvas,bounds.x,bounds.y,bounds.width,bounds.height,0,0,crop.width,crop.height);
  return crop.toDataURL('image/png');
}
export function createGeminiOcrAdapter({transcribeImage,consent=false,cropImage=cropCanvas,id='gemini-3.1-pro',providerLabel='Gemini',validateOutput=validateGeminiOcrDocument}={}) {
  const cache=new WeakMap();
  const ensureConfigured=()=>{
    if(typeof transcribeImage!=='function')throw new GeminiOcrError('OCR_ADAPTER_NOT_CONFIGURED','Gemini adapter needs a server-side transport bridge');
    if(consent!==true)throw new GeminiOcrError('GEMINI_CONSENT_REQUIRED','Explicit permission to transmit images is required');
  };
  async function request(image,size){
    ensureConfigured();
    let result;
    try{result=await transcribeImage(image,{...size,consent:true});}
    catch{throw new GeminiOcrError('GEMINI_TRANSPORT_ERROR','Gemini bridge failed; no extraction returned');}
    if(!result?.ok){const e=result?.error;throw new GeminiOcrError(e?.code||'GEMINI_TRANSPORT_ERROR',e?.message||'Gemini bridge returned no result',{status:e?.status??null,retryable:e?.retryable===true});}
    return validateOutput(result.value,size);
  }
  return createOcrAdapter({
    id,
    async extractSlipCandidates(canvas,qrCandidates=[],_workerSlot=0,options={}) {
      void _workerSlot;
      ensureConfigured();
      cache.delete(canvas);
      const size={width:canvas.width,height:canvas.height};
      const response=await request(await canvasBlob(canvas),{...size,jobKind:options.jobKind});
      const mapped=response.format==='digital-evidence.mapped-ocr.v1';
      const slips=mapped?response.candidates:response.slips;
      const trace={schemaVersion:'digital-evidence.slip-ocr-trace.v2',sourceDimensions:size,objectBounds:mapped?[]:slips.map(s=>s.bounds),
        qrBounds:qrCandidates.map(q=>q.bounds),attempts:[{id:`${id}-exact-1`,scope:'full_page',trigger:'initial',
          sourceBounds:{x:0,y:0,...size},inputDimensions:size,scale:1,
          meanConfidence:response.pageLines.length?response.pageLines.reduce((sum,l)=>sum+l.confidence*100,0)/response.pageLines.length:0,
          lines:response.pageLines.map((line,index)=>({id:`gemini-line-${index}`,text:line.text,confidence:line.confidence*100,bounds:line.bounds}))}],
        regions:slips.map(s=>({bounds:s.bounds,amount:s.data.transaction.amount,senderName:s.data.sender.name,receiverName:s.data.receiver.name,
          reference:s.data.transaction.reference_no,visualCropEvidence:!mapped,acceptedByCandidatePolicy:!mapped,reason:mapped?'Input image extent only; not a detected slip boundary or verified field region':`${providerLabel} transcription candidate; human review required`})),
        parserRejectionReasons:mapped?response.warnings:[],imageArtifacts:[]};
      const candidates=await Promise.all(slips.map(async slip=>({data:{...slip.data,warnings:[...slip.data.warnings,`${mapped?response.provider:providerLabel} ${mapped?'heuristic mapping':'exact-transcription candidate'} — review_required; confidence is not proof of correctness`]},
        bounds:slip.bounds,cropDataUrl:await cropImage(canvas,slip.bounds),ocrTextBoxes:slip.ocrTextBoxes,ocrDiagnosticTrace:trace})));
      const allLines=[...response.pageLines,...slips.flatMap(s=>s.ocrTextBoxes)];
      const unique=[...new Map(allLines.map(line=>[JSON.stringify([line.text,line.bounds]),line])).values()];
      cache.set(canvas,{...segmentOcrTextLines(unique,size),warnings:[`${providerLabel} OCR requires human review`],maskCoverage:null,colorMaskCoverage:null,ocrDiagnosticTrace:trace});
      options.onRetryDiagnostic?.(`${providerLabel} OCR completed — review_required`);
      return candidates;
    },
    async readChatPreflight(file){
      ensureConfigured();
      const bitmap=await createImageBitmap(file);
      try{const response=await request(file,{width:bitmap.width,height:bitmap.height,jobKind:'CHAT'});
        return {lines:response.pageLines,eventTime:findChatEventTimestamp(response.pageLines)};
      }finally{bitmap.close();}
    },
    getCachedChatEvidenceLayers(canvas){return cache.get(canvas)||null;},
  });
}
