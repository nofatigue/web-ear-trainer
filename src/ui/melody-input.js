// Melody entry: a text field, and a keyboard of scale degrees for people who
// would rather hunt than type.
//
// The text is the source of truth, as it is for the progression — the buttons
// simply append to it.

import { parseMelody } from '../parse.js';
import { SCALES, noteNameToPc, pcToName } from '../theory.js';

export function createMelodyInput(root, { onChange = null } = {}) {
  let key = { tonic: 'C', mode: 'major' };
  let enabled = true;
  let shown = false;

  root.innerHTML = '';

  function render() {
    root.innerHTML = '';
    if (!shown) return;

    const label = document.createElement('span');
    label.className = 'sheet-label';
    label.textContent = 'Melody';
    root.append(label);

    const hint = document.createElement('p');
    hint.className = 'sheet-hint';
    hint.textContent = 'The line over the top, note by note. Scale degrees or note names — pitch only, so the octave you write it in does not matter.';
    root.append(hint);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'melody';
    input.className = 'sheet-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = '1 2 3 5';
    input.disabled = !enabled;
    input.addEventListener('input', () => { renderNotes(); if (onChange) onChange(); });
    root.append(input);

    const keys = document.createElement('div');
    keys.className = 'degree-keys';
    const tonicPc = noteNameToPc(key.tonic);
    for (let degree = 0; degree < 7; degree++) {
      const pc = (tonicPc + SCALES[key.mode][degree]) % 12;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'degree-key';
      button.disabled = !enabled;
      button.innerHTML = `<span class="degree-n">${degree + 1}</span>
        <span class="degree-name">${pcToName(pc, { flats: /b|♭/.test(key.tonic) || key.tonic === 'F' })}</span>`;
      button.addEventListener('click', () => {
        input.value = `${input.value.trim()} ${degree + 1}`.trim();
        renderNotes();
        if (onChange) onChange();
      });
      keys.append(button);
    }

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'degree-key is-utility';
    back.textContent = '⌫';
    back.setAttribute('aria-label', 'Delete the last note');
    back.disabled = !enabled;
    back.addEventListener('click', () => {
      input.value = input.value.trim().split(/\s+/).slice(0, -1).join(' ');
      renderNotes();
      if (onChange) onChange();
    });
    keys.append(back);
    root.append(keys);

    const count = document.createElement('p');
    count.className = 'melody-count';
    root.append(count);

    function renderNotes() {
      const { notes, errors } = parseMelody(input.value, key);
      count.textContent = errors.length
        ? errors[0]
        : (notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '');
      count.classList.toggle('is-error', errors.length > 0);
    }
    renderNotes();
  }

  return {
    reset({ key: k, show }) {
      key = k;
      shown = show;
      enabled = true;
      render();
    },
    setEnabled(value) {
      enabled = value;
      for (const field of root.querySelectorAll('input, button')) field.disabled = !value;
    },
    getNotes() {
      const input = root.querySelector('#melody');
      if (!input) return [];
      return parseMelody(input.value, key).notes;
    },
  };
}
