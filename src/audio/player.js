// Exercise -> scheduled sound.
//
// Everything here converts beats to seconds and hands flat note events to the
// scheduler. Nothing here knows music theory; it reads the pitches the
// generator already resolved.

import { Scheduler } from './scheduler.js';
import { tonicMidi, chordPitches } from '../theory.js';

const LEAD_IN = 0.12; // a beat of slack so the first note is never clipped

export class Player {
  constructor(engine) {
    this.engine = engine;
    this.scheduler = new Scheduler(engine);
    this.timeline = null;
    this.frame = null;
  }

  get playing() {
    return this.scheduler.running;
  }

  stop() {
    this.scheduler.stop();
    this.timeline = null;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * Play an exercise.
   *
   * onChord(index|null) is driven off the audio clock by rAF, so the highlight
   * on screen tracks what is actually sounding rather than what was requested.
   */
  play(exercise, { countIn = true, click = false, onChord = null, onDone = null } = {}) {
    this.stop();
    const engine = this.engine;
    const secondsPerBeat = 60 / exercise.bpm;
    const beatsOfCountIn = countIn ? exercise.meter.beats : 0;
    const start = engine.currentTime + LEAD_IN;
    const musicStart = start + beatsOfCountIn * secondsPerBeat;

    const events = [];

    for (let b = 0; b < beatsOfCountIn; b++) {
      const time = start + b * secondsPerBeat;
      events.push({ time, fire: (t) => engine.playClick({ time: t, accent: b === 0 }) });
    }

    const totalBeats = exercise.chords.reduce(
      (max, c) => Math.max(max, c.startBeat + c.durationBeats), 0,
    );

    if (click) {
      for (let b = 0; b < totalBeats; b++) {
        const time = musicStart + b * secondsPerBeat;
        events.push({
          time,
          fire: (t) => engine.playClick({ time: t, accent: b % exercise.meter.beats === 0 }),
        });
      }
    }

    const spans = [];
    exercise.chords.forEach((chord, index) => {
      const time = musicStart + chord.startBeat * secondsPerBeat;
      const duration = chord.durationBeats * secondsPerBeat * 0.96;
      spans.push({ index, time, until: time + duration });
      for (const midi of chord.pitches) {
        // The bass sits a little lower in the mix than the upper voices.
        const gain = midi === chord.pitches[0] ? 0.19 : 0.16;
        events.push({ time, fire: (t) => engine.playNote({ midi, time: t, duration, gain }) });
      }
    });

    const endsAt = musicStart + totalBeats * secondsPerBeat;
    this.timeline = spans;
    if (onChord) this.track(spans, onChord);

    this.scheduler.start(events, {
      endsAt,
      onDone: () => {
        if (onChord) onChord(null);
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        if (onDone) onDone();
      },
    });
  }

  track(spans, onChord) {
    let last = -2;
    const step = () => {
      const now = this.engine.currentTime;
      const active = spans.find((s) => now >= s.time && now < s.until);
      const index = active ? active.index : null;
      if (index !== last) {
        last = index;
        onChord(index);
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Tonic reference: the tonic note, then the tonic triad. Never graded. */
  playTonic(exercise, { onDone = null } = {}) {
    this.stop();
    const engine = this.engine;
    const root = tonicMidi(exercise.key.tonic, 3);
    const quality = exercise.key.mode === 'major' ? 'maj' : 'min';
    const start = engine.currentTime + LEAD_IN;
    const events = [
      { time: start, fire: (t) => engine.playNote({ midi: root, time: t, duration: 0.5, gain: 0.2 }) },
    ];
    for (const midi of [root - 12, ...chordPitches(root, quality)]) {
      events.push({
        time: start + 0.62,
        fire: (t) => engine.playNote({ midi, time: t, duration: 1.1, gain: 0.17 }),
      });
    }
    this.scheduler.start(events, { endsAt: start + 1.75, onDone });
  }

  /** Play a single chord of an exercise, for the review screen. */
  playChord(chord, { duration = 1.1 } = {}) {
    const engine = this.engine;
    const time = engine.currentTime + 0.02;
    for (const midi of chord.pitches) {
      engine.playNote({ midi, time, duration, gain: 0.18 });
    }
  }
}
