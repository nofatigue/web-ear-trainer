// Web Audio voices and bus.
//
// A note is a triangle plus a slightly detuned sine through an ADSR gain, into
// a master bus with a limiter so four-voice chords don't clip. The audio layer
// takes plain { midi, time, duration } events, so a sampled instrument can
// replace these oscillators later without the quiz logic noticing.

const ATTACK = 0.012;
const DECAY = 0.14;
const SUSTAIN = 0.62;
const RELEASE = 0.22;

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  /** Must be called from a user gesture: browsers start contexts suspended. */
  async start() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error('This browser has no Web Audio support.');
      this.ctx = new Ctx();

      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      this.master.connect(limiter);
      limiter.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    return this.ctx;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  get ready() {
    return Boolean(this.ctx) && this.ctx.state === 'running';
  }

  /** Schedule one note. `time` is an absolute AudioContext time. */
  playNote({ midi, time, duration = 1, gain = 0.22 }) {
    if (!this.ctx) return null;
    const freq = midiToFreq(midi);
    const env = this.ctx.createGain();
    env.connect(this.master);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const shimmer = this.ctx.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.value = freq;
    shimmer.detune.value = 6;

    const blend = this.ctx.createGain();
    blend.gain.value = 0.5;
    shimmer.connect(blend);
    blend.connect(env);
    osc.connect(env);

    const g = env.gain;
    const peak = Math.max(gain, 0.0001);
    g.setValueAtTime(0.0001, time);
    g.linearRampToValueAtTime(peak, time + ATTACK);
    g.linearRampToValueAtTime(peak * SUSTAIN, time + ATTACK + DECAY);
    g.setValueAtTime(peak * SUSTAIN, time + duration);
    g.exponentialRampToValueAtTime(0.0001, time + duration + RELEASE);

    const stopAt = time + duration + RELEASE + 0.02;
    osc.start(time);
    shimmer.start(time);
    osc.stop(stopAt);
    shimmer.stop(stopAt);
    const voice = { osc, shimmer, env };
    osc.onended = () => {
      env.disconnect();
      blend.disconnect();
    };
    return voice;
  }

  /** Metronome click. Accented clicks mark the downbeat. */
  playClick({ time, accent = false }) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1560 : 1040;
    const env = this.ctx.createGain();
    const peak = accent ? 0.1 : 0.055;
    env.gain.setValueAtTime(0.0001, time);
    env.gain.linearRampToValueAtTime(peak, time + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.connect(env);
    env.connect(this.master);
    osc.start(time);
    osc.stop(time + 0.06);
    osc.onended = () => env.disconnect();
  }
}
