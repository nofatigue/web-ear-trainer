# Web Ear Trainer — Plan

A browser ear trainer built around **chord-progression dictation**. The app plays a
short harmonic excerpt (a progression, optionally with a melody on top), and the
user fills in an answer sheet describing what they heard: the rhythm, the chords,
their qualities, optionally inversions / bass notes / top voicing, and optionally
the melody. Each field is graded separately and partial credit is awarded.

Stack: **vanilla JS (ES modules), no build step**, Web Audio oscillators for sound,
`localStorage` for stats and weighted drilling. Deployable as static files to
GitHub Pages.

**Status: M0–M7 shipped.** All six levels, the rhythm question, voice-led
inversions and sevenths, melody dictation, per-concept stats with weighted
drilling, and offline support. Where the build diverged from this plan, the
plan has been corrected below and the reason noted.

---

## 1. The exercise loop

```
    settings ──▶ generate ──▶ play ──▶ answer sheet ──▶ grade ──▶ review ──┐
       ▲                                    ▲                              │
       └──────────────── stats update / next exercise ◀────────────────────┘
```

1. **Context.** A tonic reference is played first (tonic note, then the I chord)
   so the user has a key centre. Replayable at any time — it is never graded.
2. **Playback.** The progression plays at a fixed tempo in a fixed meter, with a
   count-in click. Replays are unlimited but counted; the count is stored with
   the attempt so "got it in one" can be distinguished from "got it in six".
3. **Answering.** The answer sheet is a stack of sections, each independently
   optional. The user submits when ready; unattempted optional sections are
   excluded from the score rather than counted wrong.
4. **Grading.** Field-by-field, index-aligned, with per-field feedback.
5. **Review.** Correct answer shown next to the user's, each chord replayable in
   isolation, and a "play what I answered" button so the user can *hear* the
   difference between their answer and the truth. This is the single most
   valuable feedback feature in an ear trainer — worth building early.

---

## 2. Data model

The exercise object is the contract between the generator, the player, the answer
sheet and the grader. Everything else is derived from it.

```js
// An exercise
{
  id: "x_8f21",
  key: { tonic: "C", mode: "major" },   // mode: "major" | "minor"
  meter: { beats: 4, unit: 4 },
  bpm: 84,
  chords: [
    {
      degree: "I",          // roman numeral, case carries quality: I ii iii IV V vi vii
      quality: "maj",       // "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7" | "halfdim7"
      inversion: 0,         // 0 = root, 1 = first (6), 2 = second (6-4), 3 = third (4-2)
      pitches: [48, 55, 64, 67],   // MIDI numbers, low → high, as actually voiced
      startBeat: 0,
      durationBeats: 2
    },
    // ...
  ],
  melody: [                 // null when the exercise has no melody
    { midi: 72, degree: 1, startBeat: 0, durationBeats: 1 },
    // ...
  ],
  rhythmPatternId: "q-q-h",  // id into the rhythm pattern library
  concepts: ["degree:IV", "trans:I>IV", "inv:1", "rhythm:q-q-h", ...]  // for stats
}
```

```js
// A user answer — every field optional
{
  rhythmPatternId: "q-q-h" | null,
  chords: [ { degree: "I", quality: "maj", inversion: 1|null,
              bass: "E"|null, top: "G"|null } , ... ],
  melody: [ { degree: 1 } | { midi: 72 }, ... ] | null,
  replays: 3,
  elapsedMs: 41200
}
```

Derived fields (`pitches`, `concepts`) are computed by the generator so the
player and grader never re-derive theory. **Rule: only `theory.js` knows music
theory; everything else consumes plain data.**

---

## 3. Modules

No build step, so these are plain ES modules loaded by `index.html`. Note that
ES modules require an HTTP origin — `python3 -m http.server` for local dev,
`file://` will not work.

```
index.html
styles.css
src/
  app.js              state machine + wiring; the only module that knows the DOM tree
  theory.js           notes, MIDI ↔ name, scales, chord construction, roman numerals,
                      inversions, figured bass. Pure, no DOM, no audio.
  parse.js            "I IV V V", "V65", "ii°7", "1 2 3 5", "C D E G" → structured answers
  rhythm.js           rhythm pattern library, beat grid ↔ pattern id
  voicing.js          voice-leading: choose octaves/inversions minimising voice movement
  generator.js        exercise generation from settings + stats weights
  audio/
    engine.js         AudioContext, master bus, ADSR voice, limiter
    scheduler.js      lookahead scheduler (setTimeout tick + currentTime scheduling)
    player.js         exercise → scheduled note events; play / stop / play one chord
  grading.js          exercise + answer → per-field result tree + score
  stats.js            localStorage read/write, per-concept accuracy, drill weights
  ui/
    answer-sheet.js   the sections below, each self-contained
    review.js         result rendering + replay-your-answer
    settings.js       difficulty, key, options toggles
test/
  theory.test.mjs     node --test, no dependencies
  parse.test.mjs
  grading.test.mjs
  generator.test.mjs
```

