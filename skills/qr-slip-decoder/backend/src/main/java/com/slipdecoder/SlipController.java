package com.slipdecoder;

import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.client.j2se.BufferedImageLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import javax.imageio.ImageIO;
import java.util.Map;

@RestController
@RequestMapping("/api/slip")
public class SlipController {
  private final BankDomainClassifier classifier = new BankDomainClassifier();

  // สแกนทั้งภาพ ห้าม crop ตายตัว — ZXing full-image decode
  @PostMapping("/identify")
  public Map<String, String> identify(@RequestParam("file") MultipartFile file) throws Exception {
    var img = ImageIO.read(file.getInputStream());
    if (img == null) return Map.of("bank", "UNKNOWN", "reason", "QR_UNREADABLE");
    try {
      var bitmap = new BinaryBitmap(new HybridBinarizer(new BufferedImageLuminanceSource(img)));
      String payload = new MultiFormatReader().decode(bitmap).getText();
      var r = classifier.identify(payload);
      return Map.of("bank", r.bank(), "reason", r.reason(), "payload", payload);
    } catch (Exception e) {
      return Map.of("bank", "UNKNOWN", "reason", "QR_UNREADABLE");
    }
  }

  @PostMapping("/identify-text")
  public Map<String, String> identifyText(@RequestBody Map<String, String> body) {
    var r = classifier.identify(body.get("payload"));
    return Map.of("bank", r.bank(), "reason", r.reason());
  }
}
