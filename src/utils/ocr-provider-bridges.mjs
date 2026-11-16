import {createGeminiBridgeClient,fetchFromGeminiBridge} from './gemini-ocr-bridge-client.mjs';
import {readProviderKey,readProviderConfig,getSelectedOcrModel} from './ocr-provider-vault.mjs';
import {validateMappedOrNormalizedOutput} from './ocr-output-mappers.mjs';

export const fetchFromTyphoonBridge=createGeminiBridgeClient({endpoint:'/api/ocr/typhoon',getApiKey:()=>readProviderKey('typhoon'),getConfig:()=>readProviderConfig('typhoon'),providerLabel:'Typhoon',validateOutput:validateMappedOrNormalizedOutput});
export const fetchFromOpenThaiTextBridge=createGeminiBridgeClient({endpoint:'/api/ocr/openthai-text',getApiKey:()=>readProviderKey('openthai-text'),getConfig:()=>readProviderConfig('openthai-text'),providerLabel:'OpenThai Text',validateOutput:validateMappedOrNormalizedOutput});
export const fetchFromOpenThaiMarkdownBridge=createGeminiBridgeClient({endpoint:'/api/ocr/openthai-markdown',getApiKey:()=>readProviderKey('openthai-markdown'),getConfig:()=>readProviderConfig('openthai-markdown'),providerLabel:'OpenThai Markdown',validateOutput:validateMappedOrNormalizedOutput});
const bridges={gemini:fetchFromGeminiBridge,typhoon:fetchFromTyphoonBridge,'openthai-text':fetchFromOpenThaiTextBridge,'openthai-markdown':fetchFromOpenThaiMarkdownBridge};
export function fetchFromSelectedOcrBridge(image,context){return bridges[getSelectedOcrModel()](image,context);}
