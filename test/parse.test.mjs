import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChordToken, parseProgression, parseMelody } from '../src/parse.js';

const at = (text) => {
  const parsed = parseChordToken(text);
  assert.equal(parsed.error, undefined, `${text} should parse: ${parsed.error}`);
  return parsed;
};

test('case carries quality', () => {
  assert.equal(at('I').quality, 'maj');
  assert.equal(at('vi').quality, 'min');
  assert.equal(at('IV').degree, 3);
  assert.equal(at('vii').degree, 6);
});

test('quality markers are spelled several ways', () => {
  for (const text of ['vii°', 'viio', 'viidim', 'VIIdim']) {
    assert.equal(at(text).quality, 'dim', text);
  }
  assert.equal(at('V+').quality, 'aug');
  assert.equal(at('Vaug').quality, 'aug');
});

test('a numeral with no figure claims nothing about the inversion', () => {
  assert.equal(at('I').inversion, null);
  assert.equal(at('vi').inversion, null);
  assert.equal(at('V7').inversion, 0, 'but a seventh chord figure does say root position');
});

test('sevenths and figured bass become quality plus inversion', () => {
  assert.deepEqual(
    (({ degree, quality, inversion }) => ({ degree, quality, inversion }))(at('V7')),
    { degree: 4, quality: 'dom7', inversion: 0 },
  );
  assert.equal(at('V65').inversion, 1);
  assert.equal(at('V43').inversion, 2);
  assert.equal(at('V42').inversion, 3);
  assert.equal(at('IV6').inversion, 1);
  assert.equal(at('I64').inversion, 2);
  assert.equal(at('ii7').quality, 'min7');
  assert.equal(at('Imaj7').quality, 'maj7');
  assert.equal(at('viiø7').quality, 'halfdim7');
  assert.equal(at('vii°7').quality, 'dim7');
});

test('accidentals alter the degree', () => {
  assert.equal(at('bVII').alter, -1);
  assert.equal(at('bVII').degree, 6);
  assert.equal(at('#iv').alter, 1);
  assert.equal(at('♭III').alter, -1);
});

test('nonsense is rejected with a message, not a throw', () => {
  for (const text of ['Q', 'viii', '', 'V9x']) {
    assert.ok(parseChordToken(text).error, `${text} should be an error`);
  }
});

test('progressions split on any reasonable separator', () => {
  for (const text of ['I IV V I', 'I | IV | V | I', 'I,IV,V,I', 'I-IV-V-I']) {
    const { chords, errors } = parseProgression(text);
    assert.equal(errors.length, 0, text);
    assert.deepEqual(chords.map((c) => c.degree), [0, 3, 4, 0], text);
  }
});

test('a bad token does not lose the good ones', () => {
  const { chords, errors } = parseProgression('I zz V');
  assert.equal(chords.length, 2);
  assert.equal(errors.length, 1);
});

test('melody accepts scale degrees or note names', () => {
  assert.deepEqual(parseMelody('1 2 3 5').notes.map((n) => n.degree), [0, 1, 2, 4]);
  assert.deepEqual(parseMelody('C D E G').notes.map((n) => n.pc), [0, 2, 4, 7]);
  assert.equal(parseMelody('C 9 E').errors.length, 1);
});
