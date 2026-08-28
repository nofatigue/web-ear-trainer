// Lookahead scheduler.
//
// Rhythm dictation is worthless if the playback itself is sloppy, which rules
// out driving notes from setTimeout. A coarse timer wakes up often enough to
// hand every event just ahead of it to the audio clock, which is sample
// accurate. (The classic "two clocks" pattern.)

const TICK_MS = 25;
const LOOKAHEAD = 0.1; // seconds of audio scheduled ahead of the timer

export class Scheduler {
  constructor(engine) {
    this.engine = engine;
    this.timer = null;
    this.queue = [];
    this.onDone = null;
    this.endsAt = 0;
  }

  get running() {
    return this.timer !== null;
  }

  /**
   * `events` are { time, fire(time) } with absolute AudioContext times, and
   * need not be sorted. `onDone` fires once the last one has sounded.
   */
  start(events, { onDone = null, endsAt = 0 } = {}) {
    this.stop();
    this.queue = [...events].sort((a, b) => a.time - b.time);
    this.onDone = onDone;
    this.endsAt = endsAt || (this.queue.length ? this.queue[this.queue.length - 1].time : 0);
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    const now = this.engine.currentTime;
    while (this.queue.length && this.queue[0].time < now + LOOKAHEAD) {
      const event = this.queue.shift();
      event.fire(Math.max(event.time, now));
    }
    if (!this.queue.length && now >= this.endsAt) {
      const done = this.onDone;
      this.stop();
      if (done) done();
    }
  }

  stop() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.queue = [];
    this.onDone = null;
  }
}
