// The answer sheet: a text field and per-slot pickers over the same answer.
//
// Text is the fast path for anyone who already writes roman numerals; the
// pickers are the discoverable one. The text is the single source of truth —
// a picker rewrites its own token and everything re-renders from that, so the
// two can never drift apart.

import { parseProgression, parsePitch } from '../parse.js';
import { DEGREE_QUALITIES, formatRoman, chordLabel } from '../theory.js';
import { createRhythmPicker } from './rhythm-picker.js';
import { createMelodyInput } from './melody-input.js';

function degreeOptions(mode) {
  return DEGREE_QUALITIES[mode].map((quality, degree) => formatRoman(degree, quality));
}

export function createAnswerSheet(root, { onSubmit, onChange } = {}) {
  root.innerHTML = `
    <div class="section" id="rhythm-section"></div>
    <label class="sheet-label" for="progression">Progression</label>
    <p class="sheet-hint">Type roman numerals — <code>I IV V I</code> — or use the pickers. Case
      carries the quality: <code>V</code> is major, <code>vi</code> is minor, <code>vii°</code> diminished.</p>
    <input id="progression" class="sheet-input" type="text" autocomplete="off" spellcheck="false"
           placeholder="I IV V I" aria-describedby="sheet-errors">
    <div class="slots" id="slots"></div>
    <div class="section" id="detail-section"></div>
    <div class="section" id="melody-section"></div>
    <p class="sheet-errors" id="sheet-errors" role="status"></p>
    <button class="btn btn-primary" id="btn-submit" type="button">Check answer <kbd>enter</kbd></button>
  `;

  const rhythmRoot = root.querySelector('#rhythm-section');
  const rhythm = createRhythmPicker(rhythmRoot, { onChange: () => update() });
  const input = root.querySelector('#progression');
  const slotsEl = root.querySelector('#slots');
  const detailEl = root.querySelector('#detail-section');
  const melody = createMelodyInput(root.querySelector('#melody-section'));
  const errorsEl = root.querySelector('#sheet-errors');
  const submitEl = root.querySelector('#btn-submit');

  const MIN_SLOTS = 3;
  const MAX_SLOTS = 8;
  let mode = 'major';
  let key = { tonic: 'C', mode: 'major' };
  let asks = {};
  let details = [];
  let enabled = true;

  function tokens() {
    return input.value.trim().split(/[\s,|]+/).filter(Boolean);
  }

  function parsed() {
    return parseProgression(input.value);
  }

  /**
   * How many pickers to show.
   *
   * Never the number of chords in the exercise: how many chords you heard is
   * part of the question, and a fixed row of pickers would answer it for you.
   * One spare slot past whatever has been written keeps adding easy.
   */
  function slotCount() {
    return Math.min(MAX_SLOTS, Math.max(MIN_SLOTS, tokens().length + 1));
  }

  function renderSlots() {
    const current = tokens();
    const options = degreeOptions(mode);
    const length = slotCount();
    slotsEl.innerHTML = '';
    for (let i = 0; i < length; i++) {
      const wrap = document.createElement('div');
      wrap.className = 'slot';

      const n = document.createElement('span');
      n.className = 'slot-n';
      n.textContent = i + 1;

      const select = document.createElement('select');
      select.className = 'slot-select';
      select.setAttribute('aria-label', `Chord ${i + 1}`);
      select.disabled = !enabled;
      const blank = new Option('–', '');
      select.add(blank);
      for (const label of options) select.add(new Option(label, label));
      const value = current[i] || '';
      select.value = options.includes(value) ? value : '';
      if (value && !options.includes(value)) {
        // Something typed that isn't a plain diatonic triad — keep it visible.
        const extra = new Option(value, value);
        select.add(extra);
        select.value = value;
      }
      select.addEventListener('change', () => {
        const next = tokens();
        while (next.length <= i) next.push('');
        next[i] = select.value;
        input.value = next.join(' ').replace(/\s+/g, ' ').trim();
        update();
      });

      wrap.append(n, select);
      slotsEl.append(wrap);
    }
  }

  const INVERSIONS = [
    ['', '–'],
    ['0', 'root'],
    ['1', '6 · third in bass'],
    ['2', '6-4 · fifth in bass'],
    ['3', '4-2 · seventh in bass'],
  ];

  /**
   * The voicing questions, one row per chord. The inversion picker writes its
   * figure back into the progression text — "V" becomes "V65" — so a chord's
   * identity lives in exactly one place however you chose to enter it.
   */
  function renderDetails() {
    detailEl.innerHTML = '';
    if (!asks.inversions && !asks.bass && !asks.top) return;

    const label = document.createElement('span');
    label.className = 'sheet-label';
    label.textContent = 'Voicing';
    detailEl.append(label);

    const hint = document.createElement('p');
    hint.className = 'sheet-hint';
    hint.textContent = 'Optional — every row you leave alone is left out of the score. Notes can be names (Bb) or scale degrees (3).';
    detailEl.append(hint);

    const table = document.createElement('div');
    table.className = 'details';

    const head = document.createElement('div');
    head.className = 'detail-row is-head';
    head.innerHTML = `<span></span>${asks.inversions ? '<span>Inversion</span>' : ''}`
      + `${asks.bass ? '<span>Bass</span>' : ''}${asks.top ? '<span>Top voice</span>' : ''}`;
    table.append(head);
    table.style.setProperty('--cols', String(1 + [asks.inversions, asks.bass, asks.top].filter(Boolean).length));

    const chords = parsed().chords;
    for (let i = 0; i < slotCount(); i++) {
      const row = document.createElement('div');
      row.className = 'detail-row';
      const n = document.createElement('span');
      n.className = 'slot-n';
      n.textContent = i + 1;
      row.append(n);

      if (asks.inversions) {
        const select = document.createElement('select');
        select.className = 'slot-select';
        select.setAttribute('aria-label', `Inversion of chord ${i + 1}`);
        select.disabled = !enabled;
        for (const [value, text] of INVERSIONS) select.add(new Option(text, value));
        const current = details[i] && details[i].inversion;
        select.value = current === null || current === undefined ? '' : String(current);
        select.addEventListener('change', () => {
          setDetail(i, 'inversion', select.value === '' ? null : Number(select.value));
          writeFigure(i);
        });
        row.append(select);
      }

      for (const field of ['bass', 'top']) {
        if (!asks[field]) continue;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'detail-input';
        input.autocomplete = 'off';
        input.placeholder = field === 'bass' ? 'e.g. G' : 'e.g. 3';
        input.setAttribute('aria-label', `${field === 'bass' ? 'Bass note' : 'Top voice'} of chord ${i + 1}`);
        input.value = (details[i] && details[i][field]) || '';
        input.disabled = !enabled;
        input.addEventListener('input', () => setDetail(i, field, input.value));
        row.append(input);
      }

      row.classList.toggle('is-unwritten', !chords[i]);
      table.append(row);
    }
    detailEl.append(table);
  }

  function setDetail(index, field, value) {
    while (details.length <= index) details.push({ inversion: null, bass: '', top: '' });
    details[index][field] = value;
  }

  /** Push an inversion chosen in the table back into the progression text. */
  function writeFigure(index) {
    const chords = parsed().chords;
    const chord = chords[index];
    if (!chord) { update(); return; }
    const inversion = details[index].inversion;
    const next = tokens();
    next[index] = chordLabel(chord.degree, chord.quality, inversion || 0);
    input.value = next.join(' ');
    update();
  }

  function update() {
    const { chords, errors } = parsed();
    errorsEl.textContent = errors.length ? errors[0] : '';
    errorsEl.classList.toggle('visible', errors.length > 0);
    submitEl.disabled = !enabled || chords.length === 0;
    // A figure typed into the text is an answer about the inversion too.
    chords.forEach((chord, i) => {
      if (chord.hasFigure) setDetail(i, 'inversion', chord.inversion);
    });
    renderSlots();
    renderDetails();
    if (onChange) onChange(chords);
  }

  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !submitEl.disabled) {
      event.preventDefault();
      onSubmit(getAnswer());
    }
  });
  submitEl.addEventListener('click', () => onSubmit(getAnswer()));

  function getAnswer() {
    const { chords } = parsed();
    const answered = chords.map((chord, i) => {
      const detail = details[i] || {};
      return {
        ...chord,
        inversion: chord.hasFigure ? chord.inversion : (detail.inversion ?? null),
        bassPc: asks.bass ? parsePitch(detail.bass, key) : null,
        topPc: asks.top ? parsePitch(detail.top, key) : null,
      };
    });
    return {
      chords: answered,
      rhythmPatternId: rhythm.getValue(),
      melody: asks.melody ? melody.getNotes() : [],
      text: input.value.trim(),
    };
  }

  function setEnabled(value) {
    enabled = value;
    rhythm.setEnabled(value);
    melody.setEnabled(value);
    input.disabled = !value;
    for (const field of detailEl.querySelectorAll('select, input')) field.disabled = !value;
    submitEl.disabled = !value || parsed().chords.length === 0;
    // Once an answer is in, checking it again is meaningless — the next move
    // belongs to the review below.
    submitEl.hidden = !value;
    renderSlots();
  }

  function reset({
    key: k = key, rhythmChoices = null, beatsPerBar = 4, asks: a = {},
  } = {}) {
    key = k;
    mode = k.mode;
    asks = a;
    details = [];
    rhythm.reset(rhythmChoices, { beatsPerBar });
    melody.reset({ key: k, show: Boolean(a.melody) });
    input.value = '';
    errorsEl.textContent = '';
    errorsEl.classList.remove('visible');
    setEnabled(true);
    update();
  }

  update();
  return {
    reset,
    setEnabled,
    getAnswer,
    focus: () => input.focus(),
    markRhythm: (correctId) => rhythm.markResult(correctId),
  };
}
