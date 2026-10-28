import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runCommand } from "@/lib/server/export-process";
import { resolveExportPython } from "@/utils/export-python-runtime.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const form = await request.formData();
    const pdf = form.get("pdf");
    const password = form.get("exportPassword");
    if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "ไฟล์ PDF ว่างหรือมีขนาดเกิน 100 MB" }, { status: 400 });
    }
    if (password !== null && typeof password !== "string") {
      return NextResponse.json({ error: "รูปแบบรหัสส่งออกไม่ถูกต้อง" }, { status: 400 });
    }
    if (typeof password === "string" && password.length > 256) {
      return NextResponse.json({ error: "รหัสส่งออกยาวเกินกำหนด" }, { status: 400 });
    }

    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ใช่ PDF" }, { status: 400 });
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-slip-scan-"));
    const pdfPath = path.join(tempDir, "evidence.pdf");
    const outputPath = path.join(tempDir, "slip-candidates.json");
    await fs.writeFile(pdfPath, pdfBytes);

    // The app is launched from the repository root. Resolving through `..`
    // pointed at D:\\Project\\skills instead of this source-of-truth repo,
    // causing the post-export PDF scan to fail with HTTP 500.
    const script = path.resolve(process.cwd(), "skills", "Search_Slip", "scripts", "search_slip.py");
    await runCommand(resolveExportPython(), [script, "--api-json-stdin"], {
      stdin: JSON.stringify({ pdf_path: pdfPath, output_path: outputPath, password: typeof password === "string" ? password : "" }),
      timeoutMs: 300_000,
    });
    const scan = JSON.parse(await fs.readFile(outputPath, "utf8")) as { results?: unknown[] };
    if (!Array.isArray(scan.results)) throw new Error("ผลสแกนสลิปมีรูปแบบไม่ถูกต้อง");
    return NextResponse.json({
      schema_version: "1.0",
      match_method: "visual_slip_candidate_with_ocr_review",
      candidate_count: scan.results.length,
      review_only: true,
      results: scan.results,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สแกนหน้าสลิปจาก PDF ไม่สำเร็จ";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