Tests use Node's built-in runner (`node --test test/`) against the same ES
modules the browser loads — pure modules only, no DOM or audio in tests.

---

## 4. Generation

Random chords sound random. The generator uses **functional harmony** so the
exercises sound like music, which is what makes them learnable.

- **Transition table.** Weighted successors per degree, e.g.
  `I → {IV, V, vi, ii}`, `ii → {V, vii°}`, `V → {I, vi}`, `IV → {V, I, ii}`.
  A progression starts on I (or vi in minor) and ends on a cadence (V–I, IV–I,
  or a half cadence on V), so the excerpt has a shape.
- **Voicing.** Four voices (bass + three upper). For each chord, pick the
  octave placement and inversion minimising total upper-voice movement from the
  previous chord, keeping voices inside singable ranges and avoiding voice
  crossing. Cheap to implement (score a handful of candidate voicings, pick the
  best) and it makes inversion questions meaningful rather than arbitrary.
  Movement alone is not enough, though: the search also pays a charge per
  inversion, or six-four chords turn up wherever they save a semitone and the
  ear learns a prior that is wrong. The outer chords stay in root position.
- **Rhythm.** A pattern from the library assigns `startBeat`/`durationBeats` to
  the chords. Patterns are ids like `q-q-h` (quarter, quarter, half) so both the
  generator and the rhythm question reference the same objects.
- **Melody** (optional): chord tones on strong beats, stepwise passing/neighbour
  tones on weak beats, leaps constrained to ≤ a fifth, staying in key.
- **Weighting.** Concept weights from `stats.js` bias the choice of degrees,
  transitions, inversions and rhythm patterns toward the user's weak spots
  (see §7).

---

## 5. Answer sheet

Each section is skippable. Sections beyond the progression are off by default and
enabled in settings as the user levels up.

| Section | Input | Graded as |
|---|---|---|
| **Rhythm** | Pick from 4–6 candidate patterns, rendered as a beat grid (v1). Tap-to-enter is a later upgrade. | 1 point, exact match |
| **Chord count** | Implicit — the number of slots the user fills | folded into progression alignment |
| **Progression** | Free-text field (`I IV V V`) **and** per-slot chips, kept in sync. Text is the fast path, chips are the discoverable one. | 1 point per slot, degree |
| **Quality** | Carried by the roman numeral case/symbol, editable per slot (maj / min / dim / aug / 7 chips) | 1 point per slot, quality |
| **Inversion** | Per-slot: root / 6 / 6-4 / 4-2, or figured-bass text (`V65`) | 0.5 per slot |
| **Bass note** | Per-slot note name or scale degree | 0.5 per slot |
| **Top voice** | Per-slot note name or scale degree | 0.5 per slot |
| **Melody** | Text (`1 2 3 5` degrees or `C D E G` names) plus an on-screen keyboard | 1 point per note |

Free text goes through `parse.js`, which is deliberately forgiving: case is
meaningful for quality but whitespace, `b`/`♭`, `#`/`♯`, `o`/`°`/`dim`, `+`/`aug`
and figured-bass shorthand (`V65` = `V` inv 1) are all normalised. Parse errors
are shown inline as you type, never on submit.

---

## 6. Grading

