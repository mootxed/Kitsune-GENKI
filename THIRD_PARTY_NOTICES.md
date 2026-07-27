# Third-Party Notices & Attribution — KotoKitsu

This document lists the third-party software components, datasets, and media assets that are physically included or bundled in the production release of KotoKitsu.

---

## Vector Ranks

- **Name**: Vector Ranks
- **Author / Rightsholder**: RhosGFX
- **Source**: https://rhosgfx.itch.io/vector-ranks
- **Version**: N/A (Asset Pack)
- **License**: CC0 1.0 Universal (Public Domain Dedication)
- **Files Used**: All rank icon files in `public/rank/` (`alpha_01.webp` through `gamma_12.webp`)
- **Changes Made**: Selected source PNG icons were converted to WebP format for optimized web loading.
- **Attribution Requirements**: Attribution is not legally required under CC0 1.0 Universal and is provided voluntarily for transparency of provenance.
- **Full License Location**: [public/licenses/CC0-1.0.txt](public/licenses/CC0-1.0.txt) and [public/rank/SOURCE.md](public/rank/SOURCE.md)

---

## hanzi-writer

- **Name**: hanzi-writer
- **Author / Rightsholder**: David Chanin
- **Source**: https://github.com/chanind/hanzi-writer (npm package `hanzi-writer`)
- **Version**: `3.7.3` (see `package-lock.json`)
- **License**: MIT License / Arphic Public License
- **Files Used**: Bundled runtime JavaScript code in production application bundle.
- **Changes Made**: None (imported via ES module imports in production build).
- **Attribution Requirements**: The copyright notice and MIT license notice shall be included in all copies or substantial portions of the Software.
- **Full License Location**: [public/licenses/hanzi-writer/LICENSE.txt](public/licenses/hanzi-writer/LICENSE.txt) and [public/licenses/hanzi-writer/NOTICE.md](public/licenses/hanzi-writer/NOTICE.md)

---

## @k1low/hanzi-writer-data-jp

- **Name**: @k1low/hanzi-writer-data-jp
- **Author / Rightsholder**: Kenji Kaneshige (@k1low), Francois Mizessyn (AnimCJK project), Shaunak Kishore (Make Me a Hanzi), Arphic Technology Co., Ltd.
- **Source**: https://github.com/k1low/hanzi-writer-data-jp (npm package `@k1low/hanzi-writer-data-jp`)
- **Version**: `0.8.0` (see `package-lock.json`)
- **License**: Multi-licensed (LGPL-3.0-or-later, Arphic Public License, Unicode Copyright Notice, SIL Open Font License)
- **Files Used**: Kanji stroke order JSON datasets copied to `public/data/kanji/[char].json`
- **Changes Made**: Individual character JSON stroke files filtered by unique kanji in lesson vocabulary are extracted by `scripts/build-kanji-data.js` and served as individual static files; JSON structure per character is preserved without modification.
- **Attribution Requirements**: Include applicable LGPL, Arphic PL, Unicode, and OFL notices with distributed data files.
- **Full License Location**: [public/licenses/hanzi-writer-data-jp/](public/licenses/hanzi-writer-data-jp/)

---

## Runtime Software Dependencies

The following software packages are compiled/bundled into the web application client bundle:

### ts-fsrs

- **Author**: ts-fsrs contributors (open-source)
- **Version**: `5.4.1`
- **License**: MIT License
- **Usage**: FSRS (Free Spaced Repetition Scheduler) memory algorithm implementation in browser client.

### zod

- **Author**: Colin McDonnell
- **Version**: `4.4.3`
- **License**: MIT License
- **Usage**: Runtime schema validation for lesson data and state objects.
