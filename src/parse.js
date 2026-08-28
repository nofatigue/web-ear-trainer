// Answer text -> structured data.
//
// Deliberately forgiving: case carries quality, but whitespace, accidental
// spellings (b/♭, #/♯), quality spellings (o/°/dim, +/aug) and figured-bass
// shorthand all normalise to the same thing. Pure: no DOM.

import { noteNameToPc, SCALES } from './theory.js';

const ROMAN_TO_INDEX = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };

// Figure -> inversion. Order matters: longer figures are matched first.
const FIGURES = [
  ['65', 1, true], ['43', 2, true], ['42', 3, true], ['64', 2, false],
  ['63', 1, false], ['7', 0, true], ['6', 1, false], ['2', 3, true],
];

/**
 * Parse one roman numeral token.
 * Returns { degree, alter, quality, inversion, text } or { error, text }.
 */
export function parseChordToken(raw) {
  const text = String(raw).trim();
  if (!text) return { error: 'empty', text };

  let rest = text.replace(/[♯]/g, '#').replace(/[♭]/g, 'b');

  // Leading accidental: bIII, #iv
  let alter = 0;
  const acc = /^([#b]+)/.exec(rest);
  if (acc) {
    for (const ch of acc[1]) alter += ch === '#' ? 1 : -1;
    rest = rest.slice(acc[1].length);
  }

  const roman = /^[ivIV]+/.exec(rest);
  if (!roman) return { error: `"${text}" is not a roman numeral`, text };
  const word = roman[0];
  const degree = ROMAN_TO_INDEX[word.toLowerCase()];
  if (degree === undefined) return { error: `"${text}" is not a degree I-vii`, text };
  const isUpper = word === word.toUpperCase();
  let suffix = rest.slice(word.length);

  // Quality markers.
  let quality = null;
  const markers = [
    [/^(°|o|dim)/i, 'dim'],
    [/^(ø|hd)/i, 'halfdim7'],
    [/^(\+|aug)/i, 'aug'],
    [/^(maj|M|Δ)(?=7)/, 'maj7'],
  ];
  for (const [re, q] of markers) {
    const m = re.exec(suffix);
    if (m) { quality = q; suffix = suffix.slice(m[0].length); break; }
  }

  // Figured bass / seventh.
  let inversion = 0;
  let hasSeventh = false;
  let hasFigure = false;
  for (const [fig, inv, seventh] of FIGURES) {
    if (suffix.startsWith(fig)) {
      inversion = inv;
      hasSeventh = seventh;
      hasFigure = true;
      suffix = suffix.slice(fig.length);
      break;
    }
  }

  if (suffix.trim()) return { error: `don't understand "${suffix}" in "${text}"`, text };

  if (quality === 'maj7') hasSeventh = true;
  if (quality === null) quality = isUpper ? 'maj' : 'min';

  if (hasSeventh) {
    if (quality === 'maj7') quality = 'maj7';
    else if (quality === 'dim') quality = 'dim7';
    else if (quality === 'halfdim7') quality = 'halfdim7';
    else if (quality === 'min') quality = 'min7';
    else if (quality === 'maj') quality = 'dom7';
  } else if (quality === 'halfdim7') {
    quality = 'dim'; // "ø" without a figure is loose talk for a diminished sound
  }

  // A plain "V" says nothing either way about the inversion, so the field is
  // null rather than 0: it is what the user claimed, not a default.
  return { degree, alter, quality, inversion: hasFigure ? inversion : null, hasFigure, text };
}

/**
 * Parse a whole progression: "I IV V V", "I | IV | V7 | I", "i-VI-III-VII".
 * Returns { chords, errors } — chords are the tokens that parsed.
 */
export function parseProgression(input) {
  const tokens = String(input).split(/[\s,|/–—-]+/).filter(Boolean);
  const chords = [];
  const errors = [];
  for (const token of tokens) {
    const parsed = parseChordToken(token);
    if (parsed.error) errors.push(parsed.error);
    else chords.push(parsed);
  }
  return { chords, errors };
}

/**
 * Parse a melody line as scale degrees ("1 2 3 5") or note names ("C D E G").
 * Returns { notes, errors }; notes carry whichever of degree/pc was given.
 */
export function parseMelody(input) {
  const tokens = String(input).split(/[\s,|]+/).filter(Boolean);
  const notes = [];
  const errors = [];
  for (const token of tokens) {
    if (/^[1-7]$/.test(token)) {
      notes.push({ degree: Number(token) - 1, text: token });
    } else {
      try {
        notes.push({ pc: noteNameToPc(token), text: token });
      } catch {
        errors.push(`"${token}" is neither a scale degree 1-7 nor a note name`);
      }
    }
  }
  return { notes, errors };
}

/**
 * One note, written either way: a note name ("Bb") or a scale degree ("3").
 * Returns a pitch class, or null for an empty field.
 */
export function parsePitch(text, key) {
  const token = String(text ?? '').trim();
  if (!token) return null;
  if (/^[1-7]$/.test(token)) {
    const step = SCALES[key.mode][Number(token) - 1];
    return (noteNameToPc(key.tonic) + step) % 12;
  }
  try {
    return noteNameToPc(token);
  } catch {
    return null;
  }
}
