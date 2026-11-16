// Server-only transport. Never import this module into a client component.
import {Buffer} from 'node:buffer';
import {GEMINI_OCR_MODEL,EXACT_TRANSCRIPTION_PROMPT,GEMINI_OCR_RESPONSE_SCHEMA,GeminiOcrError,validateGeminiOcrDocument} from './gemini-ocr-contract.mjs';

export function createGeminiImageTransport({apiKey,fetchImpl=globalThis.fetch,timeoutMs=90000}={}) {
  return async function transcribeImage(image,context={}) {
    let timeout;
    try {
      if(typeof window!=='undefined')throw new GeminiOcrError('GEMINI_SERVER_ONLY','Gemini credentials must remain on the server');
      if(!apiKey||typeof apiKey!=='string')throw new GeminiOcrError('GEMINI_NOT_CONFIGURED','Gemini API key is not configured');
      if(context.consent!==true)throw new GeminiOcrError('GEMINI_CONSENT_REQUIRED','Explicit permission to transmit this image is required');
      if(!(image instanceof Blob)||!['image/png','image/jpeg','image/webp'].includes(image.type)||!image.size||image.size>10*1024*1024)
        throw new GeminiOcrError('GEMINI_INVALID_IMAGE','Expected PNG/JPEG/WEBP Blob between 1 byte and 10 MB');
      if(!Number.isSafeInteger(context.width)||!Number.isSafeInteger(context.height)||context.width<1||context.height<1)
        throw new GeminiOcrError('GEMINI_INVALID_IMAGE','Source dimensions must be positive integers');
      const bytes=new Uint8Array(await image.arrayBuffer());
      const signatureValid=image.type==='image/png'?bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10'
        :image.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255
          :Buffer.from(bytes.slice(0,4)).toString()==='RIFF'&&Buffer.from(bytes.slice(8,12)).toString()==='WEBP';
      if(!signatureValid)throw new GeminiOcrError('GEMINI_INVALID_IMAGE','Image signature does not match its MIME type');
      const controller=new AbortController();
      timeout=setTimeout(()=>controller.abort(),Number.isFinite(timeoutMs)&&timeoutMs>0?timeoutMs:90000);
      const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_OCR_MODEL}:generateContent`,{
        method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:controller.signal,cache:'no-store',
        body:JSON.stringify({systemInstruction:{parts:[{text:EXACT_TRANSCRIPTION_PROMPT}]},
          contents:[{role:'user',parts:[{text:`Source dimensions: ${context.width} x ${context.height} pixels. Return exact OCR only.`},
            {inlineData:{mimeType:image.type,data:Buffer.from(bytes).toString('base64')}}]}],
          // Gemini 3 guidance recommends its default temperature; 0 does not guarantee exact OCR.
          generationConfig:{responseMimeType:'application/json',responseSchema:GEMINI_OCR_RESPONSE_SCHEMA,maxOutputTokens:32768}}),
      });
      if(!response.ok)throw new GeminiOcrError(response.status===429?'GEMINI_QUOTA_EXCEEDED':'GEMINI_HTTP_ERROR',
        response.status===429?'Gemini quota exceeded; request stopped without retry':'Gemini request failed',
        {status:response.status,retryable:response.status>=500});
      let envelope;
      try{envelope=await response.json();}catch{throw new GeminiOcrError('GEMINI_INVALID_JSON','Gemini returned an invalid response envelope');}
      if(envelope.promptFeedback?.blockReason)throw new GeminiOcrError('GEMINI_BLOCKED','Gemini blocked this request; no extraction returned');
      const candidate=envelope.candidates?.[0];
      if(!candidate||candidate.finishReason!=='STOP')throw new GeminiOcrError('GEMINI_INCOMPLETE_RESPONSE','Gemini response is missing, blocked or incomplete');
      const text=(candidate.content?.parts||[]).filter(part=>part.thought!==true&&typeof part.text==='string').map(part=>part.text).join('');
      let document;
      try{document=JSON.parse(text);}catch{throw new GeminiOcrError('GEMINI_INVALID_JSON','Gemini returned invalid OCR JSON');}
      return {ok:true,value:validateGeminiOcrDocument(document,context)};
    } catch(error) {
      const safe=error instanceof GeminiOcrError?error
        :['AbortError','TimeoutError'].includes(error?.name)?new GeminiOcrError('GEMINI_TIMEOUT','Gemini request timed out; no automatic retry')
          :new GeminiOcrError('GEMINI_NETWORK_ERROR','Gemini transport failed; response was not accepted',{retryable:true});
      return {ok:false,error:safe.toJSON()};
    } finally {if(timeout)clearTimeout(timeout);}
  };
}
