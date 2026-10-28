import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runCommand } from "@/lib/server/export-process";
import { resolveExportPython } from "@/utils/export-python-runtime.mjs";

export const runtime = "nodejs";

type PageDescriptor = { key: string; source_file: string; page_label: string; occurrence_index?: number };

function parseDescriptors(value: FormDataEntryValue | null): PageDescriptor[] {
  if (typeof value !== "string" || value.length > 5_000_000) throw new Error("ข้อมูลอ้างอิงหน้า PDF ไม่ถูกต้อง");
  const descriptors: unknown = JSON.parse(value);
  if (!Array.isArray(descriptors) || descriptors.length > 10_000) throw new Error("จำนวนหน้าอ้างอิงเกินกำหนด");
  for (const descriptor of descriptors) {
    if (!descriptor || typeof descriptor !== "object") throw new Error("รูปแบบหน้าอ้างอิงไม่ถูกต้อง");
    const item = descriptor as Record<string, unknown>;
    if (["key", "source_file", "page_label"].some((key) => typeof item[key] !== "string" || item[key].length > 512)) {
      throw new Error("ข้อมูลหน้าอ้างอิงไม่ถูกต้อง");
    }
    if ("occurrence_index" in item && (!Number.isInteger(item.occurrence_index) || Number(item.occurrence_index) < 0)) {
      throw new Error("ลำดับภาพซ้ำในหน้าอ้างอิงไม่ถูกต้อง");
    }
  }
  return descriptors as PageDescriptor[];
}

export async function POST(request: Request) {
  let tempDir = "";
  try {
    const form = await request.formData();
    const pdf = form.get("pdf");
    if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > 100 * 1024 * 1024) {
      return NextResponse.json({ error: "ไฟล์ PDF ว่างหรือมีขนาดเกิน 100 MB" }, { status: 400 });
    }
    const descriptors = parseDescriptors(form.get("descriptors"));
    const password = form.get("exportPassword");
    if (password !== null && typeof password !== "string") throw new Error("รูปแบบรหัสส่งออกไม่ถูกต้อง");
    if (typeof password === "string" && password.length > 256) throw new Error("รหัสส่งออกยาวเกินกำหนด");

    const pdfBytes = Buffer.from(await pdf.arrayBuffer());
    if (pdfBytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return NextResponse.json({ error: "ข้อมูลที่ส่งมาไม่ใช่ PDF" }, { status: 400 });
    }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-page-map-"));
    const pdfPath = path.join(tempDir, "evidence.pdf");
    await fs.writeFile(pdfPath, pdfBytes);
    const script = path.join(process.cwd(), "scripts", "pdf_evidence_page_map.py");
    const result = await runCommand(resolveExportPython(), [script, "--pdf", pdfPath], {
      stdin: JSON.stringify({ password: typeof password === "string" ? password : "", descriptors }),
      timeoutMs: 120_000,
    });
    const mapping = JSON.parse(result.stdout) as { schema_version: string; page_count: number; match_method: string; mappings: unknown[] };
    return NextResponse.json(mapping, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "จัดทำดัชนีหน้า PDF ไม่สำเร็จ";
    return NextResponse.json({ error: message.slice(0, 500) }, { status: 500 });
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
