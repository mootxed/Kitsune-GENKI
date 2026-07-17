/* srs.js — SM-2 spaced repetition algorithm (pure JS) */

const DAY = 86400000;

  // Create a fresh SRS card record
  function newCard(id) {
    return {
      id,
      ef: 2.5,        // easiness factor
      interval: 0,    // days
      reps: 0,        // successful repetitions in a row
      due: Date.now(),
      lastReview: null,
    };
  }

  /*
   * SM-2 update.
   * quality: 0..5  (we map: Again=0, Hard=3, Good=4, Easy=5)
   * Returns the same (mutated) card object.
   */
  function review(card, quality) {
    const now = Date.now();
    if (quality < 3) {
      // failed -> reset repetitions, show again immediately
      card.reps = 0;
      card.interval = 0;
      card.due = now;
    } else {
      card.reps += 1;
      if (card.reps === 1) card.interval = 1;
      else if (card.reps === 2) card.interval = 6;
      else card.interval = Math.round(card.interval * card.ef);
      card.due = now + card.interval * DAY;
      // update easiness factor only on success (classic SM-2)
      card.ef = card.ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      // Граничные проверки EF: [1.3, 2.5]
      if (card.ef < 1.3) card.ef = 1.3;
      if (card.ef > 2.5) card.ef = 2.5;
    }
    card.lastReview = now;
    return card;
  }

  function isDue(card, ref) {
    return card.due <= (ref || Date.now());
  }

export const SRS = { newCard, review, isDue, DAY };
