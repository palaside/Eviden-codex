import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

const out=path.resolve('For Test Results/multi-provider-vault-20261116');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1662,height:1200}});
const page=await context.newPage();const errors=[];let ocrRequests=0;
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/ocr/**',route=>{ocrRequests++;return route.abort();});
try {
  await page.goto(process.env.E2E_BASE_URL||'http://127.0.0.1:3462/',{waitUntil:'networkidle'});
  const models=page.getByRole('combobox',{name:'โมเดล OCR',exact:true});
  await models.waitFor();assert.equal(await models.locator('option').count(),4);
  const open=()=>page.getByRole('button',{name:'🔑 จัดการ API Key',exact:true}).click();
  await open();const dialog=page.getByRole('dialog',{name:'🔑 Client API Vault'});await dialog.waitFor();
  assert.equal(await dialog.locator('input[type=password]').count(),4);
  await dialog.getByLabel('Gemini 3.1 Pro (Google) API Key',{exact:true}).fill('test-google-not-real');
  await dialog.getByLabel('Typhoon 2 OCR (SCB 10X) API Key',{exact:true}).fill('test-typhoon-not-real');
  await dialog.getByLabel('OpenThai 2.0 (Text Layer) Provider',{exact:true}).selectOption('iapp');
  await dialog.getByLabel('OpenThai 2.0 (Text Layer) API Key',{exact:true}).fill('test-iapp-not-real');
  assert.equal(await dialog.getByLabel('OpenThai 2.0 (Text Layer) Endpoint URL',{exact:true}).inputValue(),'https://api.iapp.co.th/v3/store/ocr/document/layout');
  await dialog.getByLabel('OpenThai 2.0 (Markdown) API Key',{exact:true}).fill('test-hf-not-real');
  await dialog.getByLabel('OpenThai 2.0 (Markdown) Endpoint URL',{exact:true}).fill('https://example.endpoints.huggingface.cloud/');
  await dialog.getByRole('button',{name:'บันทึก',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.reload({waitUntil:'networkidle'});await open();await dialog.waitFor();
  assert.equal(await dialog.getByLabel('Gemini 3.1 Pro (Google) API Key',{exact:true}).inputValue(),'test-google-not-real');
  assert.equal(await dialog.getByLabel('Typhoon 2 OCR (SCB 10X) API Key',{exact:true}).inputValue(),'test-typhoon-not-real');
  assert.equal(await dialog.getByLabel('OpenThai 2.0 (Text Layer) API Key',{exact:true}).inputValue(),'test-iapp-not-real');
  assert.equal(await dialog.getByLabel('OpenThai 2.0 (Text Layer) Provider',{exact:true}).inputValue(),'iapp');
  assert.equal(await dialog.getByLabel('OpenThai 2.0 (Markdown) API Key',{exact:true}).inputValue(),'test-hf-not-real');
  assert.equal(await dialog.getByLabel('OpenThai 2.0 (Markdown) Endpoint URL',{exact:true}).inputValue(),'https://example.endpoints.huggingface.cloud/');
  await page.screenshot({path:path.join(out,'vault-top.png')});
  await dialog.getByLabel('OpenThai 2.0 (Markdown) Endpoint URL',{exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'vault-bottom.png')});
  await dialog.getByLabel('Gemini 3.1 Pro (Google) API Key',{exact:true}).fill('unsaved-test-value');
  await dialog.getByRole('button',{name:'ยกเลิก',exact:true}).click();await open();
  assert.equal(await dialog.getByLabel('Gemini 3.1 Pro (Google) API Key',{exact:true}).inputValue(),'test-google-not-real');
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  for(const id of ['gemini','typhoon','openthai-text','openthai-markdown']){await models.selectOption(id);assert.equal(await models.inputValue(),id);}
  await page.screenshot({path:path.join(out,'workspace.png')});
  assert.deepEqual(errors,[]);assert.equal(ocrRequests,0);
  const report={status:'passed',modelOptions:4,vaultSections:4,saveClosesDialog:true,reloadPreservesSettings:true,cancelDoesNotSave:true,escapeClosesDialog:true,
    separateTextMarkdownProviderAndKeys:true,keysUsed:'dummy values in isolated browser context',ocrRequests,liveProviderCalls:0,pageErrors:errors};
  await writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
