import assert from "node:assert/strict";
import test from "node:test";
import { stitchChatImages } from "../stitch-chat-images.ts";

class MockCanvas {
  constructor() {
    this._width = 0;
    this._height = 0;
    this.data = new Uint8ClampedArray();
    this.context = new MockContext(this);
  }
  set width(value) { this._width = value; this.allocate(); }
  get width() { return this._width; }
  set height(value) { this._height = value; this.allocate(); }
  get height() { return this._height; }
  allocate() { this.data = new Uint8ClampedArray(this.width * this.height * 4); }
  getContext() { return this.context; }
}

class MockContext {
  constructor(canvas) { this.canvas = canvas; }
  set imageSmoothingEnabled(_value) {}
  set imageSmoothingQuality(_value) {}
  drawImage(source, ...args) {
    const sourceData = source.data;
    let sx = 0, sy = 0, sw = source.width, sh = source.height;
    let dx = 0, dy = 0, dw = source.width, dh = source.height;
    if (args.length === 4) [dx, dy, dw, dh] = args;
    if (args.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    for (let y = 0; y < dh; y += 1) {
      const outY = Math.floor(dy + y);
      if (outY < 0 || outY >= this.canvas.height) continue;
      const inY = Math.min(source.height - 1, Math.floor(sy + y * sh / dh));
      for (let x = 0; x < dw; x += 1) {
        const outX = Math.floor(dx + x);
        if (outX < 0 || outX >= this.canvas.width) continue;
        const inX = Math.min(source.width - 1, Math.floor(sx + x * sw / dw));
        const from = (inY * source.width + inX) * 4;
        const to = (outY * this.canvas.width + outX) * 4;
        this.canvas.data.set(sourceData.subarray(from, from + 4), to);
      }
    }
  }
  getImageData() { return { data: new Uint8ClampedArray(this.canvas.data) }; }
}

function raster(start, count, width = 807) {
  const data = new Uint8ClampedArray(width * count * 4);
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const absoluteY = start + y;
      let value = Math.imul(Math.floor(absoluteY / 8) + 17, 0x45d9f3b);
      value ^= Math.imul(Math.floor(x / 8) + 31, 0x119de1f3);
      value = (value ^ (value >>> 16)) & 0xff;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height: count, data };
}

test("stitches a confirmed capture overlap once and keeps original-source coordinates", async () => {
  const continuous = raster(0, 1210);
  const crop = (start, count) => {
    const data = continuous.data.slice(start * 807 * 4, (start + count) * 807 * 4);
    return { width: 807, height: count, data };
  };
  const previous = crop(0, 807);
  const next = crop(403, 807);
  const bitmaps = new Map([["chat-1.png", previous], ["chat-2.png", next]]);
  const originalDocument = globalThis.document;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.document = { createElement: () => new MockCanvas() };
  globalThis.createImageBitmap = async (file) => ({ ...bitmaps.get(file.name), close() {} });
  try {
    const files = [new File([], "chat-1.png"), new File([], "chat-2.png")];
    const [stream] = await stitchChatImages(files.map((file, index) => ({ id: `item-${index + 1}`, file, sha256: `sha-${index + 1}` })));
    assert.equal(stream.overlapJoins.length, 1, stream.warnings.join("; "));
    assert.ok(stream.canvas.height < previous.height + next.height);
    assert.equal(stream.sourceSegments[1].sourceItemId, "item-2");
    assert.equal(stream.sourceSegments[1].sourceOffsetY, stream.overlapJoins[0].overlapPixels);
    assert.equal(stream.sourceSegments[1].streamStartY, previous.height);
    assert.equal(stream.canvas.data[previous.height * 807 * 4], next.data[stream.sourceSegments[1].sourceOffsetY * 807 * 4]);
    assert.equal(stream.stitchAudit.schemaVersion, "digital-evidence.stitch-audit.v1");
    assert.equal(stream.stitchAudit.scaleLocked, true);
    assert.equal(stream.stitchAudit.originalSha256Preserved, true);
    assert.equal(stream.stitchAudit.sourceToStream.length, 2);
    assert.equal(stream.stitchAudit.overlapEvidence.length, 1);
    assert.equal(stream.stitchAudit.overlapEvidence[0].accepted, true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});

test("records the brightness offset used only for matching and stitches unmodified pixels", async () => {
  const width = 807;
  const continuous = raster(0, 1210, width);
  const crop = (start, count) => {
    const data = continuous.data.slice(start * width * 4, (start + count) * width * 4);
    return { width, height: count, data };
  };
  const previous = crop(0, 807);
  const next = crop(403, 807);
  for (let offset = 0; offset < next.data.length; offset += 4) {
    next.data[offset] += 18;
    next.data[offset + 1] += 18;
    next.data[offset + 2] += 18;
  }
  const bitmaps = new Map([["chat-1.png", previous], ["chat-2.png", next]]);
  const originalDocument = globalThis.document;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.document = { createElement: () => new MockCanvas() };
  globalThis.createImageBitmap = async (file) => ({ ...bitmaps.get(file.name), close() {} });
  try {
    const files = [new File([], "chat-1.png"), new File([], "chat-2.png")];
    const [stream] = await stitchChatImages(files.map((file, index) => ({ id: "item-" + (index + 1), file, sha256: "sha-" + (index + 1) })));
    assert.equal(stream.overlapJoins[0].appliedBrightnessOffset, -18);
    const retainedSourceOffset = stream.sourceSegments[1].sourceOffsetY;
    const firstRetainedPixel = stream.sourceSegments[1].streamStartY * width * 4;
    assert.deepEqual(
      stream.canvas.data.slice(firstRetainedPixel, firstRetainedPixel + 4),
      next.data.slice(retainedSourceOffset * width * 4, retainedSourceOffset * width * 4 + 4),
    );
    assert.equal(stream.stitchAudit.overlapEvidence[0].appliedBrightnessOffset, -18);
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});

test("trims OCR-identified chrome only on a middle capture and audits source offsets", async () => {
  const originalDocument = globalThis.document;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const bitmap = raster(0, 500);
  globalThis.document = { createElement: () => new MockCanvas() };
  globalThis.createImageBitmap = async () => ({ ...bitmap, close() {} });
  try {
    const file = new File([], "middle.png");
    const [stream] = await stitchChatImages([{
      id: "middle",
      file,
      sha256: "sha-middle",
      isFirst: false,
      isLast: true,
      ocrLines: [{ text: "AIS 22:19 WiFi 55%", bounds: { x: 10, y: 0, width: 220, height: 18 } }],
    }]);
    assert.equal(stream.canvas.height, 442);
    assert.equal(stream.sourceSegments[0].sourceOffsetY, 58);
    assert.equal(stream.sourceSegments[0].sourceTrim.top, 58);
    assert.equal(stream.sourceSegments[0].sourceTrim.bottom, 0);
    assert.equal(stream.sourceSegments[0].sourceTrim.topMethod, "ocr_ui_cue");
    assert.equal(stream.canvas.data[0], bitmap.data[58 * 807 * 4]);
  } finally {
    globalThis.document = originalDocument;
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
