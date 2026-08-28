// The answer sheet: a text field and per-slot pickers over the same answer.
//
// Text is the fast path for anyone who already writes roman numerals; the
// pickers are the discoverable one. The text is the single source of truth —
// a picker rewrites its own token and everything re-renders from that, so the
// two can never drift apart.

import { parseProgression } from '../parse.js';
import { DEGREE_QUALITIES, formatRoman } from '../theory.js';

function degreeOptions(mode) {
  return DEGREE_QUALITIES[mode].map((quality, degree) => formatRoman(degree, quality));
}

export function createAnswerSheet(root, { onSubmit, onChange } = {}) {
  root.innerHTML = `
    <label class="sheet-label" for="progression">Progression</label>
    <p class="sheet-hint">Type roman numerals — <code>I IV V I</code> — or use the pickers. Case
      carries the quality: <code>V</code> is major, <code>vi</code> is minor, <code>vii°</code> diminished.</p>
    <input id="progression" class="sheet-input" type="text" autocomplete="off" spellcheck="false"
           placeholder="I IV V I" aria-describedby="sheet-errors">
    <div class="slots" id="slots"></div>
    <p class="sheet-errors" id="sheet-errors" role="status"></p>
    <button class="btn btn-primary" id="btn-submit" type="button">Check answer <kbd>enter</kbd></button>
  `;

  const input = root.querySelector('#progression');
  const slotsEl = root.querySelector('#slots');
  const errorsEl = root.querySelector('#sheet-errors');
  const submitEl = root.querySelector('#btn-submit');

  let length = 4;
  let mode = 'major';
  let enabled = true;

  function tokens() {
    return input.value.trim().split(/[\s,|]+/).filter(Boolean);
  }

  function parsed() {
    return parseProgression(input.value);
  }

  function renderSlots() {
    const current = tokens();
    const options = degreeOptions(mode);
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
        while (next.length < length) next.push('');
        next[i] = select.value;
        input.value = next.join(' ').replace(/\s+/g, ' ').trim();
        update();
      });

      wrap.append(n, select);
      slotsEl.append(wrap);
    }
  }

  function update() {
    const { chords, errors } = parsed();
    errorsEl.textContent = errors.length ? errors[0] : '';
    errorsEl.classList.toggle('visible', errors.length > 0);
    submitEl.disabled = !enabled || chords.length === 0;
    renderSlots();
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
    return { chords, text: input.value.trim() };
  }

  function setEnabled(value) {
    enabled = value;
    input.disabled = !value;
    submitEl.disabled = !value || parsed().chords.length === 0;
    // Once an answer is in, checking it again is meaningless — the next move
    // belongs to the review below.
    submitEl.hidden = !value;
    renderSlots();
  }

  function reset({ length: n = length, mode: m = mode } = {}) {
    length = n;
    mode = m;
    input.value = '';
    errorsEl.textContent = '';
    errorsEl.classList.remove('visible');
    setEnabled(true);
    update();
  }

  update();
  return { reset, setEnabled, getAnswer, focus: () => input.focus() };
}
