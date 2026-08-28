import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeExercise } from '../src/grading.js';
import { parseProgression } from '../src/parse.js';
import { generateExercise } from '../src/generator.js';
import { degreeQuality, degreeRootMidi, chordPitches, formatRoman } from '../src/theory.js';

/** Build an exercise straight from roman numerals, so cases read plainly. */
function exerciseOf(romans, tonic = 'C') {
  const key = { tonic, mode: 'major' };
  const index = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5, 'vii°': 6 };
  return {
    key,
    meter: { beats: 4, unit: 4 },
    bpm: 84,
    chords: romans.map((roman, i) => {
      const degree = index[roman];
      const quality = degreeQuality('major', degree);
      const root = degreeRootMidi(key, degree);
      return {
        degree, quality, inversion: 0, roman: formatRoman(degree, quality),
        pitches: [root - 12, ...chordPitches(root, quality)],
        startBeat: i, durationBeats: 1,
      };
    }),
    melody: null,
    rhythmPatternId: null,
    concepts: [],
  };
}

const grade = (romans, text) => gradeExercise(exerciseOf(romans), { chords: parseProgression(text).chords });

test('a correct answer scores everything', () => {
  const result = grade(['I', 'IV', 'V', 'I'], 'I IV V I');
  assert.equal(result.score, 1);
  assert.ok(result.perfect);
  assert.deepEqual(result.slots.map((s) => s.status), ['correct', 'correct', 'correct', 'correct']);
  assert.deepEqual(result.notes, []);
});

test('right root, wrong quality is a near miss worth half the slot', () => {
  const result = grade(['I', 'vi', 'V', 'I'], 'I VI V I');
  const slot = result.slots[1];
  assert.equal(slot.status, 'near');
  assert.equal(slot.earned, 1);
  assert.equal(slot.possible, 2);
  assert.match(slot.reason, /wrong quality/);
  assert.equal(result.score, 7 / 8);
});

test('right quality, wrong root still earns the quality point', () => {
  const result = grade(['I', 'IV', 'V', 'I'], 'I V V I');
  assert.equal(result.slots[1].status, 'wrong');
  assert.equal(result.slots[1].earned, 1);
  assert.match(result.slots[1].reason, /wrong root/);
});

test('a short answer leaves the rest missing and says so', () => {
  const result = grade(['I', 'IV', 'V', 'I'], 'I IV');
  assert.deepEqual(result.slots.map((s) => s.status), ['correct', 'correct', 'missing', 'missing']);
  assert.equal(result.score, 0.5);
  assert.match(result.notes[0], /wrote 2 chords; there were 4/);
});

test('chords heard that were never played cost a point each', () => {
  const result = grade(['I', 'IV'], 'I IV V I');
  assert.deepEqual(result.slots.map((s) => s.status), ['correct', 'correct', 'extra', 'extra']);
  assert.equal(result.slots[2].possible, 1, 'one point, not two — there is no quality to miss');
  assert.equal(result.slots[2].earned, 0);
  assert.equal(result.possible, 6);
  assert.equal(result.score, 4 / 6);
  assert.equal(result.perfect, false, 'never perfect when you heard chords that were not there');
  assert.match(result.notes[0], /wrote 4 chords; there were 2/);
});

test('an untouched sheet is unattempted, not zero out of eight', () => {
  const result = grade(['I', 'IV', 'V', 'I'], '');
  assert.equal(result.attempted, false);
  assert.equal(result.possible, 0);
  assert.equal(result.slots.length, 0);
  assert.equal(result.perfect, false);
});

test('a consistently transposed answer is named as such', () => {
  const result = grade(['I', 'IV', 'V', 'I'], 'IV vii° I IV');
  assert.ok(result.notes.some((n) => /wrong key centre/.test(n)), result.notes.join(' '));
  assert.match(result.notes.find((n) => /key centre/.test(n)), /fourth up/);
});

test('a merely wrong answer is not called a transposition', () => {
  const result = grade(['I', 'IV', 'V', 'I'], 'I V vi IV');
  assert.ok(!result.notes.some((n) => /key centre/.test(n)), result.notes.join(' '));
});

test('accidental-altered degrees do not pass as diatonic', () => {
  const result = grade(['I', 'vii°', 'I', 'V'], 'I bvii° I V');
  assert.notEqual(result.slots[1].status, 'correct');
});

test('grading a generated exercise against its own truth is always perfect', () => {
  for (let i = 0; i < 50; i++) {
    const exercise = generateExercise();
    const text = exercise.chords.map((c) => c.roman).join(' ');
    const result = gradeExercise(exercise, { chords: parseProgression(text).chords });
    assert.ok(result.perfect, `${text} should grade clean`);
  }
});

const withRhythm = (romans, patternId, choices) => ({
  ...exerciseOf(romans), rhythmPatternId: patternId, rhythmChoices: choices,
});

test('the rhythm question is worth a point when it was asked and answered', () => {
  const exercise = withRhythm(['I', 'IV', 'V', 'I'], 'h-h-h-h', ['q-q-q-q', 'h-h-h-h']);
  const answer = { chords: parseProgression('I IV V I').chords, rhythmPatternId: 'h-h-h-h' };
  const result = gradeExercise(exercise, answer);
  assert.equal(result.rhythm.correct, true);
  assert.equal(result.possible, 9, 'eight chord points plus one for the rhythm');
  assert.equal(result.score, 1);
});

test('the wrong rhythm costs its point and says what to do about it', () => {
  const exercise = withRhythm(['I', 'IV', 'V', 'I'], 'h-h-h-h', ['q-q-q-q', 'h-h-h-h']);
  const answer = { chords: parseProgression('I IV V I').chords, rhythmPatternId: 'q-q-q-q' };
  const result = gradeExercise(exercise, answer);
  assert.equal(result.rhythm.correct, false);
  assert.equal(result.score, 8 / 9);
  assert.equal(result.perfect, false);
  assert.match(result.rhythm.reason, /click/);
});

test('a rhythm left unanswered is skipped, not marked wrong', () => {
  const exercise = withRhythm(['I', 'IV', 'V', 'I'], 'h-h-h-h', ['q-q-q-q', 'h-h-h-h']);
  const result = gradeExercise(exercise, { chords: parseProgression('I IV V I').chords });
  assert.equal(result.rhythm, null);
  assert.equal(result.possible, 8);
  assert.ok(result.perfect, 'skipping an optional section cannot cost you');
});

test('answering only the rhythm still counts as an attempt', () => {
  const exercise = withRhythm(['I', 'IV'], 'q-q-h', ['q-q-h', 'h-q-q']);
  const result = gradeExercise(exercise, { chords: [], rhythmPatternId: 'q-q-h' });
  assert.equal(result.attempted, true);
  assert.equal(result.possible, 1);
  assert.equal(result.score, 1);
});
