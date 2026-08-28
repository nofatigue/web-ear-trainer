// Grading: exercise + answer -> a result tree.
//
// Chords align by index, chord n against chord n. The score matters less than
// the reason, so every slot carries one: right root but wrong quality, right
// progression in the wrong key, and so on. Review and (later) stats both read
// this same structure. Pure: no DOM.

import { formatRoman, chordLabel, pcToName, QUALITY_LABELS, ROMAN } from './theory.js';

const DEGREE_POINT = 1;
const QUALITY_POINT = 1;
const RHYTHM_POINT = 1;
// The voicing details are worth less than the chord itself: getting the bass
// note of a chord you misheard entirely is not half an answer.
const DETAIL_POINT = 0.5;

const BASS_ROLE = ['root', 'third', 'fifth', 'seventh'];

function describe(chord) {
  return chord ? formatRoman(chord.degree, chord.quality) : null;
}

/** Grade one of the voicing details hung off a chord slot. */
function gradeDetail(expectedValue, givenValue, describeIt) {
  if (givenValue === null || givenValue === undefined) return null;
  const correct = givenValue === expectedValue;
  return {
    expected: expectedValue,
    actual: givenValue,
    correct,
    earned: correct ? DETAIL_POINT : 0,
    possible: DETAIL_POINT,
    reason: correct ? null : describeIt(expectedValue),
  };
}

function gradeSlot(expected, given, index, { asks = {}, flats = false } = {}) {
  const slot = {
    index,
    expected: describe(expected),
    expectedLabel: expected ? chordLabel(expected.degree, expected.quality, expected.inversion) : null,
    expectedQuality: expected ? expected.quality : null,
    actual: given ? (given.text || describe(given)) : null,
    earned: 0,
    possible: DEGREE_POINT + QUALITY_POINT,
    details: {},
  };

  if (!expected) {
    // Hearing a chord that wasn't there is a real error, so it costs a point —
    // but only one, since there is no quality to have got right or wrong.
    return { ...slot, status: 'extra', possible: DEGREE_POINT, reason: 'There was no chord here.' };
  }
  if (!given) {
    return { ...slot, status: 'missing', reason: `Nothing written — this was ${slot.expected}.` };
  }

  const degreeOk = given.degree === expected.degree && (given.alter || 0) === 0;
  const qualityOk = given.quality === expected.quality;

  // Voicing detail, each part optional and graded on its own.
  const details = {};
  if (asks.inversions) {
    details.inversion = gradeDetail(
      expected.inversion,
      given.inversion ?? null,
      (value) => `It was ${chordLabel(expected.degree, expected.quality, value)} — the `
        + `${BASS_ROLE[value] || 'root'} in the bass.`,
    );
  }
  if (asks.bass) {
    details.bass = gradeDetail(
      expected.pitches[0] % 12,
      given.bassPc ?? null,
      (value) => `The bass note was ${pcToName(value, { flats })}.`,
    );
  }
  if (asks.top) {
    details.top = gradeDetail(
      expected.pitches[expected.pitches.length - 1] % 12,
      given.topPc ?? null,
      (value) => `The top voice was ${pcToName(value, { flats })}.`,
    );
  }

  const extra = Object.values(details).filter(Boolean);
  slot.details = details;
  slot.earned += extra.reduce((sum, d) => sum + d.earned, 0);
  slot.possible += extra.reduce((sum, d) => sum + d.possible, 0);

  if (degreeOk && qualityOk) {
    return {
      ...slot,
      status: 'correct',
      earned: slot.earned + DEGREE_POINT + QUALITY_POINT,
      reason: null,
    };
  }
  if (degreeOk) {
    return {
      ...slot,
      status: 'near',
      earned: slot.earned + DEGREE_POINT,
      reason: `Right root, wrong quality — that ${ROMAN[expected.degree]} was ${QUALITY_LABELS[expected.quality]}.`,
    };
  }
  if (qualityOk) {
    return {
      ...slot,
      status: 'wrong',
      earned: slot.earned + QUALITY_POINT,
      reason: `Right quality, wrong root — it was ${slot.expected}.`,
    };
  }
  return { ...slot, status: 'wrong', reason: `It was ${slot.expected}.` };
}

/** Every degree off by the same step means the shape was heard, the key wasn't. */
function transpositionNote(expected, given) {
  if (!given.length || given.length !== expected.length) return null;
  const shift = (given[0].degree - expected[0].degree + 7) % 7;
  if (shift === 0) return null;
  const consistent = expected.every((chord, i) => (given[i].degree - chord.degree + 7) % 7 === shift);
  if (!consistent) return null;
  const steps = ['', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][shift];
  return `Right shape, wrong key centre — you wrote the whole progression a ${steps} up. Lean on the tonic reference before answering.`;
}

/** The rhythm question, when the exercise asked it and the user answered. */
function gradeRhythm(exercise, answer) {
  const asked = Boolean(exercise.rhythmChoices && exercise.rhythmChoices.length);
  const given = answer ? answer.rhythmPatternId : null;
  if (!asked || !given) return null;
  const correct = given === exercise.rhythmPatternId;
  return {
    expected: exercise.rhythmPatternId,
    actual: given,
    correct,
    earned: correct ? RHYTHM_POINT : 0,
    possible: RHYTHM_POINT,
    reason: correct ? null : 'Count the excerpt again with the click on — the chord changes are what carry the pattern.',
  };
}

/**
 * Grade one attempt.
 *
 * Sections left blank are excluded from the denominator rather than counted
 * wrong, so switching a section on can never drag a score down for reasons
 * that have nothing to do with hearing.
 */
export function gradeExercise(exercise, answer) {
  const expected = exercise.chords;
  const given = (answer && answer.chords) || [];
  const attemptedProgression = given.length > 0;

  const slots = [];
  if (attemptedProgression) {
    const n = Math.max(expected.length, given.length);
    const context = { asks: exercise.asks || {}, flats: exercise.flats };
    for (let i = 0; i < n; i++) slots.push(gradeSlot(expected[i], given[i], i, context));
  }

  const notes = [];
  if (attemptedProgression && given.length !== expected.length) {
    notes.push(
      `You wrote ${given.length} chord${given.length === 1 ? '' : 's'}; there were ${expected.length}.`,
    );
  }
  const transposed = attemptedProgression ? transpositionNote(expected, given) : null;
  if (transposed) notes.push(transposed);

  const rhythm = gradeRhythm(exercise, answer);

  const earned = slots.reduce((sum, s) => sum + s.earned, 0) + (rhythm ? rhythm.earned : 0);
  const possible = slots.reduce((sum, s) => sum + s.possible, 0) + (rhythm ? rhythm.possible : 0);

  return {
    slots,
    rhythm,
    notes,
    earned,
    possible,
    score: possible ? earned / possible : 0,
    perfect: possible > 0 && earned === possible,
    attempted: attemptedProgression || Boolean(rhythm),
  };
}
