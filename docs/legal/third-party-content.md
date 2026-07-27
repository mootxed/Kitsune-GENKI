# Third-Party Content & Data Dependencies — KotoKitsu

This document explains the third-party libraries and stroke order datasets physically distributed with KotoKitsu runtime builds.

---

## 1. Kanji Stroke Data (`public/data/kanji/*.json`)

Kanji stroke order SVG path data files are bundled in `public/data/kanji/` during project build.

- **Upstream Libraries**:
  - `hanzi-writer` (David Chanin, MIT License / Arphic PL)
  - `@k1low/hanzi-writer-data-jp` (Kenji Kaneshige / AnimCJK / Make Me a Hanzi / Arphic PL / LGPLv3 / Unicode / SIL OFL)
- **Extraction Process**:
  - `scripts/build-kanji-data.js` parses lesson vocabulary and extracts corresponding character JSON files from `@k1low/hanzi-writer-data-jp`.
  - Content within individual character files is not altered.
- **License Distribution**:
  - Upstream notice and license files are automatically copied to `public/licenses/` by `scripts/copy-third-party-licenses.js` during prebuild.

---

## 2. Audio Processing

- KotoKitsu **does not** bundle or distribute audio files (MP3/OGG) or official audio recordings.
- Pronunciation relies exclusively on the client-side browser Web Speech API (`window.speechSynthesis`).
