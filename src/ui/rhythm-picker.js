// "Which rhythm was it?" — the candidates drawn as beat grids.
//
// Writing [1, 1.5, 0.5, 1] at someone mid-dictation is no use; a grid of
// eighth-note cells with the bar lines marked is read at a glance.

import { getPattern, beatGrid } from '../rhythm.js';

function gridElement(pattern, beatsPerBar) {
  const grid = document.createElement('span');
  grid.className = 'grid';
  const cells = beatGrid(pattern, { beatsPerBar });
  cells.forEach((cell, i) => {
    const box = document.createElement('span');
    box.className = `cell is-${cell.kind}`;
    if (cell.downbeat && i > 0) box.classList.add('is-barline');
    grid.append(box);
  });
  return grid;
}

export function createRhythmPicker(root, { onChange = null } = {}) {
  let value = null;
  let enabled = true;
  let choices = [];
  let beatsPerBar = 4;

  function render() {
    root.innerHTML = '';
    if (!choices.length) return;

    const label = document.createElement('span');
    label.className = 'sheet-label';
    label.textContent = 'Rhythm';
    root.append(label);

    const hint = document.createElement('p');
    hint.className = 'sheet-hint';
    hint.textContent = 'Which of these is the rhythm the chords landed on? Each cell is an eighth note; the taller lines are bar lines.';
    root.append(hint);

    const list = document.createElement('div');
    list.className = 'rhythm-choices';
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Rhythm');

    for (const id of choices) {
      const pattern = getPattern(id);
      if (!pattern) continue;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'rhythm-choice';
      option.dataset.id = id;
      option.setAttribute('role', 'radio');
      option.setAttribute('aria-checked', String(value === id));
      option.classList.toggle('is-chosen', value === id);
      option.disabled = !enabled;
      option.append(gridElement(pattern, beatsPerBar));
      option.addEventListener('click', () => {
        value = value === id ? null : id;
        render();
        if (onChange) onChange(value);
      });
      list.append(option);
    }
    root.append(list);
  }

  return {
    reset(next, { beatsPerBar: bpb = 4 } = {}) {
      choices = next || [];
      beatsPerBar = bpb;
      value = null;
      enabled = true;
      render();
    },
    setEnabled(next) { enabled = next; render(); },
    getValue: () => value,
    /** After grading: show which one it actually was. */
    markResult(correctId) {
      for (const option of root.querySelectorAll('.rhythm-choice')) {
        const id = option.dataset.id;
        option.classList.toggle('is-truth', id === correctId);
        option.classList.toggle('is-mistake', id === value && id !== correctId);
      }
    },
  };
}
