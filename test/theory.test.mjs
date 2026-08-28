import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteNameToPc, midiToName, tonicMidi, degreeRootMidi, degreeQuality,
  chordPitches, formatRoman, inversionFigure, keyUsesFlats,
} from '../src/theory.js';

test('note names parse, including both accidental spellings', () => {
  assert.equal(noteNameToPc('C'), 0);
  assert.equal(noteNameToPc('F#'), 6);
  assert.equal(noteNameToPc('Gb'), 6);
  assert.equal(noteNameToPc('B♭'), 10);
  assert.equal(noteNameToPc('Cb'), 11, 'wraps below C');
  assert.throws(() => noteNameToPc('H'));
});

test('middle C is MIDI 60', () => {
  assert.equal(tonicMidi('C', 4), 60);
  assert.equal(midiToName(60), 'C4');
  assert.equal(midiToName(70, { flats: true }), 'Bb4');
});

test('diatonic degrees carry the right qualities', () => {
  const major = [0, 1, 2, 3, 4, 5, 6].map((d) => degreeQuality('major', d));
  assert.deepEqual(major, ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim']);
  assert.equal(degreeQuality('minor', 1), 'dim');
});

test('degree roots sit in the octave above the tonic', () => {
  const key = { tonic: 'C', mode: 'major' };
  const roots = [0, 1, 2, 3, 4, 5, 6].map((d) => degreeRootMidi(key, d, 3));
  const tonic = tonicMidi('C', 3);
  for (const root of roots) {
    assert.ok(root >= tonic && root < tonic + 12, `${root} is within an octave of ${tonic}`);
  }
  assert.deepEqual(roots, [48, 50, 52, 53, 55, 57, 59], 'C major, C3 up to B3');
  assert.equal(roots[4] - roots[0], 7, 'V is a fifth above I');
  assert.ok(roots.every((r, i) => i === 0 || r > roots[i - 1]), 'roots ascend');
});

test('chords voice low to high, and invert by rotation', () => {
  assert.deepEqual(chordPitches(60, 'maj'), [60, 64, 67]);
  assert.deepEqual(chordPitches(60, 'min'), [60, 63, 67]);
  assert.deepEqual(chordPitches(60, 'maj', 1), [64, 67, 72]);
  assert.deepEqual(chordPitches(60, 'dom7', 2), [67, 70, 72, 76]);
  const pitches = chordPitches(60, 'maj7', 3);
  assert.deepEqual([...pitches].sort((a, b) => a - b), pitches, 'stays ordered');
});

test('roman numerals render conventionally', () => {
  assert.equal(formatRoman(0, 'maj'), 'I');
  assert.equal(formatRoman(1, 'min'), 'ii');
  assert.equal(formatRoman(6, 'dim'), 'vii°');
  assert.equal(formatRoman(4, 'dom7'), 'V7');
  assert.equal(formatRoman(1, 'halfdim7'), 'iiø7');
});

test('figured bass follows chord size', () => {
  assert.equal(inversionFigure(1, 'maj'), '6');
  assert.equal(inversionFigure(2, 'maj'), '64');
  assert.equal(inversionFigure(1, 'dom7'), '65');
  assert.equal(keyUsesFlats('Bb'), true);
  assert.equal(keyUsesFlats('F'), true);
  assert.equal(keyUsesFlats('G'), false);
});
