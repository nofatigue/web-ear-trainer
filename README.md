# Web Ear Trainer

Chord progression dictation in the browser. A short progression plays; you write
down the roman numerals you heard, and every chord is graded on its own with a
reason attached — right root but wrong quality, right shape in the wrong key,
and so on.

No build step, no dependencies, no backend: plain ES modules and the Web Audio
API.

**Current state — M2.** Progression dictation at levels 1–3, with a review that
plays your own answer back against what was actually played. Rhythm, inversions
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

Answers are roman numerals, and case carries the quality: `V` is major, `vi` is
minor, `vii°` diminished. The parser is forgiving about the rest — `viio`,
`viidim`, `V7`, `V65`, `IV6`, `bVII` and `♭III` all read as you would expect,
and separators can be spaces, commas, bars or dashes. The per-slot pickers write
into the same field, so you can use either.

## Deploying

Static files, so GitHub Pages serves the repository root as-is: Settings →
Pages, source = branch, folder = `/`. All paths in `index.html` are relative, so
the site works from a project subdirectory.

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
  audio/         engine (voices), scheduler (lookahead), player (exercise -> sound)
  ui/            answer sheet, review
test/            node --test, no dependencies
```

Licensed GPL-3.0.
