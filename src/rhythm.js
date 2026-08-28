// Rhythm pattern library.
//
// A pattern assigns a duration in beats to each chord of an excerpt. Durations
// are in quarter notes and every pattern fills a whole number of bars, so the
// excerpt always ends where a bar does.
//
// Tiers grade the difficulty: 1 is even note values, 2 is uneven but still on
// the beat, 3 puts an onset off the beat.

export const PATTERNS = [
  // --- three chords, one bar ---
  { id: 'q-q-h', tier: 1, beats: [1, 1, 2] },
  { id: 'h-q-q', tier: 2, beats: [2, 1, 1] },
  { id: 'q-h-q', tier: 2, beats: [1, 2, 1] },
  { id: 'dq-e-h', tier: 3, beats: [1.5, 0.5, 2] },
  { id: 'q-dq-dq', tier: 3, beats: [1, 1.5, 1.5] },

  // --- three chords, two bars ---
  { id: 'h-h-w', tier: 1, beats: [2, 2, 4] },
  { id: 'w-h-h', tier: 2, beats: [4, 2, 2] },
  { id: 'h-w-h', tier: 2, beats: [2, 4, 2] },
  { id: 'dh-dh-h', tier: 2, beats: [3, 3, 2] },

  // --- four chords, one bar ---
  { id: 'q-q-q-q', tier: 1, beats: [1, 1, 1, 1] },
  { id: 'dq-e-q-q', tier: 3, beats: [1.5, 0.5, 1, 1] },
  { id: 'q-dq-e-q', tier: 3, beats: [1, 1.5, 0.5, 1] },
  { id: 'q-q-e-dq', tier: 3, beats: [1, 1, 0.5, 1.5] },

  // --- four chords, two bars ---
  { id: 'h-h-h-h', tier: 1, beats: [2, 2, 2, 2] },
  { id: 'q-q-h-w', tier: 2, beats: [1, 1, 2, 4] },
  { id: 'h-q-q-w', tier: 2, beats: [2, 1, 1, 4] },
  { id: 'dh-q-h-h', tier: 2, beats: [3, 1, 2, 2] },
  { id: 'h-dq-e-w', tier: 3, beats: [2, 1.5, 0.5, 4] },

  // --- five chords, two bars ---
  { id: 'q-q-q-q-w', tier: 2, beats: [1, 1, 1, 1, 4] },
  { id: 'h-h-q-q-h', tier: 2, beats: [2, 2, 1, 1, 2] },
  { id: 'q-h-q-q-dh', tier: 2, beats: [1, 2, 1, 1, 3] },
  { id: 'dq-e-q-q-w', tier: 3, beats: [1.5, 0.5, 1, 1, 4] },

  // --- six chords, two bars ---
  { id: 'q-q-q-q-h-h', tier: 1, beats: [1, 1, 1, 1, 2, 2] },
  { id: 'h-q-q-h-q-q', tier: 2, beats: [2, 1, 1, 2, 1, 1] },
  { id: 'q-q-h-q-q-h', tier: 2, beats: [1, 1, 2, 1, 1, 2] },
  { id: 'h-q-q-q-q-h', tier: 2, beats: [2, 1, 1, 1, 1, 2] },
];

export function getPattern(id) {
  return PATTERNS.find((p) => p.id === id) || null;
}

/** Total length of a pattern in beats. */
export function patternBeats(pattern) {
  return pattern.beats.reduce((a, b) => a + b, 0);
}

/** Patterns for a chord count, no harder than `maxTier`. */
export function patternsForLength(length, maxTier = 3) {
  return PATTERNS.filter((p) => p.beats.length === length && p.tier <= maxTier);
}

/** Turn a pattern's durations into { startBeat, durationBeats } placements. */
export function placements(pattern) {
  let at = 0;
  return pattern.beats.map((d) => {
    const placement = { startBeat: at, durationBeats: d };
    at += d;
    return placement;
  });
}

/**
 * A pattern as a grid of eighth-note cells: each cell is 'onset', 'held' or
 * 'rest'. The answer sheet draws these, and drawing beats writing "1.5" at a
 * user in a dictation exercise.
 */
export function beatGrid(pattern, { beatsPerBar = 4 } = {}) {
  const cells = [];
  for (const duration of pattern.beats) {
    const steps = Math.round(duration * 2); // eighth-note resolution
    for (let i = 0; i < steps; i++) {
      cells.push({
        kind: i === 0 ? 'onset' : 'held',
        downbeat: (cells.length / 2) % beatsPerBar === 0,
        onBeat: cells.length % 2 === 0,
      });
    }
  }
  return cells;
}

/**
 * Patterns that can actually be asked about at a given tier: ones with enough
 * siblings of the same chord count and length to fill a choice list. Four
 * chords in a single bar, all on the beat, has exactly one answer — so it makes
 * a fine excerpt but a pointless question.
 */
export function askablePatterns(length, maxTier = 3, minChoices = 4) {
  const pool = patternsForLength(length, maxTier);
  return pool.filter(
    (p) => pool.filter((q) => patternBeats(q) === patternBeats(p)).length >= minChoices,
  );
}

/**
 * Candidate patterns for the rhythm question: the real one plus distractors of
 * the same chord count and the same total length, so nothing can be ruled out
 * by counting chords or bars alone.
 *
 * Distractors stay inside the same tier as the excerpt. Offering a syncopated
 * decoy where the generator only ever plays straight rhythms would teach the
 * user to discount it without listening.
 */
export function rhythmChoices(pattern, { count = 4, rng = Math.random, maxTier = 3 } = {}) {
  const total = patternBeats(pattern);
  const pool = patternsForLength(pattern.beats.length, Math.max(maxTier, pattern.tier)).filter(
    (p) => p.id !== pattern.id && patternBeats(p) === total,
  );
  const chosen = [];
  const available = [...pool];
  while (chosen.length < count - 1 && available.length) {
    chosen.push(available.splice(Math.floor(rng() * available.length), 1)[0]);
  }
  const all = [...chosen, pattern];
  // Shuffle, so the answer isn't always last.
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}
