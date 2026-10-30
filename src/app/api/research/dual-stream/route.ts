import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createArtifactRecord, createResearchRunManifest, evaluateDetectionGate } from "../../../../utils/dual-stream-enhancement.mjs";
import { createFullImageVariants } from "../../../../utils/dual-stream-full-image.mjs";
import { createSlipCropArtifacts, normalizeDetections } from "../../../../utils/dual-stream-slip-crops.mjs";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Full-image 4x variant is bounded to the generators' 64-million-pixel budget.
const MAX_SOURCE_PIXELS = 4_000_000;
const MAX_ARTIFACT_BYTES = 96 * 1024 * 1024;
const IMAGE_TYPES = new Map([["image/png", "png"], ["image/jpeg", "jpeg"], ["image/webp", "webp"]]);
let running = false;
type Detection = { bbox: { x: number; y: number; width: number; height: number }; confidence?: number | null };
type Artifact = ReturnType<typeof createArtifactRecord> & { url: string; variant: string };

class ResearchError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 422) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const failure = (code: string, message: string, status: number) => Response.json({
  success: false, reviewOnly: true, status: "review_required", error: { code, message },
}, { status, headers: { "Cache-Control": "no-store" } });

function normalizedCoordinateSpace(orientation: number | undefined, encodedWidth: number, encodedHeight: number, width: number, height: number) {
  const sourceExifOrientation = orientation && orientation >= 1 && orientation <= 8 ? orientation : 1;
  // Affine pixel-edge coordinates: x' = a*x + c*y + e; y' = b*x + d*y + f.
  const transforms = [
    [1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, encodedWidth, 0],
    [-1, 0, 0, -1, encodedWidth, encodedHeight], [1, 0, 0, -1, 0, encodedHeight],
    [0, 1, 1, 0, 0, 0], [0, 1, -1, 0, encodedHeight, 0],
    [0, -1, -1, 0, encodedHeight, encodedWidth], [0, -1, 1, 0, 0, encodedWidth],
  ];
  const encodedToNormalized = transforms[sourceExifOrientation - 1];
  const [a, b, c, d, e, f] = encodedToNormalized;
  const determinant = a * d - b * c;
  const normalizedToEncoded = [d, -b, -c, a, c * f - d * e, b * e - a * f]
    .map((value) => value === 0 ? 0 : value / determinant);
  return {
    name: "exif-normalized", sourceExifOrientation,
    encodedDimensions: { width: encodedWidth, height: encodedHeight },
    normalizedDimensions: { width, height }, encodedToNormalized, normalizedToEncoded,
  };
}

async function readForm(request: Request) {
  const limit = MAX_UPLOAD_BYTES + 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new ResearchError("UPLOAD_TOO_LARGE", "ไฟล์เกิน 20 MB", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ResearchError("INVALID_MULTIPART", "ต้องส่ง multipart file", 400);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw new ResearchError("UPLOAD_TOO_LARGE", "ไฟล์เกิน 20 MB", 413);
      }
      chunks.push(new Uint8Array(value));
    }
    return await new Response(new Blob(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData();
  } catch (error) {
    if (error instanceof ResearchError) throw error;
    throw new ResearchError("INVALID_MULTIPART", "อ่าน multipart ไม่สำเร็จ", 400);
  } finally { reader.releaseLock(); }
}

async function detectSlips(sourcePath: string): Promise<Detection[]> {
  const root = process.cwd();
  const localPython = path.join(root, "scripts/slip_cv/.venv-slipcv-cuda118/Scripts/python.exe");
  const legacyPython = path.join(root, "digital-evidence/scripts/slip_cv/.venv-slipcv-cuda118/Scripts/python.exe");
  const python = process.env.YOLO_PYTHON || await fs.access(localPython).then(() => localPython, () => legacyPython);
  const model = process.env.YOLO_MODEL || path.join(root, "models/slip-yolov8n.pt");
  // Reuse only the detector: the existing yolo_slip_api CLI also extracts text,
  // so it is deliberately not invoked by this research endpoint.
  const script = `import sys,json,contextlib\nsys.path.insert(0,sys.argv[1])\nwith contextlib.redirect_stdout(sys.stderr):\n from src.modules.slip_locator import SlipLocator\n import cv2\n image=cv2.imread(sys.argv[2])\n if image is None: raise ValueError('invalid image')\n locator=SlipLocator(model_path=sys.argv[3],device=sys.argv[4])\n slips=locator.extract_slips(image,conf_thresh=float(sys.argv[5]))\nprint(json.dumps([{'bbox':{'x':s['bbox']['x1'],'y':s['bbox']['y1'],'width':s['bbox']['x2']-s['bbox']['x1'],'height':s['bbox']['y2']-s['bbox']['y1']},'confidence':s['confidence']} for s in slips]))`;
  const raw = await new Promise<string>((resolve, reject) => {
    execFile(python, ["-c", script, root, sourcePath, model, process.env.YOLO_DEVICE || "0", process.env.YOLO_CONFIDENCE || "0.03"],
      { cwd: root, timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error, stdout) => error ? reject(new ResearchError("DETECTOR_UNAVAILABLE", "ตัวตรวจกรอบสลิปไม่พร้อมหรือหมดเวลา", 503)) : resolve(String(stdout)));
  });
  const detections = JSON.parse(raw);
  if (!Array.isArray(detections) || detections.length > 20) throw new ResearchError("INVALID_DETECTIONS", "ผลตรวจกรอบไม่ถูกต้อง");
  return detections;
}

