export const state = {
  health: null,
  healthOk: null,
  checks: 0,
  okChecks: 0,
  pings: [],
  stats: null,
  model: null,
  insights: null,
  evaluation: null,
  lastPrediction: null,
};

const subs = new Map();

export function on(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key)?.delete(fn);
}

export function emit(key, value) {
  for (const fn of subs.get(key) || []) {
    try { fn(value); } catch (err) { setTimeout(() => { throw err; }); }
  }
}

export function set(key, value) {
  state[key] = value;
  emit(key, value);
}
