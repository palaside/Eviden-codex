import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3461/";
const executablePath = process.env.E2E_EXECUTABLE_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1822, height: 1547 } });

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });

  const timelineButton = page.getByRole("button", { name: /Timeline/ });
  await timelineButton.waitFor();

  const heading = page.getByRole("heading", { name: "03 สรุปข้อมูลตรวจสอบ" });
  const cards = page.getByText("1. ยอดรวมรายการที่ยืนยัน (ก่อนตรวจ Ref ซ้ำ)");
  const order = await Promise.all([heading, timelineButton, cards].map((locator) => locator.evaluate((element) => element.getBoundingClientRect().top)));
  assert.ok(order[0] < order[1], "Timeline must be below the section heading");
  assert.ok(order[1] < order[2], "Timeline must be before the four summary cards");

  await timelineButton.click();
  await page.getByRole("heading", { name: "Timeline · ลำดับเหตุการณ์และหลักฐานที่เกี่ยวข้อง" }).waitFor();
  await page.getByText("คำหรือเวลาที่ใกล้กันเป็นเหตุผลให้ตรวจ").waitFor();
  await page.getByRole("button", { name: "ปิดหน้าต่าง" }).click();
  await page.getByRole("heading", { name: "Timeline · ลำดับเหตุการณ์และหลักฐานที่เกี่ยวข้อง" }).waitFor({ state: "hidden" });

  console.log("Timeline modal UI check passed");
} finally {
  await browser.close();
}
