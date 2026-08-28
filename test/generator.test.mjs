import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExercise, generateDegrees, levelSettings, LEVELS, MAJOR_KEYS } from '../src/generator.js';
import { patternBeats, getPattern } from '../src/rhythm.js';

/** Deterministic pseudo-random source, so failures are reproducible. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const sample = (levelId, n = 200) => {
  const settings = levelSettings(levelId);
  const rng = seeded(levelId * 7919);
  return Array.from({ length: n }, () => generateExercise(settings, { rng }));
};

test('every level produces progressions of its stated length and pool', () => {
  for (const level of LEVELS) {
    const settings = levelSettings(level.id);
    for (const exercise of sample(level.id)) {
      assert.equal(exercise.chords.length, settings.length, `level ${level.id} length`);
      for (const chord of exercise.chords) {
        assert.ok(settings.pool.includes(chord.degree), `level ${level.id} pool: ${chord.roman}`);
      }
    }
  }
});

test('progressions start on the tonic and never repeat a chord back to back', () => {
  for (const level of LEVELS) {
    for (const exercise of sample(level.id)) {
      const degrees = exercise.chords.map((c) => c.degree);
      assert.equal(degrees[0], 0, `level ${level.id} starts on I: ${degrees}`);
      for (let i = 1; i < degrees.length; i++) {
        assert.notEqual(degrees[i], degrees[i - 1], `level ${level.id} repeat: ${degrees}`);
      }
    }
  }
});

test('progressions end on a cadence — the tonic or the dominant', () => {
  for (const level of LEVELS) {
    for (const exercise of sample(level.id)) {
      const last = exercise.chords[exercise.chords.length - 1].degree;
      assert.ok(last === 0 || last === 4, `level ${level.id} ends on ${last}`);
    }
  }
});

test('levels 1 and 2 stay in C; level 3 transposes', () => {
  assert.ok(sample(1).every((x) => x.key.tonic === 'C'));
  assert.ok(sample(2).every((x) => x.key.tonic === 'C'));
  const keys = new Set(sample(3).map((x) => x.key.tonic));
  assert.ok(keys.size > 3, `level 3 uses several keys, saw ${[...keys].join(' ')}`);
  for (const key of keys) assert.ok(MAJOR_KEYS.includes(key));
});

test('each level offers real variety, not one progression', () => {
  for (const level of LEVELS) {
    const shapes = new Set(sample(level.id).map((x) => x.chords.map((c) => c.roman).join(' ')));
    assert.ok(shapes.size >= 2, `level ${level.id} produced ${shapes.size} shapes`);
  }
});

test('chords are voiced low to high with the bass an octave under the root', () => {
  for (const exercise of sample(3)) {
    for (const chord of exercise.chords) {
      assert.equal(chord.pitches.length, 4, 'bass plus a triad');
      assert.equal(chord.pitches[1] - chord.pitches[0], 12, 'bass doubles the root an octave down');
      const sorted = [...chord.pitches].sort((a, b) => a - b);
      assert.deepEqual(chord.pitches, sorted, 'ordered low to high');
      assert.ok(chord.pitches[0] >= 24 && chord.pitches[3] <= 84, 'stays in a sane register');
    }
  }
});

test('beat placements tile the bar without gaps or overlaps', () => {
  for (const exercise of sample(2)) {
    let expected = 0;
    for (const chord of exercise.chords) {
      assert.equal(chord.startBeat, expected, 'chords follow each other');
      assert.ok(chord.durationBeats > 0);
      expected += chord.durationBeats;
    }
    const pattern = getPattern(exercise.rhythmPatternId);
    assert.ok(pattern, `pattern ${exercise.rhythmPatternId} exists`);
    assert.equal(patternBeats(pattern), expected);
  }
});

test('concepts name every degree and every transition heard', () => {
  const exercise = sample(2, 1)[0];
  const romans = exercise.chords.map((c) => c.roman);
  for (const roman of romans) assert.ok(exercise.concepts.includes(`degree:${roman}`));
  for (let i = 1; i < romans.length; i++) {
    assert.ok(exercise.concepts.includes(`trans:${romans[i - 1]}>${romans[i]}`));
  }
});

test('generation is deterministic given a seeded rng', () => {
  const settings = levelSettings(3);
  const a = generateExercise(settings, { rng: seeded(42) });
  const b = generateExercise(settings, { rng: seeded(42) });
  assert.deepEqual(a, b);
});

test('a pool with no cadence available still yields a progression', () => {
  const degrees = generateDegrees(seeded(1), { pool: [1, 2, 5], length: 4 });
  assert.equal(degrees.length, 4);
  assert.ok(degrees.every((d) => [1, 2, 5].includes(d)));
});

test('an answer is voiced exactly as the real thing would have been', async () => {
  const { voiceChord, exerciseFromAnswer } = await import('../src/generator.js');
  const exercise = generateExercise(levelSettings(2), { rng: seeded(3) });
  const truth = exercise.chords.map((c) => ({ degree: c.degree, quality: c.quality }));
  const echo = exerciseFromAnswer(exercise, truth);
  assert.deepEqual(
    echo.chords.map((c) => c.pitches),
    exercise.chords.map((c) => c.pitches),
    'answering correctly sounds identical to the exercise',
  );
  assert.deepEqual(
    echo.chords.map((c) => [c.startBeat, c.durationBeats]),
    exercise.chords.map((c) => [c.startBeat, c.durationBeats]),
  );
  assert.equal(voiceChord({ tonic: 'C', mode: 'major' }, { degree: 0, quality: 'maj' }).pitches[0], 36);
});

test('a wrong answer keeps the beats of the chord it was answering', async () => {
  const { exerciseFromAnswer } = await import('../src/generator.js');
  const exercise = generateExercise(levelSettings(1), { rng: seeded(9) });
  const answer = [{ degree: 0, quality: 'maj' }, { degree: 4, quality: 'maj' }];
  const echo = exerciseFromAnswer(exercise, answer);
  assert.equal(echo.chords.length, 2, 'a chord left blank simply stays silent');
  assert.equal(echo.chords[1].startBeat, exercise.chords[1].startBeat);
});

test('chords written past the end of the excerpt are added on as further beats', async () => {
  const { exerciseFromAnswer } = await import('../src/generator.js');
  const exercise = generateExercise(levelSettings(1), { rng: seeded(11) }); // 3 chords
  const answer = Array.from({ length: 5 }, () => ({ degree: 0, quality: 'maj' }));
  const echo = exerciseFromAnswer(exercise, answer);
  assert.equal(echo.chords.length, 5);
  assert.equal(echo.chords[3].startBeat, 3);
  assert.equal(echo.chords[4].startBeat, 4);
});

test('an altered degree is voiced flat or sharp, not diatonic', async () => {
  const { voiceChord } = await import('../src/generator.js');
  const key = { tonic: 'C', mode: 'major' };
  const diatonic = voiceChord(key, { degree: 6, quality: 'min' });
  const flattened = voiceChord(key, { degree: 6, quality: 'maj', alter: -1 });
  assert.equal(flattened.pitches[1], diatonic.pitches[1] - 1, 'bVII sits a semitone below vii');
});
