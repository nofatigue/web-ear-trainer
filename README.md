# Web Ear Trainer

Chord progression dictation in the browser. A short progression plays; you write
down the roman numerals you heard, and every chord is graded on its own with a
reason attached — right root but wrong quality, right shape in the wrong key,
and so on.

No build step, no dependencies, no backend: plain ES modules and the Web Audio
API.

**Current state — M7, all milestones landed.** Six levels: plain triads in C, then transposition and a
rhythm question, then voice-led inversions, sevenths and bass/top-voice
questions, and finally a melody over the progression to write down too. The
review plays your own answer back — chords and melody — against what was
actually played, and the trainer keeps track of which chords, transitions,
inversions and rhythms you miss, leaning the next exercise toward them. Rhythm, inversions
and melody dictation arrive in M3–M5; see [PLAN.md](PLAN.md) for the full design
and milestones.

## Running it

ES modules are fetched under CORS rules, so the page needs an HTTP origin —
opening `index.html` off the disk will not work.

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Tests

The theory, parsing, generation and grading modules are pure — no DOM, no audio —
and run under Node's built-in test runner against the same files the browser
loads.

```sh
node --test test/*.test.mjs
```

## Playing

| Key | Does |
|---|---|
| `space` | play or replay the progression |
| `t` | tonic reference — the tonic note, then the I chord |
| `enter` | check your answer |
| `n` | next exercise |
| `y` | after grading: hear your answer as you wrote it |
| `b` | after grading: hear both, one after the other |

While you are answering, the screen shows only how long the excerpt is — how
many chords there were, and where they changed, is part of the question.

Answers are roman numerals, and case carries the quality: `V` is major, `vi` is
minor, `vii°` diminished. The parser is forgiving about the rest — `viio`,
`viidim`, `V7`, `V65`, `IV6`, `bVII` and `♭III` all read as you would expect,
and separators can be spaces, commas, bars or dashes. The per-slot pickers write
into the same field, so you can use either.

## The levels

| Level | What it asks |
|---|---|
| 1 | Three chords in C major, drawn from I IV V |
| 2 | Four chords, adding ii and vi |
| 3 | Any major key, all seven diatonic triads, and which rhythm it was |
| 4 | Sevenths and inversions, and which note was in the bass |
| 5 | Longer, syncopated, and which note was on top |
| 6 | All of it, with a melody over the progression to write down too |

What you miss steers what comes next: accuracy is tracked per chord, per
transition between chords, per inversion and per rhythm, and generation leans
toward the weak ones. Open **Progress** at the bottom of the page to see where
you stand, or to export it as JSON.

## Deploying

Static files, so GitHub Pages serves the repository root as-is: Settings →
Pages, source = GitHub Actions (the workflow in `.github/workflows/pages.yml`
runs the tests and deploys on every push to `main`), or source = branch,
folder = `/` to skip the workflow entirely. All paths in `index.html` are
relative, so the site works from a project subdirectory.

Once loaded over HTTPS or localhost, a service worker caches the app shell, so
it keeps working with no network at all.

## Layout

```
index.html  styles.css
src/
  app.js         state machine + wiring; the only module that touches the DOM
  theory.js      notes, scales, chords, roman numerals, inversions
  parse.js       answer text -> structured data
  rhythm.js      rhythm pattern library
  generator.js   exercise generation from a transition table
  grading.js     exercise + answer -> result tree
  voicing.js     voice leading: inversions and octaves by least movement
  melody.js      a singable line over the chords
  stats.js       per-concept accuracy, drill weights, export/import
  audio/         engine (voices), scheduler (lookahead), player (exercise -> sound)
  ui/            answer sheet, rhythm picker, melody input, review, stats panel
sw.js            offline cache of the app shell
test/            node --test, no dependencies
```

Licensed GPL-3.0.
