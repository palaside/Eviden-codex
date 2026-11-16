import {createGeminiImageTransport} from './gemini-ocr-api.server.mjs';

export function createGeminiBridgeHandler({transcribeImage} = {}) {
  return async function POST(request) {
    const failure=(code,message,status)=>Response.json({ok:false,error:{code,message,status,retryable:false,reviewStatus:'review_required'}},{status,headers:{'Cache-Control':'no-store'}});
    try {
      // This browser bridge accepts only same-origin requests, never cross-origin uploads.
      const origin=request.headers.get('origin');
      const requestUrl=new URL(request.url);
      // Next can normalize 127.0.0.1 to localhost internally. Accept only the
      // actual loopback Host at the same protocol and port, never forwarded hosts.
      const host=request.headers.get('host');
      const loopback=['localhost','127.0.0.1','[::1]'];
      let loopbackOrigin;
      if(host && loopback.includes(requestUrl.hostname)){
        const publicUrl=new URL(`${requestUrl.protocol}//${host}`);
        if(loopback.includes(publicUrl.hostname) && publicUrl.port===requestUrl.port && publicUrl.host===host)loopbackOrigin=publicUrl.origin;
      }
      if (origin && origin !== requestUrl.origin && origin !== loopbackOrigin) return failure('GEMINI_BRIDGE_ORIGIN','Cross-origin upload rejected',403);
      const apiKey=request.headers.get('x-api-key')?.trim();
      if(!apiKey)return failure('GEMINI_NOT_CONFIGURED','โปรดกรอก API Key ก่อนสกัดรายละเอียด',401);
      if(apiKey.length>4096 || !/^[\x21-\x7E]+$/.test(apiKey))return failure('GEMINI_INVALID_API_KEY','รูปแบบ API Key ไม่ถูกต้อง',400);
      const length=Number(request.headers.get('content-length'));
      if(length>11*1024*1024)return failure('GEMINI_INVALID_IMAGE','Image upload exceeds bridge limit',413);
      const form=await request.formData();
      const image=form.get('image');
      const width=Number(form.get('width')),height=Number(form.get('height'));
      if(!(image instanceof Blob)||image.size>10*1024*1024||!image.size||!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1)
        return failure('GEMINI_INVALID_IMAGE','Expected image and positive source dimensions',400);
      console.info('[Gemini OCR bridge] เริ่มประมวลผลภาพ');
      const transport=transcribeImage || createGeminiImageTransport({apiKey});
      const result=await transport(image,{width,height,consent:true});
      const status=result.ok?200:result.error.code==='GEMINI_NOT_CONFIGURED'?503:result.error.status===429?429:result.error.code==='GEMINI_INVALID_IMAGE'?400:502;
      console.info('[Gemini OCR bridge] จบคำขอ',status);
      return Response.json(result,{status,headers:{'Cache-Control':'no-store'}});
    } catch {
      return failure('GEMINI_BRIDGE_ERROR','Cannot process Gemini bridge request',400);
    }
  };
}
