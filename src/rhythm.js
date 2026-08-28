// Rhythm pattern library.
//
// A pattern assigns a start and a duration, in beats, to each chord of an
// exercise. M1 only uses the plain quarter-note patterns; the library exists
// now so the exercise shape doesn't change when M3 adds the rhythm question.

export const PATTERNS = [
  { id: 'q3', label: '3 quarters', beats: [1, 1, 1] },
  { id: 'q4', label: '4 quarters', beats: [1, 1, 1, 1] },
  { id: 'q6', label: '6 quarters', beats: [1, 1, 1, 1, 1, 1] },
  { id: 'q8', label: '8 quarters', beats: [1, 1, 1, 1, 1, 1, 1, 1] },
];

export function getPattern(id) {
  return PATTERNS.find((p) => p.id === id) || null;
}

/** Patterns that fit a progression of `length` chords. */
export function patternsForLength(length) {
  return PATTERNS.filter((p) => p.beats.length === length);
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

/** Total length of a pattern in beats. */
export function patternBeats(pattern) {
  return pattern.beats.reduce((a, b) => a + b, 0);
}
