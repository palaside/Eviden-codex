import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runConsistentReviewPacketPdfExporter, safeFileStem, verifyPdfProtection } from "@/lib/server/export-process";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 64 * 1024 * 1024;

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "ข้อมูล review packet เกินขนาด 64 MB" }, { status: 413 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.exportPassword !== "string" || body.exportPassword.length > 256) {
      return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้องหรือยาวเกินกำหนด" }, { status: 400 });
    }
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
      return NextResponse.json({ error: "ไม่พบข้อมูล review packet" }, { status: 400 });
    }
    const payload = body.payload as Record<string, unknown>;
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "ข้อมูล review packet เกินขนาด 64 MB" }, { status: 413 });
    }
    if (payload.schemaVersion !== 1 || typeof payload.caseNumber !== "string"
      || !Array.isArray(payload.pairs) || payload.pairs.length < 1 || payload.pairs.length > 1000
      || !Array.isArray(payload.summaryRows) || payload.summaryRows.length !== payload.pairs.length) {
      return NextResponse.json({ error: "โครงสร้าง review packet ไม่ถูกต้อง" }, { status: 400 });
    }

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-consistent-packet-"));
    const inputPath = path.join(tempDir, "payload.json");
    const outputPath = path.join(tempDir, "consistent-review-packet.pdf");
    await fs.writeFile(inputPath, JSON.stringify(payload), "utf8");
    const password = body.exportPassword.trim();
    await runConsistentReviewPacketPdfExporter(inputPath, outputPath, password);
    await verifyPdfProtection(outputPath, password);
    const pdf = await fs.readFile(outputPath);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Consistent_Review_${safeFileStem(payload.caseNumber)}.pdf"`,
        "Cache-Control": "no-store",
        "X-Digital-Evidence-Encrypted": password ? "true" : "false",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "สร้าง Consistent Review Packet ไม่สำเร็จ";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