- **Alignment is by index**, chord *n* against chord *n*. If the user submits a
  different number of chords, extra slots are wrong and missing slots are
  unattempted; the length mismatch is reported explicitly ("you heard 3 chords,
  there were 4") because that is itself the lesson.
- **Score** = earned points ÷ attempted points. Skipped optional sections never
  enter the denominator, so enabling inversions cannot make your percentage drop
  for reasons unrelated to hearing.
- **Near-miss feedback** is worth more than the score. The grader emits reasons,
  not just booleans: right degree/wrong quality, right chord/wrong inversion,
  right shape transposed (`I V vi IV` answered as `IV I ii bVII`), melody right
  but rhythmically displaced. These map directly to what a teacher would say.
- The result tree is data (`{field, expected, actual, correct, reason}`), so
  review rendering and stats both read the same structure.

---

## 7. Stats and weighted drilling

`localStorage` under a single versioned key (`wet.v1`), one record per **concept**:

```js
"degree:IV":   { attempts: 41, correct: 33, ewma: 0.79, lastSeen: 1724... }
"trans:V>vi":  { attempts: 12, correct: 4,  ewma: 0.31, ... }   // deceptive cadence — weak
"inv:2":       { ... }
"rhythm:q-q-h":{ ... }
```

Accuracy is an exponentially-weighted moving average so recent performance
dominates. Selection weight per concept ≈ `(1 - ewma) + recency bonus`, with a
floor so mastered material still appears occasionally and a cap so one bad
concept doesn't monopolise every exercise. New concepts get a fixed
above-average weight so they're introduced promptly.

Surfaced as a small stats panel: accuracy per degree, per transition, per
inversion, per rhythm, plus a streak and a session count. Export/import as JSON
so progress survives a cleared browser.

---

## 8. Difficulty levels

Presets that switch on generator options and answer-sheet sections together:

| Level | Key | Chords | Pool | Voicing | Rhythm | Extras |
|---|---|---|---|---|---|---|
| 1 | C major | 3 | I IV V | root position | even only | — |
| 2 | C major | 4 | + vi ii | root position | even only | — |
| 3 | any major | 4 | diatonic triads | root position | + uneven | rhythm question |
| 4 | any major | 4 | + V7, ii7 | inversions | + uneven | inversions, bass |
| 5 | any major | 5 | + V7, ii7 | inversions | + syncopated | + top voice |
| 6 | any major | 4–6 | + V7, ii7 | inversions | + syncopated | + melody dictation |

Two departures from the first draft of this table. Minor keys and borrowed
chords are not in any level yet: the theory module handles them, but no level
uses them, and adding a mode is a bigger change to the ear than to the code.
And a chord's register is chosen by the voice leader rather than fixed, so
"block" stopped being a meaningful column.

Levels are presets over the same settings object, so any individual switch stays
user-overridable.

Levels 1–3 ship in M1: they differ only in chord pool, length and key, all of
which are already generator parameters, so the picker costs little more than the
picker itself. Being able to switch transposition on is worth having early — it
is the biggest single difficulty jump in early ear training. Level 3's rhythm
question arrives with M3; levels 4–6 unlock as M4 and M5 land.

---

## 9. Audio

- One `AudioContext`, created and `resume()`d on the first user gesture
  (autoplay policy). A single "enable sound" moment at start.
- Each note = oscillator (triangle + detuned sine mix for warmth) → ADSR gain →
  master gain → soft limiter, so four-voice chords don't clip.
- **Timing must not use `setTimeout` alone.** The scheduler runs a ~25 ms tick
  that schedules every event falling inside a ~100 ms lookahead window against
  `audioContext.currentTime`. Rhythm dictation is worthless if the playback
  itself is sloppy.
- A metronome count-in bar precedes the excerpt, and a click track is toggleable
  (off makes rhythm questions much harder — a legitimate difficulty knob).
- The audio layer takes a flat list of `{midi, startTime, duration, gain}`, so a
  sampled-piano backend can replace the oscillators later without touching the
  quiz logic.

---

## 10. Milestones

Each milestone ends with something playable in the browser.

- **M0 — skeleton.** `index.html`, module wiring, audio engine + scheduler, play
  a hard-coded C–F–G–C in time. Proves the timing model.
- **M1 — the core loop.** `theory.js`, generator with transition table, roman
  numeral text input + parser, index-aligned grading, next-exercise button,
  and levels 1–3 (see below). This is the first genuinely usable version.
- **M2 — review UX.** Per-chord replay, correct-vs-yours diff, "play my answer".
- **M3 — rhythm.** Pattern library, rhythmic generation, count-in, rhythm question.
- **M4 — voicing detail.** Voice-leading generator, inversion / bass / top-voice
  sections and their grading.
- **M5 — melody.** Melody generation, note entry (text + on-screen keyboard),
  melody grading with displacement detection.
- **M6 — stats.** localStorage, concept tracking, weighted selection, stats panel,
  export/import.
- **M7 — polish.** Difficulty presets, keyboard shortcuts (space = replay, enter =
  submit, n = next), mobile layout, GitHub Pages deploy, offline via a small
  service worker.

One thing this list did not anticipate: **the answer sheet was leaking the
question.** A row of pickers as long as the exercise says how many chords there
were, and a beatmap drawn one box per chord, sized by duration, says where they
changed. Both were fixed in M3 — pickers grow with what you type, and while you
are answering the screen shows only a playbar of beats.

M0–M2 is the minimum that teaches anything. M3–M5 are what makes it *this* app
rather than another interval quiz.

---

## 11. Open questions

1. **Rhythm input — still open.** Multiple choice shipped in M3. Two ways it
   could be gamed were closed on the way (distractors come from the excerpt's
   own tier, and a pattern is only asked about when it has enough siblings to
   fill a choice list), but elimination is inherent to the form. Tap-to-enter
   remains the truer exercise, and the answer is stored the same way either way.
2. **Melody entry — settled.** Both shipped: a text field with a keyboard of
   scale degrees beside it, each key labelled with the note it is in this key.
3. **Melody rhythm — still deferred.** M5 grades pitches only. A line heard
   correctly but written a note early or late is named as that rather than
   scored as eight wrong notes, which covers most of the value without the
   entry UI a full rhythmic melody answer would need.
4. **Transposition credit — settled as planned.** Reported as a near miss,
   scored as wrong.
5. **Modes.** Everything is major. `theory.js` has the minor scale and its
   degree qualities, and the generator takes a mode, but no level asks for one
   and the transition table is major-shaped. That is the next real feature.
