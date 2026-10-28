import assert from "node:assert/strict";
import test from "node:test";
import {
  createSearchSlipExportErrorStatus,
  createSearchSlipScanCompleteStatus,
  createSearchSlipScanErrorStatus,
} from "../search-slip-review-state.ts";

test("successful slip scan reports found candidates as review-only", () => {
  assert.deepEqual(createSearchSlipScanCompleteStatus(2), {
    state: "complete",
    message: "สแกนเสร็จ พบ 2 candidate รอตรวจทาน",
  });
});

test("successful slip scan with no candidates is distinct from a scan failure", () => {
  assert.deepEqual(createSearchSlipScanCompleteStatus(0), {
    state: "complete",
    message: "สแกนเสร็จ แต่ไม่พบหน้าที่เข้าเกณฑ์ visual slip candidate",
  });
});

test("scan and PDF-export failures are represented as errors with distinct messages", () => {
  assert.deepEqual(createSearchSlipScanErrorStatus("route failed"), {
    state: "error",
    message: "สแกนหาหน้าสลิปไม่สำเร็จ: route failed",
  });
  assert.deepEqual(createSearchSlipExportErrorStatus("export failed"), {
    state: "error",
    message: "ส่งออก PDF ไม่สำเร็จ จึงยังไม่ได้สแกน: export failed",
  });
});
