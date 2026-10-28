# Local OCR Third-Party Notices

All OCR resources are served from this application's own `/ocr` path. The OCR worker is configured without a Blob worker, remote language path, or remote core path.

## Runtime

| Package | Version | License |
| --- | --- | --- |
| tesseract.js | 6.0.1 | Apache-2.0 |
| tesseract.js-core | 6.1.2 | Apache-2.0 |
| bmp-js | 0.1.0 | MIT |
| idb-keyval | 6.3.0 | Apache-2.0 |
| is-url | 1.2.4 | MIT |
| node-fetch | 2.7.0 | MIT |
| opencollective-postinstall | 2.0.3 | MIT |
| regenerator-runtime | 0.13.11 | MIT |
| wasm-feature-detect | 1.9.0 | Apache-2.0 |
| zlibjs | 0.3.1 | MIT |
| whatwg-url | 5.0.0 | MIT |
| tr46 | 0.0.3 | MIT |
| webidl-conversions | 3.0.1 | BSD-2-Clause |

The optional `encoding` peer dependency of `node-fetch` is not installed.

## Language Models

The Thai and English models are from `tesseract-ocr/tessdata_fast`, pinned to commit `87416418657359cb625c412a48b6e1d6d41c29bd` and licensed Apache-2.0. The repository license is included as `TESSDATA-LICENSE`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `lang/tha.traineddata` | 1072600 | `294227CC2D1292B0ACB28D61D4115C88252B96D466CA90B417CF4CF0C67BF07C` |
| `lang/eng.traineddata` | 4113088 | `7D4322BD2A7749724879683FC3912CB542F19906C83BCC1A52132556427170B2` |

The npm packages `@tesseract.js-data/tha` and `@tesseract.js-data/eng` are not used because their package metadata and source repository license declarations do not agree.

## Included License Texts

- `TESSERACT-JS-LICENSE.md`: Apache-2.0, tesseract.js.
- `TESSERACT-CORE-LICENSE`: Apache-2.0, tesseract.js-core.
- `TESSDATA-LICENSE`: Apache-2.0, tessdata_fast models.
