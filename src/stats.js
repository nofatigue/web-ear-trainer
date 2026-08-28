// What you are good at, and what you keep missing.
//
// Records are per concept — a degree, a transition between two degrees, an
// inversion, a rhythm — not per exercise, because "you get vi wrong after IV"
// is a thing you can practise and "you scored 62%" is not.
//
// Accuracy is an exponentially weighted moving average, so last week's
// fumbling stops counting against you once you have stopped doing it.

const KEY = 'wet.v1';
const ALPHA = 0.3;          // how fast the average follows recent attempts
const NEW_CONCEPT_EWMA = 0.5;

export function emptyStore() {
  return { version: 1, concepts: {}, sessions: 0, exercises: 0, updated: 0 };
}

export function load(storage = safeStorage()) {
  if (!storage) return emptyStore();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || typeof parsed.concepts !== 'object') return emptyStore();
    return { ...emptyStore(), ...parsed };
  } catch {
    return emptyStore();
  }
}

export function save(store, storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify({ ...store, updated: Date.now() }));
    return true;
  } catch {
    return false; // private browsing, or a full quota: stats just won't stick
  }
}

function safeStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Fold one attempt at one concept into the store. */
export function record(store, concept, correct) {
  const previous = store.concepts[concept];
  const record_ = previous || { attempts: 0, correct: 0, ewma: NEW_CONCEPT_EWMA, lastSeen: 0 };
  const hit = correct ? 1 : 0;
  store.concepts[concept] = {
    attempts: record_.attempts + 1,
    correct: record_.correct + hit,
    ewma: record_.ewma * (1 - ALPHA) + hit * ALPHA,
    lastSeen: Date.now(),
  };
  return store;
}

/**
 * Turn a graded attempt into concept outcomes.
 *
 * A chord's degree is credited to that degree and to the transition into it,
 * because missing "V after ii" is a fact about the pair, not about V.
 */
export function outcomes(exercise, result) {
  const list = [];
  result.slots.forEach((slot, i) => {
    const chord = exercise.chords[i];
    if (!chord || slot.status === 'extra') return;
    const hit = slot.status === 'correct';
    list.push([`degree:${chord.roman}`, hit]);
    if (i > 0) list.push([`trans:${exercise.chords[i - 1].roman}>${chord.roman}`, hit]);
    const inversion = slot.details && slot.details.inversion;
    if (inversion) list.push([`inv:${chord.inversion}`, inversion.correct]);
  });
  if (result.rhythm) list.push([`rhythm:${exercise.rhythmPatternId}`, result.rhythm.correct]);
  if (result.melody) {
    const right = result.melody.notes.filter((n) => n.correct).length;
    list.push(['melody', right === result.melody.notes.length]);
  }
  return list;
}

/** Record a whole attempt. */
export function recordAttempt(store, exercise, result) {
  for (const [concept, correct] of outcomes(exercise, result)) record(store, concept, correct);
  store.exercises += 1;
  return store;
}

/**
 * How much a concept deserves to come up, given how it has been going.
 *
 * Weak concepts are favoured, but with a floor so mastered material still
 * appears and a ceiling so one bad concept cannot eat every exercise.
 */
export function weightOf(store, concept) {
  const record_ = store.concepts[concept];
  if (!record_) return 1.4; // unseen material gets introduced promptly
  const missing = 1 - record_.ewma;
  const stale = record_.lastSeen && Date.now() - record_.lastSeen > 1000 * 60 * 60 * 24 * 3;
  return Math.min(2.5, Math.max(0.35, 0.35 + missing * 2 + (stale ? 0.3 : 0)));
}

/** Weights for a set of degrees, ready to bias generation. */
export function degreeWeights(store, pool, romanOf) {
  const weights = {};
  for (const degree of pool) weights[degree] = weightOf(store, `degree:${romanOf(degree)}`);
  return weights;
}

/** Everything worth showing in a panel, grouped and sorted worst-first. */
export function summary(store) {
  const groups = { degree: [], trans: [], inv: [], rhythm: [], melody: [] };
  for (const [concept, record_] of Object.entries(store.concepts)) {
    const [kind, name] = concept.split(':');
    const bucket = groups[kind] || groups.melody;
    bucket.push({
      concept,
      name: name || concept,
      attempts: record_.attempts,
      accuracy: record_.attempts ? record_.correct / record_.attempts : 0,
      recent: record_.ewma,
    });
  }
  for (const list of Object.values(groups)) list.sort((a, b) => a.recent - b.recent);
  return { groups, exercises: store.exercises };
}

/** Round-trip for backup: progress that survives a cleared browser. */
export function toJSON(store) {
  return JSON.stringify(store, null, 2);
}

export function fromJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || parsed.version !== 1 || typeof parsed.concepts !== 'object') {
    throw new Error('That does not look like an ear trainer export.');
  }
  return { ...emptyStore(), ...parsed };
}
