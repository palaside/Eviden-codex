import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const MCP_ENDPOINT = "https://app.fourcorners.law/api/mcp";

type TlexContent = { type?: string; text?: string };
type TlexPayload = {
  result?: { content?: TlexContent[]; structuredContent?: { citations?: Record<string, unknown>; answer?: string }; isError?: boolean };
  error?: { message?: string };
};

function parseMcpPayload(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as {
      result?: { content?: TlexContent[]; structuredContent?: unknown; isError?: boolean };
      error?: { message?: string };
    };
  } catch {
    const dataLines = trimmed
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter(Boolean);
    const lastData = dataLines.at(-1);
    if (!lastData) return null;
    try {
      return JSON.parse(lastData) as {
        result?: { content?: TlexContent[]; structuredContent?: unknown; isError?: boolean };
        error?: { message?: string };
      };
    } catch {
      return null;
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query || query.length > 8000) {
      return NextResponse.json({ success: false, message: "ต้องระบุคำถามกฎหมาย 1 ประเด็น ความยาวไม่เกิน 8,000 ตัวอักษร" }, { status: 400 });
    }

    const apiKey = process.env.FourCorner;
    if (!apiKey) {
      return NextResponse.json({ success: false, message: "ไม่พบ FourCorner API key ใน server environment" }, { status: 503 });
    }

    let response: Response | null = null;
    let payload: TlexPayload | null = null;
    let mcpError: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      response = await fetch(MCP_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: randomUUID(),
          method: "tools/call",
          params: { name: "ask_tlex", arguments: { query } },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(90_000),
      });

      payload = parseMcpPayload(await response.text()) as TlexPayload | null;
      mcpError = payload?.error?.message
        || (payload?.result?.isError ? payload.result.content?.map((item) => item.text).filter(Boolean).join("\n") : null)
        || null;
      const transientProcessing = /กำลังประมวลผล|processing|ลองใหม่|try again/i.test(mcpError || "");
      if (!transientProcessing || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    if (!response || !response.ok || payload?.error || payload?.result?.isError || !payload?.result) {
      const quotaExhausted = /ครบ\s*3\s*คำถาม|quota|rate limit|daily limit/i.test(mcpError || "");
      return NextResponse.json({
        success: false,
        message: mcpError || `FourCorners MCP ตอบกลับ ${response?.status ?? "ไม่มีสถานะ"} โดยไม่มีผลลัพธ์ที่อ่านได้`,
        provider: "FourCorners T-LEX",
        provider_status: response?.status ?? null,
        quota_exceeded: quotaExhausted,
        retryable: !quotaExhausted,
      }, { status: quotaExhausted ? 429 : 502, headers: { "Cache-Control": "no-store" } });
    }

    const text = (payload?.result?.content || [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim();

    return NextResponse.json({
      success: true,
      reviewOnly: true,
      legalDecision: false,
      query,
      answer: text || payload.result.structuredContent?.answer || "",
      citations: payload.result.structuredContent?.citations ?? {},
      structuredContent: payload?.result?.structuredContent ?? null,
      source: "FourCorners T-LEX",
      retrievedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === "TimeoutError"
      ? "FourCorners MCP ใช้เวลานานเกิน 90 วินาที; ยังไม่สรุปผลและให้ลองใหม่ภายหลัง"
      : error instanceof Error ? error.message : "เรียก FourCorners MCP ไม่สำเร็จ";
    return NextResponse.json({
      success: false,
      message,
    }, { status: 504, headers: { "Cache-Control": "no-store" } });
  }
}
