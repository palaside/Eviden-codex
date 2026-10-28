import { describe, it, expect } from "vitest";
import { identifyBank } from "./classifier";

// Decision Table mapping 1:1 — 7 rows, no extra conditions
describe("identifyBank (QR Payload Decoding)", () => {
  it("R1: empty/blurred/blocked -> UNKNOWN/QR_UNREADABLE", () => {
    expect(identifyBank(null).reason).toBe("QR_UNREADABLE");
    expect(identifyBank("").bank).toBe("UNKNOWN");
  });
  it("R2: non-URL payload -> UNKNOWN/INVALID_PAYLOAD", () => {
    expect(identifyBank("hello-qr").bank).toBe("UNKNOWN");
    expect(identifyBank("hello-qr").reason).toBe("INVALID_PAYLOAD");
  });
  it("R3: bangkokbank.com -> BBL", () => {
    expect(identifyBank("https://verify.bangkokbank.com/eslip?id=1").bank).toBe("BBL");
  });
  it("R4a: kkpfg.com -> KKP", () => {
    expect(identifyBank("https://verify.kkpfg.com/check/abc").bank).toBe("KKP");
  });
  it("R4b: kiatnakin.co.th -> KKP", () => {
    expect(identifyBank("https://eslip.kiatnakin.co.th/v/xyz").bank).toBe("KKP");
  });
  it("R5: kasikornbank.com -> KBANK", () => {
    expect(identifyBank("https://verify.kasikornbank.com/slip/123").bank).toBe("KBANK");
  });
  it("R6: scb.co.th -> SCB", () => {
    expect(identifyBank("https://verify.scb.co.th/slip/999").bank).toBe("SCB");
  });
  it("R7: unmapped domain -> UNKNOWN/UNMAPPED_DOMAIN", () => {
    const r = identifyBank("https://verify.unknownbank.co.th/x");
    expect(r.bank).toBe("UNKNOWN");
    expect(r.reason).toBe("UNMAPPED_DOMAIN");
  });
});
