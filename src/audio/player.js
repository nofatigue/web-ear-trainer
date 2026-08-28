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
    this.clock = null;
    /** Set to follow playback in beats; called with null when it stops. */
    this.onProgress = null;
  }

  get playing() {
    return this.scheduler.running;
  }

  stop() {
    this.scheduler.stop();
    this.timeline = null;
    this.clock = null;
    if (this.onProgress) this.onProgress(null);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  /**
   * Lay one exercise out as note events starting at `startTime`.
   * Returns the events, the sounding span of each chord (for the highlight)
   * and the time the last beat ends.
   */
  layout(exercise, startTime, { click = false, side = 'played' } = {}) {
    const engine = this.engine;
    const secondsPerBeat = 60 / exercise.bpm;
    const events = [];
    const spans = [];

    const totalBeats = exercise.chords.reduce(
      (max, c) => Math.max(max, c.startBeat + c.durationBeats), 0,
    );

    if (click) {
      for (let b = 0; b < totalBeats; b++) {
        const time = startTime + b * secondsPerBeat;
        events.push({
          time,
          fire: (t) => engine.playClick({ time: t, accent: b % exercise.meter.beats === 0 }),
        });
      }
    }

    exercise.chords.forEach((chord, index) => {
      const time = startTime + chord.startBeat * secondsPerBeat;
      const duration = chord.durationBeats * secondsPerBeat * 0.96;
      spans.push({ index, side, time, until: time + duration });
      for (const midi of chord.pitches) {
        // The bass sits a little lower in the mix than the upper voices.
        const gain = midi === chord.pitches[0] ? 0.19 : 0.16;
        events.push({ time, fire: (t) => engine.playNote({ midi, time: t, duration, gain }) });
      }
    });

    return { events, spans, endsAt: startTime + totalBeats * secondsPerBeat };
  }

  /**
   * Play an exercise.
   *
   * onChord(index, side) is driven off the audio clock by rAF, so the highlight
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

    const music = this.layout(exercise, musicStart, { click });
    this.run([...events, ...music.events], music.spans, music.endsAt, onChord, onDone, {
      start: musicStart,
      secondsPerBeat,
      totalBeats: (music.endsAt - musicStart) / secondsPerBeat,
    });
  }

  /**
   * Play the excerpt, then the same passage as the user answered it.
   *
   * Hearing the two next to each other is the point of the review screen: a
   * wrong chord you can hear is worth more than a red mark you can only read.
   */
  playComparison(exercise, answerExercise, { gap = 0.7, onChord = null, onDone = null } = {}) {
    this.stop();
    const start = this.engine.currentTime + LEAD_IN;
    const truth = this.layout(exercise, start, { side: 'played' });
    const yours = this.layout(answerExercise, truth.endsAt + gap, { side: 'yours' });
    this.run(
      [...truth.events, ...yours.events],
      [...truth.spans, ...yours.spans],
      yours.endsAt,
      onChord,
      onDone,
    );
  }

  run(events, spans, endsAt, onChord, onDone, clock = null) {
    this.timeline = spans;
    this.clock = clock;
    if (onChord || (clock && this.onProgress)) this.track(spans, onChord);
    this.scheduler.start(events, {
      endsAt,
      onDone: () => {
        if (onChord) onChord(null, null);
        if (this.onProgress) this.onProgress(null);
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
        if (onDone) onDone();
      },
    });
  }

  track(spans, onChord) {
    let last = null;
    const step = () => {
      const now = this.engine.currentTime;
      if (this.onProgress && this.clock) {
        const beat = (now - this.clock.start) / this.clock.secondsPerBeat;
        this.onProgress(Math.max(0, Math.min(this.clock.totalBeats, beat)));
      }
      const active = spans.find((s) => now >= s.time && now < s.until) || null;
      const key = active ? `${active.side}:${active.index}` : null;
      if (onChord && key !== last) {
        last = key;
        onChord(active ? active.index : null, active ? active.side : null);
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
