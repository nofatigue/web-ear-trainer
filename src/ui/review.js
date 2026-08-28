// Review: what you wrote, what it was, and why.

const STATUS_LABEL = {
  correct: 'correct',
  near: 'near miss',
  wrong: 'wrong',
  missing: 'missing',
  extra: 'extra',
};

export function renderReview(root, result, exercise, { onPlayChord } = {}) {
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

  const list = document.createElement('div');
  list.className = 'review-slots';
  for (const slot of result.slots) {
    const row = document.createElement('div');
    row.className = `review-slot is-${slot.status}`;

    const chord = exercise.chords[slot.index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'review-chord';
    button.textContent = slot.expected || '–';
    if (chord && onPlayChord) {
      button.title = 'Hear this chord on its own';
      button.addEventListener('click', () => onPlayChord(chord));
    } else {
      button.disabled = true;
    }

    const detail = document.createElement('div');
    detail.className = 'review-detail';
    const yours = slot.actual ? `you wrote <b>${escape(slot.actual)}</b>` : 'you left this blank';
    detail.innerHTML = `<span class="review-status">${STATUS_LABEL[slot.status]}</span>
      <span class="review-yours">${yours}</span>`;
    if (slot.reason) {
      const why = document.createElement('div');
      why.className = 'review-reason';
      why.textContent = slot.reason;
      detail.append(why);
    }

    row.append(button, detail);
    list.append(row);
  }
  root.append(list);

  for (const note of result.notes) {
    const el = document.createElement('p');
    el.className = 'review-note';
    el.textContent = note;
    root.append(el);
  }
}

function escape(text) {
  return String(text).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}
