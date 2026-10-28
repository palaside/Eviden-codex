import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { readExportRequest, runEvidenceContentPdfExporter, safeFileStem, verifyPdfProtection } from "@/lib/server/export-process";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const body = await readExportRequest(request);
    if (typeof body.exportPassword !== "string" || body.exportPassword.length > 256) {
      return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return NextResponse.json({ error: "ไม่พบข้อมูลเล่มเนื้อหาสำหรับส่งออก" }, { status: 400 });
    }

    const password = body.exportPassword.trim();
    const payload = body.payload as Record<string, unknown>;
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-content-"));
    const inputPath = path.join(tempDir, "payload.json");
    const outputPath = path.join(tempDir, "evidence-content.pdf");
    await fs.writeFile(inputPath, JSON.stringify(payload), "utf8");
    await runEvidenceContentPdfExporter(inputPath, outputPath, password);
    await verifyPdfProtection(outputPath, password);
    const pdf = await fs.readFile(outputPath);
    const filename = `Evidence_Content_${safeFileStem(payload.caseNumber)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Digital-Evidence-Encrypted": password ? "true" : "false",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ส่งออกเล่มเนื้อหาหลักฐานไม่สำเร็จ";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
