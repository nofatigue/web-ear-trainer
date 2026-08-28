import test from 'node:test';
import assert from 'node:assert/strict';
import { generateMelody, degreeOf } from '../src/melody.js';
import { generateExercise, levelSettings } from '../src/generator.js';
import { SCALES, noteNameToPc, CHORD_INTERVALS } from '../src/theory.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const exercises = (n, level = 6) => {
  const rng = seeded(31337);
  return Array.from({ length: n }, () => generateExercise(levelSettings(level), { rng }));
};

test('every note is in the key', () => {
  for (const exercise of exercises(60)) {
    for (const note of exercise.melody) {
      const step = ((note.midi - noteNameToPc(exercise.key.tonic)) % 12 + 12) % 12;
      assert.ok(SCALES[exercise.key.mode].includes(step), `${note.midi} in ${exercise.key.tonic}`);
    }
  }
});

test('the melody stays in a range a voice could manage', () => {
  for (const exercise of exercises(60)) {
    for (const note of exercise.melody) {
      assert.ok(note.midi >= 67 && note.midi <= 84, `${note.midi} out of range`);
    }
  }
});

test('it moves by step or small leap, never twice on the same note', () => {
  for (const exercise of exercises(60)) {
    const notes = exercise.melody;
    for (let i = 1; i < notes.length; i++) {
      const leap = Math.abs(notes[i].midi - notes[i - 1].midi);
      assert.ok(leap > 0, 'no repeated notes');
      assert.ok(leap <= 10, `leap of ${leap} semitones`);
    }
  }
});

test('a chord change lands on a note of that chord', () => {
  for (const exercise of exercises(40)) {
    for (const chord of exercise.chords) {
      const note = exercise.melody.find((n) => n.startBeat === chord.startBeat);
      if (!note) continue;
      const tones = new Set(chord.pitches.map((p) => p % 12));
      assert.ok(tones.has(note.midi % 12), `${note.midi % 12} is not in ${chord.label}`);
    }
  }
});

test('the last note is somewhere the line can stop', () => {
  for (const exercise of exercises(60)) {
    const last = exercise.melody[exercise.melody.length - 1];
    const chord = exercise.chords[exercise.chords.length - 1];
    const tones = new Set(chord.pitches.map((p) => p % 12));
    assert.ok(tones.has(last.midi % 12), 'ends on a chord tone');
  }
});

test('the melody covers the excerpt without gaps', () => {
  for (const exercise of exercises(30)) {
    const end = exercise.chords.reduce((max, c) => Math.max(max, c.startBeat + c.durationBeats), 0);
    let at = 0;
    for (const note of exercise.melody) {
      assert.equal(note.startBeat, at, 'notes follow each other');
      at += note.durationBeats;
    }
    assert.equal(at, end, 'and finish where the chords do');
  }
});

test('notes carry the scale degree they sound', () => {
  for (const exercise of exercises(20)) {
    for (const note of exercise.melody) {
      assert.equal(note.degree, degreeOf(note.midi, exercise.key));
      assert.ok(note.degree >= 0 && note.degree <= 6);
    }
  }
});

test('only levels that ask for a melody get one', () => {
  for (const level of [1, 2, 3, 4, 5]) {
    for (const exercise of exercises(5, level)) assert.equal(exercise.melody, null);
  }
  for (const exercise of exercises(5, 6)) assert.ok(exercise.melody.length > 0);
});

test('generation is deterministic for a given seed', () => {
  const a = generateExercise(levelSettings(6), { rng: seeded(9) });
  const b = generateExercise(levelSettings(6), { rng: seeded(9) });
  assert.deepEqual(a.melody, b.melody);
});
