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
const MELODY_POINT = 1;
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
 * The melody, note against note by pitch class — how high someone sang it is
 * not what is being tested.
 */
function gradeMelody(exercise, answer, flats) {
  const asked = Boolean(exercise.asks && exercise.asks.melody && exercise.melody);
  const given = (answer && answer.melody) || [];
  if (!asked || !given.length) return null;

  const expected = exercise.melody.map((note) => note.midi % 12);
  const actual = given.map((note) => (note.pc ?? null));

  const notes = [];
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    const want = expected[i];
    const got = actual[i];
    if (want === undefined) {
      notes.push({ index: i, expected: null, actual: got, correct: false, earned: 0, possible: MELODY_POINT });
    } else if (got === undefined || got === null) {
      notes.push({ index: i, expected: want, actual: null, correct: false, earned: 0, possible: MELODY_POINT });
    } else {
      const correct = got === want;
      notes.push({ index: i, expected: want, actual: got, correct, earned: correct ? MELODY_POINT : 0, possible: MELODY_POINT });
    }
  }

  const reasons = [];
  if (actual.length !== expected.length) {
    reasons.push(`You wrote ${actual.length} notes; the melody had ${expected.length}.`);
  }
  const shift = displacement(expected, actual);
  if (shift) {
    const n = Math.abs(shift);
    const note = n === 1 ? 'note' : 'notes';
    reasons.push(
      shift > 0
        ? `You heard the line, but your answer starts ${n} ${note} into it.`
        : `You heard the line, but your answer starts ${n} ${note} before it does.`,
    );
  }

  return {
    notes,
    reasons,
    expected,
    earned: notes.reduce((sum, n) => sum + n.earned, 0),
    possible: notes.reduce((sum, n) => sum + n.possible, 0),
  };
}

/** Same notes, wrong place: returns how far the answer slipped, or 0. */
function displacement(expected, actual) {
  if (actual.length < 2) return 0;
  for (let shift = -2; shift <= 2; shift++) {
    if (shift === 0) continue;
    let matched = 0;
    for (let i = 0; i < actual.length; i++) {
      const j = i + shift;
      if (j >= 0 && j < expected.length && expected[j] === actual[i]) matched += 1;
    }
    if (matched >= Math.min(actual.length, expected.length) - 1 && matched >= 2) return shift;
  }
  return 0;
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
  const melody = gradeMelody(exercise, answer, exercise.flats);
  if (melody) notes.push(...melody.reasons);

  const sections = [rhythm, melody].filter(Boolean);
  const earned = slots.reduce((sum, s) => sum + s.earned, 0)
    + sections.reduce((sum, s) => sum + s.earned, 0);
  const possible = slots.reduce((sum, s) => sum + s.possible, 0)
    + sections.reduce((sum, s) => sum + s.possible, 0);

  return {
    slots,
    rhythm,
    melody,
    notes,
    earned,
    possible,
    score: possible ? earned / possible : 0,
    perfect: possible > 0 && earned === possible,
    attempted: attemptedProgression || sections.length > 0,
  };
}
