// The stats panel: how each concept is going, worst first.
//
// One row per concept, each a labelled meter. Accuracy is a status reading
// rather than a series, so the bar takes the good / warning / critical colours —
// always beside the number and the name, never colour alone.

// Concept ids are terse by design; the panel spells them out.
const INVERSION_NAMES = ['root position', 'first · 6', 'second · 6-4', 'third · 4-2'];

function displayName(kind, name) {
  if (kind === 'inv') return INVERSION_NAMES[Number(name)] || name;
  if (kind === 'trans') return name.replace('>', ' → ');
  if (kind === 'melody') return 'whole line right';
  return name;
}

const GROUPS = [
  ['degree', 'Chords'],
  ['trans', 'Transitions'],
  ['inv', 'Inversions'],
  ['rhythm', 'Rhythms'],
  ['melody', 'Melody'],
];

function statusOf(accuracy) {
  if (accuracy >= 0.8) return 'good';
  if (accuracy >= 0.5) return 'warn';
  return 'poor';
}

function meter(row) {
  const el = document.createElement('div');
  el.className = 'meter';
  el.title = `${row.attempts} attempt${row.attempts === 1 ? '' : 's'}`;
  const pct = Math.round(row.accuracy * 100);
  el.innerHTML = `
    <span class="meter-name"></span>
    <span class="meter-track"><span class="meter-fill is-${statusOf(row.accuracy)}"></span></span>
    <span class="meter-value">${pct}<span class="meter-pct">%</span></span>
    <span class="meter-attempts">${row.attempts}</span>
  `;
  el.querySelector('.meter-name').textContent = row.label;
  el.querySelector('.meter-fill').style.width = `${Math.max(2, pct)}%`;
  return el;
}

export function renderStats(root, store, summary, handlers = {}) {
  const { onExport = null, onImport = null, onReset = null } = handlers;
  root.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'stats-head';
  head.innerHTML = `<span class="stats-count">${summary.exercises} exercise${summary.exercises === 1 ? '' : 's'} recorded
    · weakest first · the trainer leans on what you miss</span>`;
  root.append(head);

  const hasData = Object.values(summary.groups).some((list) => list.length);
  if (!hasData) {
    const empty = document.createElement('p');
    empty.className = 'sheet-hint';
    empty.textContent = 'Nothing recorded yet. Answer an exercise and what you missed starts steering what comes next.';
    root.append(empty);
  }

  for (const [kind, title] of GROUPS) {
    const rows = summary.groups[kind] || [];
    if (!rows.length) continue;
    const section = document.createElement('div');
    section.className = 'stats-group';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading);
    // Worst first: the point of the panel is what to work on.
    for (const row of rows.slice(0, 12)) {
      section.append(meter({ ...row, label: displayName(kind, row.name) }));
    }
    root.append(section);
  }

  const actions = document.createElement('div');
  actions.className = 'stats-actions';
  const buttons = [['Export', onExport], ['Import', onImport], ['Reset', onReset]];
  for (const [text, handler] of buttons) {
    if (!handler) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-small';
    button.textContent = text;
    button.addEventListener('click', handler);
    actions.append(button);
  }
  root.append(actions);
}
