export const OCR_MODELS = Object.freeze([
  {id:'gemini',label:'Gemini 3.1 Pro (Google)',key:'gemini_key'},
  {id:'typhoon',label:'Typhoon 2 OCR (SCB 10X)',key:'typhoon_key'},
  {id:'openthai-text',label:'OpenThai 2.0 (Text Layer)',key:'openthai_text_key'},
  {id:'openthai-markdown',label:'OpenThai 2.0 (Markdown)',key:'openthai_markdown_key'},
]);
export const PROVIDER_DEFAULTS=Object.freeze({
  gemini:{provider:'google',endpoint:'',model:'gemini-3.1-pro-preview'},
  typhoon:{provider:'typhoon',endpoint:'https://api.opentyphoon.ai/v1/chat/completions',model:'typhoon-ocr'},
  'openthai-text':{provider:'huggingface',endpoint:'',model:'iapp/OpenThai2.0-OCR-Text'},
  'openthai-markdown':{provider:'huggingface',endpoint:'',model:'iapp/OpenThai2.0-OCR-Markdown'},
});
let selectedModel='gemini';
export function selectOcrModel(id) {
  if(!OCR_MODELS.some(model=>model.id===id))throw new Error('Unknown OCR model');
  selectedModel=id;
}
export function getSelectedOcrModel(){return selectedModel;}
export function readProviderKey(id,storage=globalThis.localStorage) {
  const model=OCR_MODELS.find(model=>model.id===id);
  if(!model)throw new Error('Unknown OCR model');
  return (storage?.getItem(model.key) ?? (id==='gemini'?storage?.getItem('digital_evi_gemini_api_key'):id.startsWith('openthai')?storage?.getItem('hf_key'):null) ?? '').trim();
}
const prefix=id=>id.replaceAll('-','_');
export function readProviderConfig(id,storage=globalThis.localStorage) {
  const defaults=PROVIDER_DEFAULTS[id];if(!defaults)throw new Error('Unknown OCR model');
  return {apiKey:readProviderKey(id,storage),...Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,storage?.getItem(`${prefix(id)}_${key}`)??value]))};
}
export function loadProviderSettings(storage=globalThis.localStorage){return Object.fromEntries(OCR_MODELS.map(({id})=>[id,readProviderConfig(id,storage)]));}
function commit(entries,storage){
  if(!storage)throw new Error('Browser storage is unavailable');
  const before=[...entries.map(([key])=>[key,storage.getItem(key)]),['digital_evi_gemini_api_key',storage.getItem('digital_evi_gemini_api_key')]];
  try{for(const [key,value] of entries)storage.setItem(key,String(value??'').trim());storage.removeItem('digital_evi_gemini_api_key');}
  catch{for(const [key,value] of before){try{if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{/* Preserve the original storage error. */}}throw new Error('บันทึก API Vault ไม่สำเร็จ');}
}
export function saveProviderSettings(settings,storage=globalThis.localStorage){
  const entries=OCR_MODELS.flatMap(({id,key})=>[[key,settings[id]?.apiKey],...Object.entries(PROVIDER_DEFAULTS[id]).map(([field,fallback])=>[`${prefix(id)}_${field}`,settings[id]?.[field]??fallback])]);
  commit(entries,storage);
}
export function loadProviderKeys(storage=globalThis.localStorage) {
  return {gemini:readProviderKey('gemini',storage),typhoon:readProviderKey('typhoon',storage),hf:readProviderKey('openthai-text',storage)};
}
export function saveProviderKeys(keys,storage=globalThis.localStorage) {
  const entries=[['gemini_key',keys.gemini],['typhoon_key',keys.typhoon],['hf_key',keys.hf]];
  commit(entries,storage);
}
