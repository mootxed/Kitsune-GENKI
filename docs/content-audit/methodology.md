# Japanese Content Audit Methodology & Workflow

## Overview

This document defines the methodology for auditing Japanese learning content in KotoKitsu across all 12 GENKI I modules.

## Audit Chain & Unit

Each item is audited through its full chain:

```text
dictionary entry
→ reading
→ translation
→ lesson
→ grammar level
→ skill cards
→ accepted answers
→ example
→ context task
→ distractors
→ pronunciation
```

## Content Review Categories & Statuses

Each content element maintains review flags across 5 dimensions:

1. **translation**: Natural Russian translation, non-literal glossing, correct part-of-speech context.
2. **exampleNaturalness**: Native phrasing, correct particle usage, natural topic/subject omission.
3. **acceptedAnswers**: Kanji/kana variants, optional fragments, plain vs polite forms.
4. **pronunciation**: Clean TTS speakable target, no romaji or brackets, correct reading.
5. **distractors**: Single unambiguous correct answer, matching part-of-speech, no duplicates.

### Status Options:

- `unreviewed`
- `automatic-checks-passed`
- `needs-review`
- `manually-reviewed`
- `native-reviewed`

## Severity Guidelines

- **Critical**: Wrong primary translation, ungrammatical canonical answer, broken ID relation, distractor has multiple correct choices, incorrect reading in TTS.
- **High**: Unnatural primary example, ambiguous production prompt, missing common answer variant, grammar from future lesson without prerequisite unlock.
- **Medium**: Literal Russian gloss, weak distractor, rare variant used as main dictionary entry.
- **Low**: Minor stylistic improvements, optional answer expansion.

## Review Attribution Disclosure

- **Automatic Audit**: Programmatic invariant checks via `npm run content:audit`.
- **Author Manual Review**: Structural & linguistic verification by module author.
- **Native Reviewer**: Explicit tag reserved ONLY when reviewed by a native Japanese speaker.
