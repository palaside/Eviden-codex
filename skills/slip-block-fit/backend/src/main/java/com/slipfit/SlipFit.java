package com.slipfit;

public class SlipFit {
  public static final int TW = 645, TH = 890;
  public record Fit(int newW, int newH, int x, int y, double scale) {}
  public static Fit fit(int w, int h) {
    if (w <= 0 || h <= 0) throw new IllegalArgumentException("INVALID_DIMENSIONS");
    double scale = Math.min(1.0, Math.min((double) TW / w, (double) TH / h));
    int nw = (int) Math.round(w * scale), nh = (int) Math.round(h * scale);
    return new Fit(nw, nh, (TW - nw) / 2, (TH - nh) / 2, scale);
  }
}
