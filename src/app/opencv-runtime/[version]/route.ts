import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const OPENCV_VERSION = "5.0.0-release.1";

export async function GET(_request: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (version !== OPENCV_VERSION) return new Response("Not found", { status: 404 });

  const source = await readFile(path.join(
    process.cwd(),
    "node_modules",
    "@techstark",
    "opencv-js",
    "dist",
    "opencv.js",
  ));
  return new Response(source, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
