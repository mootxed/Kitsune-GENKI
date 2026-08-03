# Asset Provenance & Origin Documentation — KotoKitsu

This document details the origin, transformation history, and legal status of visual media used in KotoKitsu.

---

## 1. Vector Rank Icons (`public/rank/*.webp`)

All 48 rank icon files (`alpha_01.webp` through `gamma_12.webp`) derive from the **Vector Ranks** asset pack.

- **Author**: RhosGFX
- **Source**: https://rhosgfx.itch.io/vector-ranks
- **License**: CC0 1.0 Universal (Public Domain Dedication)
- **Transformations**:
  1. Selected rank graphics were chosen from the source pack.
  2. Source PNG images were converted by the project maintainers into WebP format for optimized web delivery.
- **Attribution**: Voluntary attribution is maintained in [public/rank/SOURCE.md](../../public/rank/SOURCE.md) and [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md).
- **Endorsement Disclaimer**: RhosGFX does not endorse or sponsor KotoKitsu.

---

## 2. Story Cover Images (`public/image/Story1.webp` .. `Story12.webp`)

The story cover images `Story1.webp` through `Story12.webp` represent AI-generated visual artwork.

- **Origin**: Created via Generative AI upon prompt requests commissioned by project author **Mootxed**.
- **Genki Textbook Non-Derivation**: These covers were created independently and are not images or illustrations copied from the GENKI textbook.
- **Transformations**: Generated artwork files were converted from PNG to WebP format.
- **Pending Confirmation**: Generator service name, model version, exact prompts, dates, and terms of service are currently marked as `unknown` / `needs-author-confirmation` in [ASSET_PROVENANCE.json](../../ASSET_PROVENANCE.json).
- **Legal Status Note**: AI-generated origin does not guarantee absence of accidental similarity to third-party works. They are not declared CC0 or GPL until generator service terms are recorded.

---

## 3. KotoKitsu mascot (`public/assets/mascot/*.webp`)

The redesign mascot was supplied by the project owner in the KotoKitsu design-prototype archive on 2026-08-03.

- **Origin**: Project-owner-supplied generated artwork; the exact generator and model are not recorded.
- **Visual contract**: Orange fox, cream muzzle/chest/tail tip, indigo details, and a short blue scarf in a soft 3D style.
- **Transformations**: The transparent source PNG was resized into role-specific WebP assets for onboarding, hero, and compact-message contexts. No visual content was added.
- **Role mapping**: [public/assets/mascot/roles.json](../../public/assets/mascot/roles.json) keeps product roles independent even while compact emotional states temporarily share one approved pose.
- **Pending confirmation**: Generator terms, model, and final project licensing status remain `unknown` / `needs-author-confirmation` in `ASSET_PROVENANCE.json`.
