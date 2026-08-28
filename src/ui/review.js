// Review: what was played, what you wrote, and the two side by side.
//
// The comparison strip is the point of this screen. A wrong chord you can hear
// teaches more than a red mark you can only read, so every chip is playable and
// the whole passage can be heard both ways in a row.

const STATUS_LABEL = {
  correct: 'correct',
  near: 'near miss',
  wrong: 'wrong',
  missing: 'missing',
  extra: 'extra',
};

function chip(text, { status = '', role = '', title = '', onPlay = null } = {}) {
  const el = document.createElement(onPlay ? 'button' : 'span');
  el.className = `chip chip-${role}${status ? ` is-${status}` : ''}`;
  el.textContent = text;
  if (onPlay) {
    el.type = 'button';
    el.title = title;
    el.addEventListener('click', onPlay);
  }
  return el;
}

/**
 * @param result      grading result
 * @param exercise    what was played
 * @param answerPlay  the same passage as the user answered it, playable
 */
export function renderReview(root, result, exercise, answerPlay, handlers = {}) {
  const { onPlayChord = null, onPlayTruth = null, onPlayYours = null, onPlayBoth = null } = handlers;
  const pct = Math.round(result.score * 100);
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'review-head';
  head.innerHTML = `
    <span class="review-score ${result.perfect ? 'is-perfect' : ''}">${pct}<span class="pct">%</span></span>
    <span class="review-sub">${result.earned} of ${result.possible} points ·
      ${exercise.key.tonic} ${exercise.key.mode}</span>
  `;
  root.append(head);

  // --- the comparison strip: played over yours, aligned by slot ---

  const strip = document.createElement('div');
  strip.className = 'strip';
  strip.style.setProperty('--slots', String(result.slots.length));

  const rows = [
    { key: 'played', label: 'Played' },
    { key: 'yours', label: 'You wrote' },
  ];

  for (const row of rows) {
    const label = document.createElement('span');
    label.className = 'strip-label';
    label.textContent = row.label;
    strip.append(label);

    const line = document.createElement('div');
    line.className = 'strip-row';
    line.dataset.side = row.key;

    result.slots.forEach((slot, i) => {
      const played = row.key === 'played';
      const chord = played ? exercise.chords[i] : answerPlay.chords[i];
      const text = played ? (slot.expectedLabel || slot.expected || '·') : (slot.actual || '·');
      const cell = chip(text, {
        role: row.key,
        status: played ? '' : slot.status,
        title: chord ? 'Hear this chord' : '',
        onPlay: chord && onPlayChord ? () => onPlayChord(chord) : null,
      });
      cell.dataset.index = String(i);
      line.append(cell);
    });

    strip.append(line);
  }
  root.append(strip);

  if (result.rhythm) {
    const row = document.createElement('div');
    row.className = `review-rhythm is-${result.rhythm.correct ? 'correct' : 'wrong'}`;
    row.innerHTML = `<span class="review-status">rhythm ${result.rhythm.correct ? 'correct' : 'wrong'}</span>
      <span class="review-why"></span>`;
    row.querySelector('.review-why').textContent = result.rhythm.correct
      ? 'You had the pattern.'
      : result.rhythm.reason;
    root.append(row);
  }

  const controls = document.createElement('div');
  controls.className = 'review-controls';
  const buttons = [
    ['Hear it again', onPlayTruth, 'space'],
    ['Hear your answer', onPlayYours, 'y'],
    ['Both, in a row', onPlayBoth, 'b'],
  ];
  for (const [text, handler, key] of buttons) {
    if (!handler) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn';
    button.innerHTML = `${text} <kbd>${key}</kbd>`;
    button.addEventListener('click', handler);
    controls.append(button);
  }
  root.append(controls);

  // --- only the slots that went wrong get an explanation ---

  const notes = document.createElement('div');
  notes.className = 'review-reasons';

  const reasonRow = (index, status, label, text) => {
    const row = document.createElement('div');
    row.className = `review-reason is-${status}`;
    row.innerHTML = `<span class="review-slot-n">${index + 1}</span>
      <span class="review-status"></span>
      <span class="review-why"></span>`;
    row.querySelector('.review-status').textContent = label;
    row.querySelector('.review-why').textContent = text;
    notes.append(row);
  };

  result.slots.forEach((slot, i) => {
    if (slot.reason) reasonRow(i, slot.status, STATUS_LABEL[slot.status], slot.reason);
    for (const [field, detail] of Object.entries(slot.details || {})) {
      if (detail && !detail.correct) reasonRow(i, 'wrong', field === 'top' ? 'top voice' : field, detail.reason);
    }
  });
  for (const note of result.notes) {
    const row = document.createElement('div');
    row.className = 'review-note';
    row.textContent = note;
    notes.append(row);
  }
  if (notes.children.length) root.append(notes);

  if (result.perfect) {
    const clean = document.createElement('p');
    clean.className = 'review-clean';
    clean.textContent = 'Clean — every chord and every quality.';
    root.append(clean);
  }
}

/** Light up whichever chip is currently sounding. */
export function highlightReview(root, index, side) {
  for (const row of root.querySelectorAll('.strip-row')) {
    const active = row.dataset.side === side;
    for (const cell of row.children) {
      cell.classList.toggle('is-sounding', active && Number(cell.dataset.index) === index);
    }
  }
}
