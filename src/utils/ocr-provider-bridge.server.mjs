import {Buffer} from 'node:buffer';
import {EXACT_TRANSCRIPTION_PROMPT,GEMINI_OCR_RESPONSE_SCHEMA} from './gemini-ocr-contract.mjs';
import {PROVIDER_DEFAULTS} from './ocr-provider-vault.mjs';
import {mapTyphoonOutput,mapOpenThaiOutput,validateMappedOrNormalizedOutput} from './ocr-output-mappers.mjs';

export function validateProviderEndpoint(endpoint,service) {
  let url;try{url=new URL(endpoint);}catch{throw new Error('Invalid endpoint');}
  const allowed=service==='typhoon'?url.hostname==='api.opentyphoon.ai':service==='iapp'?url.hostname==='api.iapp.co.th':
    service==='huggingface'&&(url.hostname==='router.huggingface.co'||url.hostname.endsWith('.endpoints.huggingface.cloud'));
  if(!allowed||url.protocol!=='https:'||(url.port&&url.port!=='443')||url.username||url.password||url.search||url.hash)throw new Error('Endpoint does not match provider');
  return url.href;
}

export function createProviderBridgeHandler(provider,{fetchImpl=(...args)=>globalThis.fetch(...args)}={}) {
  return async function POST(request) {
    const fail=(code,message,status)=>Response.json({ok:false,error:{code,message,status,retryable:false,reviewStatus:'review_required'}},{status,headers:{'Cache-Control':'no-store'}});
    try {
      const origin=request.headers.get('origin');
      if(origin&&origin!==new URL(request.url).origin)return fail('OCR_BRIDGE_ORIGIN','Cross-origin upload rejected',403);
      const apiKey=request.headers.get('x-api-key')?.trim();
      if(!apiKey)return fail('GEMINI_NOT_CONFIGURED','โปรดกรอก API Key ก่อนสกัดรายละเอียด',401);
      if(!PROVIDER_DEFAULTS[provider]||provider==='gemini')return fail('OCR_PROVIDER_NOT_CONFIGURED','Unknown OCR provider',400);
      if(Number(request.headers.get('content-length'))>11*1024*1024)return fail('OCR_INVALID_IMAGE','Image too large',413);
      const form=await request.formData();const image=form.get('image');
      const defaults=PROVIDER_DEFAULTS[provider];
      const service=provider==='typhoon'?'typhoon':String(form.get('provider')||defaults.provider);
      const endpoint=String(form.get('endpoint')??defaults.endpoint).trim();
      const model=String(form.get('model')||defaults.model).trim();
      if(!endpoint)return fail('OCR_PROVIDER_NOT_CONFIGURED','โปรดระบุ inference endpoint ที่ใช้งานได้',503);
      let target;try{target=validateProviderEndpoint(endpoint,service);}catch{return fail('OCR_INVALID_ENDPOINT','Endpoint ต้องเป็น HTTPS ของ Provider ที่เลือกและไม่มีคีย์ใน URL',400);}
      const width=Number(form.get('width')),height=Number(form.get('height'));
      if(!(image instanceof Blob)||!['image/png','image/jpeg'].includes(image.type)||image.size<1||image.size>10*1024*1024||!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1)
        return fail('OCR_INVALID_IMAGE','Expected PNG/JPEG and positive dimensions',400);
      const bytes=Buffer.from(await image.arrayBuffer());
      const validSignature=image.type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      if(!validSignature)return fail('OCR_INVALID_IMAGE','Invalid image signature',400);
      let requestBody,headers;
      if(service==='iapp'){
        requestBody=new FormData();requestBody.set('file',image,image.type==='image/jpeg'?'evidence.jpg':'evidence.png');headers={apikey:apiKey};
      }else if(service==='huggingface'){
        requestBody=image;headers={Authorization:`Bearer ${apiKey}`,'Content-Type':image.type};
      }else{
        headers={'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`};
        requestBody=JSON.stringify({model,temperature:0,max_tokens:8192,messages:[{role:'system',content:EXACT_TRANSCRIPTION_PROMPT},{role:'user',content:[
          {type:'text',text:`Source dimensions: ${width} x ${height}. Return exactly one JSON object matching this schema, without explanations: ${JSON.stringify(GEMINI_OCR_RESPONSE_SCHEMA)}`},
          {type:'image_url',image_url:{url:`data:${image.type};base64,${bytes.toString('base64')}`}},
        ]}]});
      }
      const response=await fetchImpl(target,{
        method:'POST',headers,signal:AbortSignal.timeout(90_000),cache:'no-store',redirect:'manual',body:requestBody,
      });
      if(!response.ok)return fail(response.status===429?'GEMINI_QUOTA_EXCEEDED':'OCR_PROVIDER_ERROR','Provider request failed',response.status===429?429:502);
      const envelope=await response.json();
      const context={width,height,jobKind:form.get('jobKind')==='CHAT'?'CHAT':'SLIP'};
      const value=provider==='typhoon'?mapTyphoonOutput(envelope,context):mapOpenThaiOutput(envelope,context,provider);
      validateMappedOrNormalizedOutput(value,context);
      return Response.json({ok:true,value},{headers:{'Cache-Control':'no-store'}});
    }catch(error){return fail(error?.name==='TimeoutError'?'GEMINI_TIMEOUT':error?.code||'OCR_INVALID_RESPONSE',error?.code==='OCR_MEMO_TOO_LONG'?'Raw OCR เกิน 50,000 ตัวอักษร ไม่ได้ตัดข้อความทิ้ง':'OCR response unavailable or invalid; human review required',502);}
  };
}
