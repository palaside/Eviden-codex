import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { createUpscaledDerivedImage } from "@/utils/upscayl-enhancement.mjs";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, status: "invalid", reviewOnly: true, message: "กรุณาส่งภาพในช่อง image" }, { status: 400 });
    }
    if (!IMAGE_TYPES.has(file.type) || file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, status: "invalid", reviewOnly: true, message: "รองรับ PNG, JPEG, WEBP ขนาดไม่เกิน 20 MB" }, { status: 415 });
    }
    const scaleValue = Number(form.get("scale") || 2);
    const model = String(form.get("model") || "realesrgan-x4plus");
    if (![2, 4].includes(scaleValue) || !/^[a-z0-9_.-]{1,80}$/i.test(model)) {
      return NextResponse.json({ success: false, status: "invalid", reviewOnly: true, message: "scale ต้องเป็น 2 หรือ 4 และ model ต้องเป็นชื่อที่ปลอดภัย" }, { status: 400 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-upscayl-"));
    const sourcePath = path.join(tempDir, "source");
    const outputPath = path.join(tempDir, "derived.png");
    await fs.writeFile(sourcePath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
    const result = await createUpscaledDerivedImage({ sourcePath, outputPath, scale: scaleValue, model });
    if (result.status !== "success") {
      return NextResponse.json({ success: false, ...result, message: "Upscayl ยังไม่พร้อม; คงผลเป็น review-only และไม่แก้ต้นฉบับ" }, { status: 200 });
    }
    const derived = await fs.readFile(outputPath);
    return NextResponse.json({
      success: true,
      status: "success",
      reviewOnly: true,
      metadata: result,
      derivedImage: `data:image/png;base64,${derived.toString("base64")}`,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, status: "failed", reviewOnly: true, message: error instanceof Error ? error.message.slice(0, 500) : "Upscayl enhancement failed" }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
