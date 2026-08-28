// Music theory primitives.
//
// This is the only module that knows music theory. Everything else in the app
// consumes the plain data it produces. Pure: no DOM, no audio, no randomness.

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

// Quality of the triad built on each scale degree.
export const DEGREE_QUALITIES = {
  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'],
  minor: ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'],
};

export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

export const CHORD_INTERVALS = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  halfdim7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

// Human-readable quality names, for review copy.
export const QUALITY_LABELS = {
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  dom7: 'dominant 7th',
  maj7: 'major 7th',
  min7: 'minor 7th',
  halfdim7: 'half-diminished 7th',
  dim7: 'diminished 7th',
};

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C", "F#", "Bb", "E♭" -> pitch class 0-11. Throws on nonsense. */
export function noteNameToPc(name) {
  const m = /^([A-Ga-g])([#b♯♭x]*)$/.exec(String(name).trim());
  if (!m) throw new Error(`not a note name: ${name}`);
  let pc = LETTER_PC[m[1].toUpperCase()];
  for (const ch of m[2]) {
    if (ch === '#' || ch === '♯') pc += 1;
    else if (ch === 'b' || ch === '♭') pc -= 1;
    else if (ch === 'x') pc += 2;
  }
  return ((pc % 12) + 12) % 12;
}

/** Pitch class -> name. Flat spellings for flat keys read better. */
export function pcToName(pc, { flats = false } = {}) {
  const i = ((pc % 12) + 12) % 12;
  return flats ? FLAT_NAMES[i] : SHARP_NAMES[i];
}

/** MIDI number -> name with octave, e.g. 60 -> "C4". */
export function midiToName(midi, opts) {
  return pcToName(midi % 12, opts) + (Math.floor(midi / 12) - 1);
}

/** Keys whose conventional spelling uses flats. */
export function keyUsesFlats(tonic) {
  return /b|♭/.test(tonic) || tonic === 'F';
}

/** MIDI number of the tonic in a given octave. C4 = 60. */
export function tonicMidi(tonic, octave = 3) {
  return (octave + 1) * 12 + noteNameToPc(tonic);
}

/**
 * Root of a diatonic degree, in the octave above the tonic.
 *
 * Every root therefore sits between the tonic and a seventh above it, which
 * keeps the whole progression in one register and the bass out of the mud.
 * Rearranging roots for smoother voice leading is M4's job, not this one's.
 */
export function degreeRootMidi(key, degreeIndex, octave = 3) {
  return tonicMidi(key.tonic, octave) + SCALES[key.mode][degreeIndex];
}

/** Quality of the diatonic triad on a degree. */
export function degreeQuality(mode, degreeIndex) {
  return DEGREE_QUALITIES[mode][degreeIndex];
}

/** Voiced pitches for a chord: MIDI numbers, low to high. */
export function chordPitches(rootMidi, quality, inversion = 0) {
  const intervals = CHORD_INTERVALS[quality];
  if (!intervals) throw new Error(`unknown quality: ${quality}`);
  const notes = intervals.map((i) => rootMidi + i);
  for (let n = 0; n < inversion % notes.length; n++) notes.push(notes.shift() + 12);
  return notes;
}

/** Roman numeral text for a degree + quality, e.g. (1, "min") -> "ii". */
export function formatRoman(degreeIndex, quality) {
  const upper = ROMAN[degreeIndex];
  const lower = upper.toLowerCase();
  switch (quality) {
    case 'maj': return upper;
    case 'min': return lower;
    case 'dim': return `${lower}°`;
    case 'aug': return `${upper}+`;
    case 'dom7': return `${upper}7`;
    case 'maj7': return `${upper}maj7`;
    case 'min7': return `${lower}7`;
    case 'halfdim7': return `${lower}ø7`;
    case 'dim7': return `${lower}°7`;
    default: throw new Error(`unknown quality: ${quality}`);
  }
}

/** Figured-bass suffix for an inversion of a triad or seventh chord. */
export function inversionFigure(inversion, quality) {
  const seventh = CHORD_INTERVALS[quality].length === 4;
  if (seventh) return ['7', '65', '43', '42'][inversion] || '7';
  return ['', '6', '64'][inversion] || '';
}

/**
 * How a chord is written: roman numeral plus figured bass, the way it would
 * appear under a stave — "V65", not a "V7" with a 65 stuck on the end.
 */
export function chordLabel(degreeIndex, quality, inversion = 0) {
  const roman = formatRoman(degreeIndex, quality);
  const seventh = CHORD_INTERVALS[quality].length === 4;
  if (!seventh) return roman + (['', '6', '64'][inversion] || '');
  if (inversion === 0) return roman;
  return roman.replace(/7$/, ['', '65', '43', '42'][inversion] || '7');
}
