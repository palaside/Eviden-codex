package com.slipdecoder;

import java.net.URI;
import java.util.List;
import java.util.Map;

public class BankDomainClassifier {
  private static final Map<String, List<String>> MAP = Map.of(
    "BBL", List.of("bangkokbank.com"),
    "KKP", List.of("kkpfg.com", "kiatnakin.co.th"),
    "KBANK", List.of("kasikornbank.com"),
    "SCB", List.of("scb.co.th")
  );

  public record Result(String bank, String reason) {}

  public Result identify(String payload) {
    if (payload == null || payload.isBlank()) return new Result("UNKNOWN", "QR_UNREADABLE");
    String host;
    try {
      URI u = new URI(payload.trim());
      String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
      if (!scheme.equals("http") && !scheme.equals("https")) return new Result("UNKNOWN", "INVALID_PAYLOAD");
      host = u.getHost() == null ? "" : u.getHost().toLowerCase();
      if (host.isBlank()) return new Result("UNKNOWN", "INVALID_PAYLOAD");
    } catch (Exception e) {
      return new Result("UNKNOWN", "INVALID_PAYLOAD");
    }
    for (var e : MAP.entrySet()) {
      for (String h : e.getValue()) {
        if (host.equals(h) || host.endsWith("." + h)) return new Result(e.getKey(), "DOMAIN_MATCH:" + host);
      }
    }
    return new Result("UNKNOWN", "UNMAPPED_DOMAIN");
  }
}
