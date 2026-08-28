import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERNS, getPattern, patternBeats, patternsForLength, placements, beatGrid, rhythmChoices,
  askablePatterns,
} from '../src/rhythm.js';

test('every pattern fills a whole number of 4/4 bars', () => {
  for (const pattern of PATTERNS) {
    assert.equal(patternBeats(pattern) % 4, 0, `${pattern.id} is ${patternBeats(pattern)} beats`);
  }
});

test('pattern ids are unique, and so are their shapes', () => {
  const ids = new Set();
  const shapes = new Set();
  for (const pattern of PATTERNS) {
    assert.ok(!ids.has(pattern.id), `duplicate id ${pattern.id}`);
    ids.add(pattern.id);
    const shape = pattern.beats.join(',');
    assert.ok(!shapes.has(shape), `${pattern.id} duplicates the shape ${shape}`);
    shapes.add(shape);
  }
});

test('durations land on the eighth-note grid', () => {
  for (const pattern of PATTERNS) {
    for (const beat of pattern.beats) {
      assert.equal((beat * 2) % 1, 0, `${pattern.id} has a ${beat}-beat chord`);
      assert.ok(beat > 0);
    }
  }
});

test('tiers describe what they claim: tier 1 and 2 stay on the beat', () => {
  for (const pattern of PATTERNS.filter((p) => p.tier < 3)) {
    let at = 0;
    for (const beat of pattern.beats) {
      assert.equal(at % 1, 0, `${pattern.id} has an onset off the beat at ${at}`);
      at += beat;
    }
  }
  const syncopated = PATTERNS.filter((p) => p.tier === 3);
  assert.ok(syncopated.length > 0, 'there are some harder ones');
  for (const pattern of syncopated) {
    let at = 0;
    const offs = pattern.beats.filter((b) => { const off = at % 1 !== 0; at += b; return off; });
    assert.ok(offs.length > 0, `${pattern.id} is tier 3 but never leaves the beat`);
  }
});

test('placements tile the pattern without gaps', () => {
  for (const pattern of PATTERNS) {
    let expected = 0;
    for (const p of placements(pattern)) {
      assert.equal(p.startBeat, expected);
      expected += p.durationBeats;
    }
    assert.equal(expected, patternBeats(pattern));
  }
});

test('the beat grid marks an onset per chord and holds the rest', () => {
  const grid = beatGrid(getPattern('q-dq-e-q'));
  assert.equal(grid.length, 8, 'four beats, eighth-note cells');
  assert.deepEqual(grid.map((c) => c.kind === 'onset'), [true, false, true, false, false, true, true, false]);
  assert.equal(grid.filter((c) => c.kind === 'onset').length, 4, 'one onset per chord');
  assert.ok(grid[0].downbeat);
});

test('filtering by tier never offers something harder than asked', () => {
  for (const pattern of patternsForLength(4, 1)) assert.equal(pattern.tier, 1);
  assert.ok(patternsForLength(4, 3).length > patternsForLength(4, 1).length);
  assert.deepEqual(patternsForLength(7), [], 'no patterns for lengths we do not generate');
});

test('every pattern can offer four indistinguishable-by-shape choices', () => {
  for (const pattern of PATTERNS) {
    const choices = rhythmChoices(pattern, { count: 4, rng: () => 0.5 });
    assert.equal(choices.length, 4, `${pattern.id} offered ${choices.length}`);
    assert.ok(choices.includes(pattern), `${pattern.id} is among its own choices`);
    for (const choice of choices) {
      assert.equal(choice.beats.length, pattern.beats.length, 'same chord count');
      assert.equal(patternBeats(choice), patternBeats(pattern), 'same total length');
    }
    assert.equal(new Set(choices.map((c) => c.id)).size, 4, 'no repeats');
  }
});

test('askable patterns are only those with a real choice list behind them', () => {
  const askable = askablePatterns(4, 2);
  assert.ok(askable.length > 0);
  for (const pattern of askable) {
    const choices = rhythmChoices(pattern, { maxTier: 2, rng: () => 0.5 });
    assert.equal(choices.length, 4, `${pattern.id}`);
  }
  assert.ok(
    !askable.some((p) => p.id === 'q-q-q-q'),
    'four on-the-beat chords in one bar has only one possible answer, so it is never asked',
  );
});

test('distractors never come from a harder tier than the excerpt could be', () => {
  for (const pattern of askablePatterns(4, 2)) {
    for (const choice of rhythmChoices(pattern, { maxTier: 2, rng: () => 0.3 })) {
      assert.ok(choice.tier <= 2, `${choice.id} is tier ${choice.tier}`);
    }
  }
});
