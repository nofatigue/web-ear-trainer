// Wiring: the state machine, and the only module that touches the DOM tree.

import { AudioEngine } from './audio/engine.js';
import { Player } from './audio/player.js';
import { generateExercise, exerciseFromAnswer, levelSettings, LEVELS } from './generator.js';
import { gradeExercise } from './grading.js';
import { createAnswerSheet } from './ui/answer-sheet.js';
import { renderReview, highlightReview } from './ui/review.js';

const LEVEL_KEY = 'wet.level';

const engine = new AudioEngine();
const player = new Player(engine);

const state = {
  level: loadLevel(),
  exercise: null,
  answerPlay: null, // what the user wrote, dressed up as something playable
  phase: 'cold', // cold -> answering -> graded
  replays: 0,
  clickOn: false,
  session: { count: 0, scoreSum: 0, perfect: 0 },
};

const el = {};
let sheet;

function loadLevel() {
  try {
    const stored = Number(localStorage.getItem(LEVEL_KEY));
    return LEVELS.some((l) => l.id === stored) ? stored : 1;
  } catch {
    return 1;
  }
}

function saveLevel(id) {
  try {
    localStorage.setItem(LEVEL_KEY, String(id));
  } catch {
    /* private browsing: the level just won't stick */
  }
}

function init() {
  for (const id of ['gate', 'btn-start', 'levels', 'btn-play', 'btn-tonic', 'btn-click',
    'btn-next', 'beatmap', 'key-label', 'sheet', 'review', 'session', 'replay-count']) {
    el[id] = document.getElementById(id);
  }

  renderLevels();
  sheet = createAnswerSheet(el.sheet, { onSubmit: submit });

  el['btn-start'].addEventListener('click', begin);
  el['btn-play'].addEventListener('click', play);
  el['btn-tonic'].addEventListener('click', playTonic);
  el['btn-next'].addEventListener('click', next);
  el['btn-click'].addEventListener('click', toggleClick);

  document.addEventListener('keydown', onKey);
  render();
}

function renderLevels() {
  el.levels.innerHTML = '';
  for (const level of LEVELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level';
    button.dataset.id = String(level.id);
    button.innerHTML = `<span class="level-name">${level.name}</span>
      <span class="level-blurb">${level.blurb}</span>`;
    button.addEventListener('click', () => setLevel(level.id));
    el.levels.append(button);
  }
  const locked = document.createElement('p');
  locked.className = 'level-locked';
  locked.textContent = 'Levels 4–6 (inversions, sevenths, melody) unlock as those milestones land.';
  el.levels.append(locked);
  syncLevels();
}

function syncLevels() {
  for (const button of el.levels.querySelectorAll('.level')) {
    const active = Number(button.dataset.id) === state.level;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function setLevel(id) {
  if (state.level === id) return;
  state.level = id;
  saveLevel(id);
  syncLevels();
  if (state.phase !== 'cold') next();
}

async function begin() {
  try {
    await engine.start();
  } catch (error) {
    el.gate.querySelector('.gate-error').textContent = error.message;
    return;
  }
  el.gate.hidden = true;
  next();
}

function next() {
  player.stop();
  state.exercise = generateExercise(levelSettings(state.level));
  state.answerPlay = null;
  state.phase = 'answering';
  state.replays = 0;
  el.review.hidden = true;
  el.review.innerHTML = '';
  sheet.reset({ length: state.exercise.chords.length, mode: state.exercise.key.mode });
  render();
  play();
  sheet.focus();
}

function play({ countIn = true } = {}) {
  if (!state.exercise || !engine.ready) return;
  state.replays += 1;
  player.play(state.exercise, {
    countIn,
    click: state.clickOn,
    onChord: highlight,
    onDone: render,
  });
  render();
}

function playTonic() {
  if (!state.exercise || !engine.ready) return;
  player.playTonic(state.exercise, { onDone: render });
  render();
}

function toggleClick() {
  state.clickOn = !state.clickOn;
  render();
}

function highlight(index, side = 'played') {
  const sounding = side === 'played' ? index : null;
  el.beatmap.querySelectorAll('.chord-box').forEach((box, i) => {
    box.classList.toggle('is-sounding', i === sounding);
  });
  if (state.phase === 'graded') highlightReview(el.review, index, side);
}

function submit(answer) {
  if (state.phase !== 'answering' || !answer.chords.length) return;
  player.stop();
  const result = gradeExercise(state.exercise, answer);
  state.phase = 'graded';
  state.answerPlay = exerciseFromAnswer(state.exercise, answer.chords);
  state.session.count += 1;
  state.session.scoreSum += result.score;
  if (result.perfect) state.session.perfect += 1;
  sheet.setEnabled(false);
  el.review.hidden = false;
  renderReview(el.review, result, state.exercise, state.answerPlay, {
    onPlayChord: (chord) => player.playChord(chord),
    onPlayTruth: () => play({ countIn: false }),
    onPlayYours: playYours,
    onPlayBoth: playBoth,
  });
  render();
  el['btn-next'].focus();
}

function playYours() {
  if (!state.answerPlay) return;
  player.play(state.answerPlay, { countIn: false, onChord: (i) => highlight(i, 'yours'), onDone: render });
  render();
}

function playBoth() {
  if (!state.answerPlay) return;
  player.playComparison(state.exercise, state.answerPlay, { onChord: highlight, onDone: render });
  render();
}

function renderBeatmap() {
  const exercise = state.exercise;
  el.beatmap.innerHTML = '';
  if (!exercise) return;
  exercise.chords.forEach((chord, i) => {
    const box = document.createElement('div');
    box.className = 'chord-box';
    box.style.flexGrow = String(chord.durationBeats);
    box.innerHTML = `<span class="chord-n">${i + 1}</span>
      <span class="chord-value">?</span>`;
    el.beatmap.append(box);
  });
}

function render() {
  const { exercise, phase } = state;
  el['key-label'].textContent = exercise
    ? `${exercise.key.tonic} ${exercise.key.mode} · ${exercise.bpm} bpm · ${exercise.chords.length} chords`
    : '';
  el['btn-play'].textContent = state.replays === 0 ? 'Play' : 'Replay';
  el['btn-play'].disabled = !exercise;
  el['btn-tonic'].disabled = !exercise;
  el['btn-next'].hidden = phase !== 'graded';
  // Once graded, the comparison strip says everything the beatmap was saying,
  // and says it against what the user wrote.
  el.beatmap.hidden = phase === 'graded';
  el['btn-click'].classList.toggle('is-on', state.clickOn);
  el['btn-click'].setAttribute('aria-pressed', String(state.clickOn));
  el['replay-count'].textContent = state.replays > 1 ? `${state.replays} plays` : '';

  const { count, scoreSum, perfect } = state.session;
  el.session.textContent = count
    ? `${count} exercise${count === 1 ? '' : 's'} · ${Math.round((scoreSum / count) * 100)}% average · ${perfect} clean`
    : '';

  renderBeatmap();
}

function onKey(event) {
  if (state.phase === 'cold') return;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName);
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key.toLowerCase();
  const graded = state.phase === 'graded';
  const handled = key === ' ' || key === 't' || (graded && 'nyb'.includes(key));
  if (!handled) return;

  // Shortcuts move focus into the answer field, so the keypress has to be
  // consumed here or the character lands in the input we just focused.
  event.preventDefault();
  if (key === ' ') play({ countIn: !graded });
  else if (key === 't') playTonic();
  else if (key === 'y') playYours();
  else if (key === 'b') playBoth();
  else next();
}

init();
