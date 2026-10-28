import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runSummaryIndexPdfExporter, safeFileStem, verifyPdfProtection } from "@/lib/server/export-process";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const requestBody = await request.json() as Record<string, unknown>;
    const password = requestBody.exportPassword;
    const caseNumber = requestBody.caseNumber;
    const rows = requestBody.rows;
    if (typeof password !== "string" || password.length > 256) {
      return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
    }
    if (typeof caseNumber !== "string" || caseNumber.length > 256) {
      return NextResponse.json({ error: "เลขอ้างอิงเรื่องไม่ถูกต้อง" }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10000 || rows.some((row) => !Array.isArray(row) || row.length !== 10)) {
      return NextResponse.json({ error: "ต้องมีรายการและแต่ละแถวต้องมี 10 คอลัมน์" }, { status: 400 });
    }

    const normalizedPassword = password.trim();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-index-"));
    const inputPath = path.join(tempDir, "payload.json");
    const outputPath = path.join(tempDir, "financial-index.pdf");
    await fs.writeFile(inputPath, JSON.stringify({ caseNumber, rows }), "utf8");
    await runSummaryIndexPdfExporter(inputPath, outputPath, normalizedPassword);
    await verifyPdfProtection(outputPath, normalizedPassword);
    const pdf = await fs.readFile(outputPath);
    const filename = `Digital_Evidence_${safeFileStem(caseNumber)}_Financial_Index.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Digital-Evidence-Encrypted": normalizedPassword ? "true" : "false",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ส่งออกสารบัญการเงิน PDF ไม่สำเร็จ";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
