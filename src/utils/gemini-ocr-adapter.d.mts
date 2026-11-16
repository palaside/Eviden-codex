import type {OcrAdapter} from './ocr-adapter';

export interface GeminiTransportError {
  code:string; message:string; status:number|null; retryable:boolean; reviewStatus:'review_required';
}
export type GeminiImageTransport=(image:Blob,context:{width:number;height:number;consent:true;jobKind?:'SLIP'|'CHAT'})=>Promise<
  {ok:true;value:unknown}|{ok:false;error:GeminiTransportError}
>;
export function createGeminiOcrAdapter(options?:{
  transcribeImage?:GeminiImageTransport;
  consent?:boolean;
  id?:string;
  providerLabel?:string;
  validateOutput?:(value:unknown,context:{width:number;height:number})=>unknown;
  cropImage?:(canvas:HTMLCanvasElement,bounds:{x:number;y:number;width:number;height:number})=>string|Promise<string>;
}):OcrAdapter;
