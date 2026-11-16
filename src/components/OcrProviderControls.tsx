"use client";

import {useRef,useState} from 'react';
import {OCR_MODELS,loadProviderSettings,saveProviderSettings,selectOcrModel,getSelectedOcrModel,PROVIDER_DEFAULTS} from '@/utils/ocr-provider-vault.mjs';

type ProviderSettings=Record<string,{apiKey:string;provider:string;endpoint:string;model:string}>;
const emptySettings=():ProviderSettings=>Object.fromEntries(OCR_MODELS.map(({id})=>[id,{apiKey:'',...PROVIDER_DEFAULTS[id as keyof typeof PROVIDER_DEFAULTS]}]));

export default function OcrProviderControls({disabled=false}:{disabled?:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [model,setModel]=useState(getSelectedOcrModel);
  const [settings,setSettings]=useState<ProviderSettings>(emptySettings);
  const [error,setError]=useState('');
  function openVault(){
    setError('');
    try{setSettings(loadProviderSettings() as ProviderSettings);}catch{setError('อ่าน API Vault ในเบราว์เซอร์ไม่สำเร็จ');}
    dialog.current?.showModal();
  }
  function closeVault(){dialog.current?.close();setSettings(emptySettings());setError('');}
  function save(){
    try{saveProviderSettings(settings);closeVault();}catch{setError('บันทึก API Vault ไม่สำเร็จ กรุณาตรวจสิทธิ์ localStorage');}
  }
  return <>
    <label className="flex shrink-0 items-center gap-1 whitespace-nowrap">
      <span>OCR</span>
      <select aria-label="โมเดล OCR" value={model} disabled={disabled}
        onChange={event=>{selectOcrModel(event.target.value);setModel(event.target.value);}}
        className="w-48 rounded border border-sky-400/30 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50">
        {OCR_MODELS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
    <button type="button" onClick={openVault} className="shrink-0 whitespace-nowrap rounded border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs text-sky-200 hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-sky-400">🔑 จัดการ API Key</button>
    <dialog ref={dialog} aria-labelledby="ocr-vault-title" onCancel={event=>{event.preventDefault();closeVault();}}
      onClick={event=>{if(event.target===dialog.current)closeVault();}}
      className="fixed inset-0 m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-sky-400/30 bg-slate-950/95 p-0 text-slate-100 shadow-2xl shadow-sky-950/50 backdrop-blur-xl backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="border-b border-white/10 p-5"><div className="flex items-center justify-between gap-4">
        <h2 id="ocr-vault-title" className="text-lg font-semibold text-sky-200">🔑 Client API Vault</h2>
        <button type="button" onClick={closeVault} aria-label="ปิด API Vault" className="rounded px-3 py-2 text-slate-300 hover:bg-white/10">✕</button>
      </div><p className="mt-2 text-xs text-slate-400">เก็บคีย์ใน localStorage ของเบราว์เซอร์นี้ ส่งเฉพาะคีย์ของโมเดลที่เลือก ไม่บันทึกคีย์ฝั่ง server</p></div>
      <form onSubmit={event=>{event.preventDefault();save();}} className="space-y-4 p-5">
        {OCR_MODELS.map(option=><fieldset key={option.id} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <legend className="px-2 text-sm font-semibold text-sky-200">{option.label}</legend>
          <label className="block text-sm">API Key<input type="password" autoComplete="off" spellCheck={false} aria-label={`${option.label} API Key`}
            value={settings[option.id].apiKey} placeholder="วาง API Key ตัวเต็มจากผู้ให้บริการ (ไม่จำกัด prefix)"
            onChange={event=>setSettings(previous=>({...previous,[option.id]:{...previous[option.id],apiKey:event.target.value}}))}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"/></label>
          {option.id.startsWith('openthai')&&<label className="block text-sm">Provider<select aria-label={`${option.label} Provider`} value={settings[option.id].provider}
            onChange={event=>{const provider=event.target.value;setSettings(previous=>({...previous,[option.id]:{...previous[option.id],provider,
              endpoint:provider==='iapp'?`https://api.iapp.co.th/v3/store/ocr/document/${option.id==='openthai-text'?'layout':'markdown'}`:''}}));}}
            className="mt-1 w-full rounded-lg border border-white/15 bg-slate-950 px-3 py-2"><option value="huggingface">Hugging Face</option><option value="iapp">iApp Technology</option></select></label>}
          {option.id!=='gemini'&&<>
            <label className="block text-sm">Model ID<input aria-label={`${option.label} Model ID`} value={settings[option.id].model}
              onChange={event=>setSettings(previous=>({...previous,[option.id]:{...previous[option.id],model:event.target.value}}))}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"/></label>
            <label className="block text-sm">Inference Endpoint URL<input type="url" aria-label={`${option.label} Endpoint URL`} value={settings[option.id].endpoint} placeholder="https://..."
              onChange={event=>setSettings(previous=>({...previous,[option.id]:{...previous[option.id],endpoint:event.target.value}}))}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"/></label>
          </>}
        </fieldset>)}
        {error&&<p role="alert" className="rounded border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        <p className="text-xs text-amber-200/80">Hugging Face ต้องมี inference endpoint ที่เปิดใช้งานจริง ผลที่ไม่มี field/พิกัดตามสัญญาจะรอตรวจ ไม่เดาเป็นข้อมูลสลิป</p>
        <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={closeVault} className="rounded-lg border border-white/15 px-4 py-2 hover:bg-white/10">ยกเลิก</button>
          <button type="submit" className="rounded-lg border border-sky-300/40 bg-sky-500/20 px-4 py-2 font-semibold text-sky-100 hover:bg-sky-500/30">บันทึก</button>
        </div>
      </form>
    </dialog>
  </>;
}
