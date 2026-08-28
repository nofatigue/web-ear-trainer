import test from 'node:test';
import assert from 'node:assert/strict';
import { voiceProgression } from '../src/voicing.js';
import { degreeRootMidi, chordPitches, CHORD_INTERVALS } from '../src/theory.js';

const KEY = { tonic: 'C', mode: 'major' };

function progression(degrees, qualities = null) {
  return degrees.map((degree, i) => ({
    degree,
    quality: qualities ? qualities[i] : ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'][degree],
    rootMidi: degreeRootMidi(KEY, degree),
  }));
}

/** Total distance the upper voices travel across a voiced progression. */
function movement(voiced) {
  let total = 0;
  for (let i = 1; i < voiced.length; i++) {
    const previous = voiced[i - 1].pitches.slice(1);
    const next = voiced[i].pitches.slice(1);
    for (let v = 0; v < Math.min(previous.length, next.length); v++) {
      total += Math.abs(next[v] - previous[v]);
    }
  }
  return total;
}

test('voice leading moves less than stacking root positions does', () => {
  const chords = progression([0, 3, 4, 0]);
  const led = voiceProgression(chords);
  const blocked = voiceProgression(chords, { allowInversions: false });
  assert.ok(movement(led) < movement(blocked), `${movement(led)} should beat ${movement(blocked)}`);
});

test('the pitches of a voicing really are that chord', () => {
  for (const degrees of [[0, 1, 4, 0], [0, 5, 3, 4, 0], [0, 3, 6, 0]]) {
    for (const chord of voiceProgression(progression(degrees))) {
      const expected = new Set(CHORD_INTERVALS[chord.quality].map((i) => (chord.rootMidi + i) % 12));
      const heard = new Set(chord.pitches.map((p) => p % 12));
      assert.deepEqual([...heard].sort(), [...expected].sort(), `${chord.degree} ${chord.quality}`);
    }
  }
});

test('the bass is the note the inversion names', () => {
  for (const chord of voiceProgression(progression([0, 1, 4, 5, 3, 0]))) {
    const intervals = CHORD_INTERVALS[chord.quality];
    const bassPc = chord.pitches[0] % 12;
    const expected = (chord.rootMidi + intervals[chord.inversion]) % 12;
    assert.equal(bassPc, expected, `inversion ${chord.inversion} should put that note lowest`);
  }
});

test('voices are ordered and the bass stays underneath', () => {
  for (const chord of voiceProgression(progression([0, 2, 5, 1, 4, 0]))) {
    const sorted = [...chord.pitches].sort((a, b) => a - b);
    assert.deepEqual(chord.pitches, sorted);
    assert.equal(chord.pitches[1] - chord.pitches[0], 12, 'the bass doubles the lowest voice');
  }
});

test('everything lands in a range someone could actually sing or play', () => {
  for (const degrees of [[0, 1, 2, 3, 4, 5], [0, 6, 4, 0], [0, 5, 1, 4, 0]]) {
    for (const chord of voiceProgression(progression(degrees))) {
      assert.ok(chord.pitches[0] >= 33 && chord.pitches[0] <= 60, `bass ${chord.pitches[0]}`);
      const top = chord.pitches[chord.pitches.length - 1];
      assert.ok(top >= 55 && top <= 84, `top ${top}`);
    }
  }
});

test('the outer chords stay in root position', () => {
  for (const degrees of [[0, 1, 4, 0], [0, 5, 3, 4], [0, 2, 3, 1, 4, 0]]) {
    const voiced = voiceProgression(progression(degrees));
    assert.equal(voiced[0].inversion, 0, 'an excerpt opens on solid ground');
    assert.equal(voiced[voiced.length - 1].inversion, 0, 'and lands on it');
  }
});

test('six-four chords stay rare rather than merely convenient', () => {
  const counts = [0, 0, 0, 0];
  for (const degrees of [[0, 1, 4, 0], [0, 5, 3, 4, 0], [0, 3, 1, 4, 0], [0, 2, 5, 4, 0], [0, 6, 1, 4, 0]]) {
    for (const chord of voiceProgression(progression(degrees))) counts[chord.inversion] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0);
  assert.ok(counts[2] / total < 0.1, `six-fours were ${(100 * counts[2] / total).toFixed(0)}% of chords`);
  assert.ok(counts[1] > 0, 'first inversions do get used');
});

test('a forced inversion is honoured, and only the octave is chosen', () => {
  const chords = progression([0, 3, 4, 0]).map((c) => ({ ...c, forceInversion: 1 }));
  const voiced = voiceProgression(chords);
  assert.ok(voiced.every((c) => c.inversion === 1), 'even the outer chords');
  for (const chord of voiced) {
    const expected = chordPitches(chord.rootMidi, chord.quality, 1).map((p) => p % 12);
    assert.deepEqual(chord.pitches.slice(1).map((p) => p % 12), expected);
  }
});

test('sevenths keep all four notes', () => {
  const voiced = voiceProgression(progression([0, 1, 4, 0], ['maj', 'min7', 'dom7', 'maj']));
  assert.equal(voiced[1].pitches.length, 5, 'bass plus four voices');
  assert.equal(new Set(voiced[2].pitches.map((p) => p % 12)).size, 4);
});
