import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyStore, record, recordAttempt, outcomes, weightOf, degreeWeights, summary,
  toJSON, fromJSON, load, save,
} from '../src/stats.js';
import { generateExercise, levelSettings } from '../src/generator.js';
import { gradeExercise } from '../src/grading.js';
import { parseProgression } from '../src/parse.js';

/** A localStorage stand-in, so the store can be tested without a browser. */
function fakeStorage(failing = false) {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { if (failing) throw new Error('quota'); map.set(k, v); },
  };
}

test('a recorded attempt updates count, total and moving average', () => {
  const store = emptyStore();
  record(store, 'degree:V', true);
  const first = store.concepts['degree:V'];
  assert.equal(first.attempts, 1);
  assert.equal(first.correct, 1);
  assert.ok(first.ewma > 0.5, 'a hit pulls the average up');
  record(store, 'degree:V', false);
  assert.equal(store.concepts['degree:V'].attempts, 2);
  assert.ok(store.concepts['degree:V'].ewma < first.ewma, 'a miss pulls it back down');
});

test('recent performance counts for more than old', () => {
  const store = emptyStore();
  for (let i = 0; i < 15; i++) record(store, 'degree:vi', false);
  const afterBadRun = store.concepts['degree:vi'].ewma;
  for (let i = 0; i < 5; i++) record(store, 'degree:vi', true);
  const now = store.concepts['degree:vi'];
  assert.ok(now.ewma > afterBadRun + 0.5, 'five right in a row shows up quickly');
  assert.ok(now.correct / now.attempts < 0.3, 'even though the lifetime figure is still poor');
});

test('weight favours what you miss, without abandoning what you know', () => {
  const store = emptyStore();
  for (let i = 0; i < 12; i++) {
    record(store, 'degree:IV', true);
    record(store, 'degree:vi', false);
  }
  const known = weightOf(store, 'degree:IV');
  const weak = weightOf(store, 'degree:vi');
  const unseen = weightOf(store, 'degree:iii');
  assert.ok(weak > unseen && unseen > known, `${weak} > ${unseen} > ${known}`);
  assert.ok(known >= 0.35, 'mastered material still comes up');
  assert.ok(weak <= 2.5, 'one bad concept cannot take over');
});

test('an attempt is credited to degrees, transitions, inversions and rhythm', () => {
  const exercise = generateExercise(levelSettings(3));
  const text = exercise.chords.map((c) => c.roman).join(' ');
  const result = gradeExercise(exercise, {
    chords: parseProgression(text).chords,
    rhythmPatternId: exercise.rhythmPatternId,
  });
  const list = outcomes(exercise, result);
  const names = list.map(([concept]) => concept);
  assert.ok(names.includes(`degree:${exercise.chords[0].roman}`));
  assert.ok(names.some((n) => n.startsWith('trans:')));
  assert.ok(names.includes(`rhythm:${exercise.rhythmPatternId}`));
  assert.ok(list.every(([, correct]) => correct === true), 'a right answer credits everything');
});

test('a wrong chord is not credited, and neither is its transition', () => {
  const exercise = generateExercise(levelSettings(2));
  const wrong = exercise.chords.map((c, i) => (i === 1 ? 'vii°' : c.roman)).join(' ');
  const result = gradeExercise(exercise, { chords: parseProgression(wrong).chords });
  const list = outcomes(exercise, result);
  const second = exercise.chords[1].roman;
  const entry = list.find(([concept]) => concept === `degree:${second}`);
  if (second !== 'vii°') assert.equal(entry[1], false);
  const transition = list.find(([c]) => c === `trans:${exercise.chords[0].roman}>${second}`);
  if (transition && second !== 'vii°') assert.equal(transition[1], false);
});

test('degree weights are keyed by the numerals the generator uses', () => {
  const store = emptyStore();
  for (let i = 0; i < 10; i++) record(store, 'degree:ii', false);
  const weights = degreeWeights(store, [0, 1, 4], (d) => ['I', 'ii', 'iii', 'IV', 'V'][d]);
  assert.ok(weights[1] > weights[0], 'the missed degree outweighs the others');
  assert.deepEqual(Object.keys(weights).map(Number), [0, 1, 4]);
});

test('the summary groups concepts and puts the weakest first', () => {
  const store = emptyStore();
  for (let i = 0; i < 6; i++) {
    record(store, 'degree:V', true);
    record(store, 'degree:vi', false);
    record(store, 'trans:I>IV', true);
    record(store, 'rhythm:q-q-h', false);
  }
  const view = summary(store);
  assert.equal(view.groups.degree[0].name, 'vi', 'worst first');
  assert.equal(view.groups.degree.length, 2);
  assert.equal(view.groups.trans.length, 1);
  assert.equal(view.groups.rhythm[0].accuracy, 0);
});

test('a store survives export and import', () => {
  const store = emptyStore();
  recordAttempt(store, generateExercise(levelSettings(1)), { slots: [], notes: [] });
  record(store, 'degree:IV', true);
  const restored = fromJSON(toJSON(store));
  assert.deepEqual(restored.concepts, store.concepts);
  assert.equal(restored.exercises, store.exercises);
});

test('rubbish is refused rather than silently swallowed', () => {
  assert.throws(() => fromJSON('{"hello":true}'), /ear trainer export/);
  assert.throws(() => fromJSON('not json'));
});

test('storage round-trips, and unreadable storage yields an empty store', () => {
  const storage = fakeStorage();
  const store = emptyStore();
  record(store, 'degree:V', true);
  assert.equal(save(store, storage), true);
  assert.equal(load(storage).concepts['degree:V'].attempts, 1);
  assert.deepEqual(load(null), emptyStore());
  assert.equal(save(store, fakeStorage(true)), false, 'a full quota is survivable');
  storage.setItem(Object.keys({ 'wet.v1': 1 })[0], 'garbage{');
  assert.deepEqual(load(storage).concepts, {}, 'corrupt data does not break the app');
});
