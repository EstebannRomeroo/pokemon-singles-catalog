import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debounce, limitMatches, matchesNote, SEARCH_DELAY_MS, MAX_RESULTS } from './search.mjs';

// A timer pair that records calls instead of waiting, so the debounce logic is
// exercised deterministically and the suite never sleeps.
function fakeTimers() {
  const scheduled = [];
  const cleared = [];
  const setTimer = (fn, delay) => {
    const id = { fn, delay };
    scheduled.push(id);
    return id;
  };
  const clearTimer = (id) => { cleared.push(id); };
  // Runs the most recently scheduled callback, as real time would.
  const runLast = () => {
    const last = scheduled.filter((s) => !cleared.includes(s)).at(-1);
    if (last) last.fn();
    return last;
  };
  return { setTimer, clearTimer, scheduled, cleared, runLast };
}

test('debounce waits the full delay before running', () => {
  const t = fakeTimers();
  const calls = [];
  const fn = debounce((v) => calls.push(v), 250, t.setTimer, t.clearTimer);
  fn('a');
  assert.equal(calls.length, 0, 'must not run before the delay elapses');
  t.runLast();
  assert.deepEqual(calls, ['a']);
});

test('debounce passes every argument through', () => {
  const t = fakeTimers();
  const calls = [];
  const fn = debounce((...args) => calls.push(args), 250, t.setTimer, t.clearTimer);
  fn('a', 1, { k: 2 });
  t.runLast();
  assert.deepEqual(calls, [['a', 1, { k: 2 }]]);
});

test('debounce collapses rapid keystrokes into one run', () => {
  const t = fakeTimers();
  const calls = [];
  const fn = debounce((v) => calls.push(v), 250, t.setTimer, t.clearTimer);
  // Typing "cloud": five keystrokes, each replacing the previous timer.
  for (const ch of ['c', 'cl', 'clo', 'clou', 'cloud']) fn(ch);
  assert.equal(calls.length, 0, 'nothing runs while typing continues');
  t.runLast();
  assert.deepEqual(calls, ['cloud'], 'only the final query runs');
});

test('debounce cancels every superseded timer', () => {
  const t = fakeTimers();
  const fn = debounce(() => {}, 250, t.setTimer, t.clearTimer);
  fn('a'); fn('b'); fn('c');
  assert.equal(t.scheduled.length, 3);
  assert.equal(t.cleared.length, 2, 'the first two timers are cancelled');
});

test('debounce runs again on a later keystroke', () => {
  const t = fakeTimers();
  const calls = [];
  const fn = debounce((v) => calls.push(v), 250, t.setTimer, t.clearTimer);
  fn('first');
  t.runLast();
  fn('second');
  t.runLast();
  assert.deepEqual(calls, ['first', 'second']);
});

test('debounce uses the injected delay', () => {
  const t = fakeTimers();
  debounce(() => {}, 999, t.setTimer, t.clearTimer)('x');
  assert.equal(t.scheduled.at(-1).delay, 999);
});

test('debounce defaults to the exported delay', () => {
  const t = fakeTimers();
  debounce(() => {}, undefined, t.setTimer, t.clearTimer)('x');
  assert.equal(t.scheduled.at(-1).delay, SEARCH_DELAY_MS);
});

test('the debounce delay is short enough to feel immediate', () => {
  assert.ok(SEARCH_DELAY_MS > 0);
  assert.ok(SEARCH_DELAY_MS <= 400, 'a longer wait reads as lag');
});

test('limitMatches passes everything through when under the cap', () => {
  const matches = Array.from({ length: 5 }, (_, i) => ({ productId: i }));
  const out = limitMatches(matches);
  assert.equal(out.shown.length, 5);
  assert.equal(out.hidden, 0);
  assert.equal(out.total, 5);
});

test('limitMatches caps a wall of matches and counts the rest', () => {
  const matches = Array.from({ length: 1236 }, (_, i) => ({ productId: i }));
  const out = limitMatches(matches);
  assert.equal(out.shown.length, MAX_RESULTS);
  assert.equal(out.hidden, 1236 - MAX_RESULTS);
  assert.equal(out.total, 1236, 'the total stays truthful, not the shown count');
});

test('limitMatches is exact at the boundary', () => {
  const exact = Array.from({ length: MAX_RESULTS }, (_, i) => ({ productId: i }));
  const over = Array.from({ length: MAX_RESULTS + 1 }, (_, i) => ({ productId: i }));
  assert.equal(limitMatches(exact).hidden, 0);
  assert.equal(limitMatches(over).hidden, 1);
});

test('limitMatches keeps the first matches in order', () => {
  const matches = [{ productId: 7 }, { productId: 8 }, { productId: 9 }];
  assert.deepEqual(limitMatches(matches, 2).shown, [{ productId: 7 }, { productId: 8 }]);
});

test('limitMatches tolerates empty and non-array input', () => {
  assert.deepEqual(limitMatches([]), { shown: [], hidden: 0, total: 0 });
  assert.deepEqual(limitMatches(null), { shown: [], hidden: 0, total: 0 });
  assert.deepEqual(limitMatches(undefined), { shown: [], hidden: 0, total: 0 });
});

test('limitMatches does not mutate the input', () => {
  const matches = Array.from({ length: 100 }, (_, i) => ({ productId: i }));
  limitMatches(matches);
  assert.equal(matches.length, 100);
});

test('matchesNote states the count with no truncation notice', () => {
  assert.equal(matchesNote('name', 20, 0), '20 cartas coinciden.');
  assert.equal(matchesNote('name', 1, 0), '1 carta coincide.');
});

test('matchesNote says how many were hidden', () => {
  const note = matchesNote('name', 1236, 1196);
  assert.ok(note.includes('1236'), 'reports the real total');
  assert.ok(note.includes(String(MAX_RESULTS)), 'reports how many are shown');
  assert.ok(note.includes('afina'), 'tells the user what to do');
});

test('matchesNote words a number search differently from a name search', () => {
  assert.ok(matchesNote('number', 3, 0).includes('números'));
  assert.ok(matchesNote('number', 1, 0).includes('número'));
  assert.ok(matchesNote('name', 3, 0).includes('cartas'));
});

test('matchesNote singular stays singular even when truncated', () => {
  const note = matchesNote('name', 1, 0);
  assert.ok(note.includes('1 carta coincide'));
  assert.ok(!note.includes('cartas'), 'never pluralizes a single match');
});
