import crypto from "crypto";
import { NextResponse } from "next/server";
import { SlipExtractionSchema } from "@/schemas/slip.schema";
import { validateTyphoonUpload } from "@/utils/typhoon-ocr-contract.mjs";

/**
 * POST /api/slips/typhoon
 * เรียก OpenTyphoon OCR API (typhoon-ocr-v1.5) ผ่าน HTTP
 * ไม่ต้องติดตั้ง Python — ใช้ REST API โดยตรง
 */

const TYPHOON_BASE_URL = "https://api.opentyphoon.ai/v1";

const SYSTEM_PROMPT = `คุณเป็นระบบ OCR เชี่ยวชาญสลิปโอนเงินธนาคารไทย
อ่านข้อมูลจากภาพและคืนเฉพาะ JSON ตามโครงสร้างนี้:
{
  "document_type": "bank_transfer_slip",
  "bank": { "name": null, "confidence": 0 },
  "transaction": { "date": null, "time": null, "amount": null, "currency": "THB", "fee": null, "reference_no": null, "transaction_id": null, "note": null },
  "sender": { "name": null, "bank": null, "account_no": null },
  "receiver": { "name": null, "bank": null, "account_no": null },
  "confidence": { "date": 0, "time": 0, "amount": 0, "reference_no": 0, "sender_name": 0, "receiver_name": 0, "sender_account": 0, "receiver_account": 0 },
  "raw_text": [],
  "warnings": []
}
กฎ:
1. อ่านเฉพาะข้อมูลที่มองเห็นจริง ห้ามเดา
2. ค่าที่อ่านไม่ได้ให้ใส่ null
3. ปีพุทธศักราชให้ลบ 543 ก่อนใส่ date
4. ส่ง JSON เท่านั้น ห้ามมี Markdown หรือคำอธิบาย`;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File ? fileEntry : null;

    if (!file) {
      return NextResponse.json({ success: false, message: "ไม่พบไฟล์" }, { status: 400 });
    }

    const invalidUpload = validateTyphoonUpload({
      consentHeader: request.headers.get("x-evidence-upload-consent"),
      consentField: formData.get("externalOcrConsent"),
      mimeType: file.type,
      size: file.size,
    });
    if (invalidUpload) {
      return NextResponse.json({ success: false, message: invalidUpload }, { status: 400 });
    }

    const apiKey = process.env.TYPHOON_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { success: false, message: "ไม่พบ TYPHOON_API_KEY ใน .env.local" },
        { status: 500 }
      );
    }

    // แปลงไฟล์เป็น base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const mimeType = file.type || "image/png";

    // เรียก Typhoon OCR API (รูปแบบ OpenAI Vision)
    const payload = {
      model: "typhoon-ocr",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: SYSTEM_PROMPT },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 2048,
      temperature: 0.0,
    };

    const response = await fetch(`${TYPHOON_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `Typhoon OCR error (${response.status}). No fallback was attempted.` },
        { status: 502 }
      );
    }

    const aiResult = await response.json();
    const rawText = aiResult?.choices?.[0]?.message?.content?.trim() || "";

    if (!rawText) {
      return NextResponse.json({ success: false, message: "Typhoon OCR ไม่คืนข้อความ" }, { status: 422 });
    }

    // ทำความสะอาด JSON ที่อาจมี markdown fence
    const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanJson);
    } catch {
      return NextResponse.json({ success: false, message: "ผลลัพธ์จาก Typhoon OCR ไม่ใช่ JSON ที่ถูกต้อง" }, { status: 422 });
    }

    const validated = SlipExtractionSchema.safeParse(parsed);
    if (!validated.success) {
      return NextResponse.json({ success: false, message: "ข้อมูล OCR ไม่ตรงกับโครงสร้างสลิปที่ระบบรองรับ" }, { status: 422 });
    }

    return NextResponse.json({ success: true, sha256, data: validated.data });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return NextResponse.json(
      { success: false, message: timedOut ? "Typhoon OCR หมดเวลารอ (60 วินาที)" : "ส่งคำขอ Typhoon OCR ไม่สำเร็จ" },
      { status: timedOut ? 504 : 502 },
    );
  }
}
