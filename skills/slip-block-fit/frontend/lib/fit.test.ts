import { describe, it, expect } from "vitest";
import { fitSlip } from "./fit";

describe("fitSlip 645x890 center(322.5,445)", () => {
  it("R1: ภาพใหญ่ -> ย่อลง ไม่ล้นขอบ", () => {
    const r = fitSlip(1290, 1780);
    expect(r.newW).toBeLessThanOrEqual(645);
    expect(r.newH).toBeLessThanOrEqual(890);
    expect(r.scale).toBeLessThan(1);
  });
  it("R2: ภาพเล็ก 500x700 -> ห้ามขยาย (bypass)", () => {
    const r = fitSlip(500, 700);
    expect(r.scale).toBe(1);
    expect(r.newW).toBe(500); expect(r.newH).toBe(700);
  });
  it("R3: ตรงบล็อก 645x890 -> x=0 y=0", () => {
    expect(fitSlip(645, 890)).toMatchObject({ x: 0, y: 0 });
  });
  it("R4: boundary ทุกเคส", () => {
    for (const [w, h] of [[2000, 500], [300, 2000], [645, 890], [100, 100]])
      { const r = fitSlip(w, h); expect(r.newW <= 645 && r.newH <= 890).toBe(true); }
  });
  it("R5: กึ่งกลาง (322.5,445) ±1px ปัดเศษ", () => {
    const r = fitSlip(1000, 1000);
    expect(Math.abs(r.x + r.newW / 2 - 322.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(r.y + r.newH / 2 - 445)).toBeLessThanOrEqual(1);
  });
  it("R6: integer casting", () => {
    const r = fitSlip(1001, 1001);
    expect(Number.isInteger(r.x) && Number.isInteger(r.y)).toBe(true);
  });
  it("R7: no-stretch aspect-lock", () => {
    const r = fitSlip(800, 1600);
    expect(r.newW / r.newH).toBeCloseTo(800 / 1600, 2);
  });
});