export async function POST(request: Request) {
  if (running) return failure("RESEARCH_BUSY", "กำลังสร้างภาพวิจัยรายการอื่น กรุณาลองอีกครั้ง", 503);
  running = true;
  let tempDir = "";
  try {
    const form = await readForm(request);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ResearchError("MISSING_FILE", "ต้องส่ง file", 400);
    if (!IMAGE_TYPES.has(file.type) || !/\.(png|jpe?g|webp)$/i.test(file.name)) throw new ResearchError("INVALID_IMAGE_TYPE", "รองรับ PNG, JPEG, WEBP", 415);
    if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new ResearchError("INVALID_IMAGE_SIZE", "ไฟล์ต้องไม่ว่างและไม่เกิน 20 MB", file.size ? 413 : 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const sha256 = digest(bytes);
    const decoder = sharp(bytes, { limitInputPixels: MAX_SOURCE_PIXELS });
    const metadata = await decoder.metadata();
    if (metadata.format !== IMAGE_TYPES.get(file.type) || (metadata.pages || 1) !== 1) throw new ResearchError("INVALID_IMAGE_CONTENT", "ชนิดภาพไม่ตรงกับข้อมูลหรือเป็นภาพเคลื่อนไหว", 415);
    // Apply EXIF once. Generators and detector consume the same normalized
    // raster, while source bytes and their identity remain untouched.
    const { data, info } = await decoder.rotate().toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    if (info.channels !== 4 || width * height > MAX_SOURCE_PIXELS) throw new ResearchError("PIXEL_LIMIT", "ภาพเกินขีดจำกัดพิกเซลสำหรับ research run", 413);
    const coordinateSpace = normalizedCoordinateSpace(metadata.orientation, metadata.width, metadata.height, width, height);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "digital-evidence-research-"));
    const sourcePath = path.join(tempDir, `source.${metadata.format}`);
    await fs.writeFile(sourcePath, bytes, { flag: "wx" });
    const detectorPath = path.join(tempDir, "detector-normalized.png");
    // Encoding raw pixels without metadata prevents a second EXIF rotation in OpenCV.
    await fs.writeFile(detectorPath, await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(), { flag: "wx" });
    const detections = normalizeDetections({ detections: await detectSlips(detectorPath), imageWidth: width, imageHeight: height });
    if (detections.some(({ bbox: b }: Detection) => b.x + b.width > width || b.y + b.height > height)) throw new ResearchError("INVALID_DETECTIONS", "กรอบสลิปอยู่นอกภาพต้นฉบับ");
    const baseManifest = createResearchRunManifest({ sourceFileName: file.name, sourceSha256: sha256, sourceDimensions: { width, height }, expectedSlipCount: 2 });
    const artifacts: Artifact[] = [];
    let artifactBytes = 0;
    const writeErrors: string[] = [];
    const artifactWriter = async ({ bytes: output, artifactName, metadata: record }: { bytes: Uint8Array; artifactName: string; metadata: ReturnType<typeof createArtifactRecord> }) => {
      try {
        artifactBytes += output.length;
        if (artifactBytes > MAX_ARTIFACT_BYTES) throw new Error("artifact byte limit");
        if (digest(output) !== record.artifactSha256) throw new Error("artifact hash mismatch");
        const validated = createArtifactRecord(record);
        const artifact = { ...validated, variant: artifactName, url: `data:${validated.artifactType === "original_reference" ? file.type : "image/png"};base64,${Buffer.from(output).toString("base64")}` };
        artifacts.push(artifact);
        return artifact;
      } catch (error) { writeErrors.push(artifactName); throw error; }
    };
    const source = { fileName: file.name, bytes, width, height, pixelBuffer: new Uint8ClampedArray(data) };
    const streamA = await createFullImageVariants({ source, sourceSha256: sha256, width, height, pixelBuffer: source.pixelBuffer, artifactWriter });
    const streamB = await createSlipCropArtifacts({ source, sourceSha256: sha256, detections, artifactWriter });
    if (streamA.status !== "success" || streamB.errors.length || writeErrors.length) throw new ResearchError("GENERATOR_FAILED", "สร้างภาพวิจัยไม่ครบ กรุณาตรวจทานและลองใหม่", 500);
    if (digest(await fs.readFile(sourcePath)) !== sha256) throw new ResearchError("SOURCE_CHANGED", "source hash เปลี่ยนระหว่างประมวลผล", 500);
    const manifest = {
      ...baseManifest,
      coordinateSpace,
      streamA: { artifacts: streamA.artifacts, detections: [] },
      streamB: { detections, slips: streamB.slips },
      detectionResult: evaluateDetectionGate({ expectedSlipCount: 2, detectedCount: detections.length }),
      enhancementResult: { status: "success" },
    };
    console.info("[dual-stream]", JSON.stringify({ sourceSha256: sha256, detections: detections.length, artifacts: artifacts.length, reviewOnly: true }));
    return Response.json({ success: true, manifest, artifacts, reviewOnly: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Sharp enforces its limit before returning metadata or pixels, so the
    // explicit dimension check above cannot classify this rejection itself.
    const failureError = error instanceof Error && /Input image exceeds pixel limit/i.test(error.message)
      ? new ResearchError("PIXEL_LIMIT", "ภาพเกินขีดจำกัดพิกเซลสำหรับ research run", 413) : error;
    const known = failureError instanceof ResearchError;
    console.warn("[dual-stream]", known ? failureError.code : "GENERATION_FAILED");
    return failure(known ? failureError.code : "GENERATION_FAILED", known ? failureError.message : "สร้างผลวิจัยไม่ได้ ต้นฉบับยังคงเดิมและต้องตรวจทาน", known ? failureError.status : 500);
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => console.warn("[dual-stream] TEMP_CLEANUP_FAILED"));
    running = false;
  }
}
