import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {mapOpenThaiOutput} from '../src/utils/ocr-output-mappers.mjs';

const out=path.resolve('For Test Results/output-mappers-step7-20261116');await mkdir(out,{recursive:true});
const raw='กรุงไทย\nโอนเงินสำเร็จ\nรหัสอ้างอิง A785efee8358b4e89\nจาก\nสิบตรีณัฐชัย s***\nไปยัง\nน.ส. จิณห์นิภา ประสาทเขตรการ\nจำนวนเงิน 15,000.00 บาท\nค่าธรรมเนียม 0.00 บาท\nวันที่ทำรายการ 04 เม.ย. 2568 - 16:06\n'+'ข้อความหลักฐานเพื่อทดสอบ Memo ยาว '.repeat(200)+'ฉ้อโกง';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:1662,height:1200},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];let providerResponses=0;
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/ocr/openthai-text',async route=>{
  const request=route.request();const form=await new Request(request.url(),{method:'POST',headers:request.headers(),body:request.postDataBuffer()}).formData();
  const value=mapOpenThaiOutput({text:[raw]},{width:Number(form.get('width')),height:Number(form.get('height')),jobKind:form.get('jobKind')},'openthai-text');
  providerResponses++;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,value})});
});
async function trace(name){const downloading=page.waitForEvent('download');await page.getByRole('button',{name:/ดาวน์โหลด JSON Trace/}).click();const download=await downloading;const target=path.join(out,name);await download.saveAs(target);return JSON.parse(await readFile(target,'utf8'));}
function slipData(value){if(!value||typeof value!=='object')return [];const own=value.document_type==='bank_transfer_slip'?[value]:[];return [...own,...Object.values(value).flatMap(slipData)];}
try{
  await page.goto(process.env.E2E_BASE_URL||'http://127.0.0.1:3462/',{waitUntil:'networkidle'});
  await page.evaluate(()=>{localStorage.setItem('openthai_text_key','dummy-local-only');localStorage.setItem('openthai_text_provider','iapp');localStorage.setItem('openthai_text_endpoint','https://api.iapp.co.th/v3/store/ocr/document/ocr');});
  await page.getByRole('combobox',{name:'โมเดล OCR',exact:true}).selectOption('openthai-text');
  const slipMode=page.getByRole('button',{name:/^SLIP/});if(await slipMode.count())await slipMode.first().click();
  await page.locator('#evidence-file-input').setInputFiles(path.resolve('For Test/Done/A4_IMG_ (1).PNG'));
  await page.getByRole('button',{name:/เริ่มประมวลผลพยานหลักฐาน/}).click();
  await page.waitForFunction(()=>!document.body.innerText.includes('กำลังประมวลผลแบบ Cross-Matching')&&document.body.innerText.includes('สลิปที่ตรวจพบ'),undefined,{timeout:180000});
  const before=await trace('trace.json');const data=slipData(before);
  assert.ok(data.some(item=>item.transaction.note===raw),'Entire raw OCR must reach final JSON Memo');
  assert.ok(data.some(item=>item.sender.name==='สิบตรีณัฐชัย s***'),'Masked sender must survive merge');
  assert.ok(data.some(item=>item.bank.name==='กรุงไทย'),'Unknown QR bank must not hide mapped bank proposal');
  const reviewCandidates=before.items.flatMap(item=>item.candidates||[]).filter(candidate=>candidate.data?.transaction?.note===raw);
  assert.ok(reviewCandidates.length>0);assert.ok(reviewCandidates.every(candidate=>candidate.needsReview===true&&candidate.isConfirmed===false));
  await page.screenshot({path:path.join(out,'workspace.png')});
  const review=page.getByRole('button',{name:/เปิดหน้า Review สลิป/});await review.click();
  const memo=page.getByLabel('ข้อความ Memo',{exact:true});await memo.waitFor();assert.equal(await memo.textContent(),raw);
  const scroll=await memo.evaluate(element=>({scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,overflow:getComputedStyle(element).overflowY}));
  assert.equal(scroll.overflow,'auto');assert.ok(scroll.scrollHeight>scroll.clientHeight);
  await page.screenshot({path:path.join(out,'memo-long.png')});
  await page.keyboard.press('Escape');
  // Close the existing review modal through its own button if Escape is not handled.
  const closeReview=page.getByRole('button',{name:/ปิดหน้า/});if(await closeReview.count())await closeReview.last().click();
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:/ดาวน์โหลด JSON Trace/}).waitFor({timeout:30000});
  const after=await trace('trace-after-reload.json');assert.ok(slipData(after).some(item=>item.transaction.note===raw));
  await page.getByRole('button',{name:/รายการกฎหมายที่อาจเกี่ยวข้อง/}).click();
  await page.getByText(/Memo OCR · ไม่ทราบพิกัดตัวอักษร/).first().waitFor();
  await page.screenshot({path:path.join(out,'memo-legal-signal.png')});
  assert.deepEqual(errors,[]);
  const report={status:'passed',input:'For Test/Done/A4_IMG_ (1).PNG',provider:'OpenThai Text',providerMode:'mocked native response; not live OCR',providerResponses,
    rawMemoCharacters:raw.length,memoFullInUI:true,memoFullInJson:true,memoScrollable:scroll,memoSurvivesReload:true,maskedSenderPreserved:true,legalMemoHitVisible:true,reviewRequired:true,autoConfirmed:false,pageErrors:errors,liveProviderCalls:0};
  await writeFile(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:path.join(out,'failure.png')});await writeFile(path.join(out,'failure.txt'),String(error.stack));throw error;}
finally{await browser.close();}
