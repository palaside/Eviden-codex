import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { summarizeBatchCheckpoint } from "@/lib/server/batch500-status.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const checkpointPath = path.join(process.cwd(), "For Test Results", "batch500-resumable-head4a3-20261105", "checkpoint.json");

export async function GET() {
  try {
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    return NextResponse.json(summarizeBatchCheckpoint(checkpoint), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ state: "idle", message: "ยังไม่มี batch 500 ที่กำลังติดตาม" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ state: "unavailable", message: "อ่านสถานะ batch 500 ไม่สำเร็จ" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
