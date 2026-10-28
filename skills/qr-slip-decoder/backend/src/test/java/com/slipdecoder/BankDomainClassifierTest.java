package com.slipdecoder;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class BankDomainClassifierTest {
  BankDomainClassifier c = new BankDomainClassifier();
  @Test void r1_empty() { assertEquals("QR_UNREADABLE", c.identify(null).reason()); }
  @Test void r2_invalid() { assertEquals("INVALID_PAYLOAD", c.identify("hello-qr").reason()); }
  @Test void r3_bbl() { assertEquals("BBL", c.identify("https://verify.bangkokbank.com/eslip?id=1").bank()); }
  @Test void r4a_kkp() { assertEquals("KKP", c.identify("https://verify.kkpfg.com/check/abc").bank()); }
  @Test void r4b_kkp2() { assertEquals("KKP", c.identify("https://eslip.kiatnakin.co.th/v/xyz").bank()); }
  @Test void r5_kbank() { assertEquals("KBANK", c.identify("https://verify.kasikornbank.com/slip/123").bank()); }
  @Test void r6_scb() { assertEquals("SCB", c.identify("https://verify.scb.co.th/slip/999").bank()); }
  @Test void r7_unmapped() { assertEquals("UNMAPPED_DOMAIN", c.identify("https://verify.unknownbank.co.th/x").reason()); }
}
