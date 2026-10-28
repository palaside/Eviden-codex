import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runDerivedImagePdfExporter, safeFileStem } from "@/lib/server/export-process";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "ไฟล์ภาพมีขนาดเกิน 20 MB" }, { status: 413 });
    }

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "กรุณาส่งภาพต้นฉบับที่ต้องการสร้างภาพอนุพันธ์" }, { status: 400 });
    }
    const extension = path.extname(file.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension) || (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type))) {
      return NextResponse.json({ error: "รองรับเฉพาะ PNG, JPEG และ WEBP" }, { status: 415 });
    }
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "ไฟล์ภาพว่างหรือมีขนาดเกิน 20 MB" }, { status: file.size > MAX_UPLOAD_BYTES ? 413 : 400 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-derived-"));
    const inputPath = path.join(tempDir, `source${extension}`);
    const outputPath = path.join(tempDir, "derived-image-bundle.zip");
    await fs.writeFile(inputPath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
    await runDerivedImagePdfExporter(inputPath, outputPath, file.name.slice(0, 180));
    const bundle = await fs.readFile(outputPath);
    return new Response(new Uint8Array(bundle), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Derived_${safeFileStem(file.name)}.zip"`,
        "Cache-Control": "no-store",
        "X-Digital-Evidence-Artifact": "derived-visualization-only",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้าง PDF อนุพันธ์ไม่สำเร็จ";
    const status = /ไม่พบไฟล์ EDSR model|checksum|dnn_superres|opencv-contrib|ModuleNotFoundError/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message.slice(0, 500) }, { status });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
