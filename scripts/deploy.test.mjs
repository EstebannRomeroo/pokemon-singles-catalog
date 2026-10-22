import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idsOf, syncReport, deployMessage, parseChangedPaths, parsePendingCommits, decideAction, generatedChanges } from './deploy.mjs';

// The whole point of the script is to tell the user what is about to be published,
// so the sync report is the piece that must never lie.
test('idsOf reads the inventory entry ids', () => {
  const singles = [
    { game: 'magic', product: 631132 },
    { game: 'pokemon', product: 684320 },
  ];
  assert.deepEqual(idsOf(singles), ['magic-631132', 'pokemon-684320']);
});

// catalog.json items already carry the "game-product" id, so they are read as-is.
test('idsOf accepts catalog items by their id field', () => {
  const catalog = { items: [{ id: 'magic-631132' }, { id: 'pokemon-684320' }] };
  assert.deepEqual(idsOf(catalog), ['magic-631132', 'pokemon-684320']);
});

test('idsOf tolerates a missing or non-array inventory', () => {
  assert.deepEqual(idsOf([]), []);
  assert.deepEqual(idsOf({ items: [] }), []);
  assert.deepEqual(idsOf(null), []);
  assert.deepEqual(idsOf(undefined), []);
});

// The two directions matter: a new card is missing from the catalog, and a sold card
// is still present in it. Reporting only one direction would hide half the problem.
test('syncReport names both missing and stale entries', () => {
  const singles = [
    { game: 'magic', product: 1 },
    { game: 'magic', product: 2 },
  ];
  const catalog = { items: [{ id: 'magic-1' }, { id: 'magic-3' }] };
  const report = syncReport(singles, catalog);
  assert.deepEqual(report.missing, ['magic-2']);
  assert.deepEqual(report.stale, ['magic-3']);
  assert.equal(report.inSync, false);
});

test('syncReport reports in-sync when both sides match', () => {
  const singles = [{ game: 'magic', product: 1 }];
  const catalog = { items: [{ id: 'magic-1' }] };
  const report = syncReport(singles, catalog);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.stale, []);
  assert.equal(report.inSync, true);
});

// A deploy must never invent a commit message, so the message is derived from the
// actual changed paths rather than from a fixed string.
test('deployMessage describes the actual change', () => {
  assert.equal(deployMessage(['singles.json']), 'chore: publish inventory');
  assert.equal(deployMessage(['singles.json', 'catalog.json']), 'chore: publish inventory');
});

test('deployMessage names a price-only refresh', () => {
  assert.equal(deployMessage(['catalog.json']), 'chore: refresh prices');
});

test('deployMessage falls back for other paths', () => {
  assert.equal(deployMessage(['README.md']), 'chore: update catalog files');
});

// The confirm prompt must show the user exactly what git saw, nothing more.
test('parseChangedPaths reads porcelain status lines', () => {
  const porcelain = ' M catalog.json\n M singles.json\n?? odd/tasks/x.md\n';
  assert.deepEqual(parseChangedPaths(porcelain), ['catalog.json', 'singles.json', 'odd/tasks/x.md']);
});

test('parseChangedPaths ignores blank lines and handles an empty tree', () => {
  assert.deepEqual(parseChangedPaths(''), []);
  assert.deepEqual(parseChangedPaths('\n\n'), []);
});

// git status only sees the working tree, so a committed-but-unpushed change looks
// identical to "nothing to do". That blindness is the exact failure this script
// exists to prevent: a commit made, a push forgotten, and a public site frozen
// with no signal. Pending commits are therefore a separate, first-class input.
test('parsePendingCommits reads short-hash and subject from git log', () => {
  const log = '5dd90a4 feat: add npm run deploy\n1c5f9ea docs: record the outcome\n';
  assert.deepEqual(parsePendingCommits(log), [
    { short: '5dd90a4', subject: 'feat: add npm run deploy' },
    { short: '1c5f9ea', subject: 'docs: record the outcome' },
  ]);
});

test('parsePendingCommits ignores blank lines and handles an empty log', () => {
  assert.deepEqual(parsePendingCommits(''), []);
  assert.deepEqual(parsePendingCommits('\n\n'), []);
});

test('parsePendingCommits tolerates a subject containing no space', () => {
  assert.deepEqual(parsePendingCommits('abc1234'), [{ short: 'abc1234', subject: '' }]);
});

// The decision has to cover both halves of "not published yet": uncommitted work
// in the tree, and commits already made but not pushed. Reporting only the first
// is what made the previous version silently say "nothing to publish" while a
// finished card sat in an unpushed commit.
test('decideAction publishes tree changes', () => {
  assert.deepEqual(decideAction(['catalog.json'], []), { publish: true, commit: true });
});

test('decideAction publishes pending commits without making an empty commit', () => {
  // Nothing to commit, but something to push. Committing here would create an
  // empty commit, so the commit step is skipped while the publish still happens.
  assert.deepEqual(decideAction([], ['5dd90a4 feat: x']), { publish: true, commit: false });
});

test('decideAction does nothing when the tree is clean and nothing is pending', () => {
  assert.deepEqual(decideAction([], []), { publish: false, commit: false });
});

test('decideAction both commits and publishes when work exists on both sides', () => {
  assert.deepEqual(decideAction(['singles.json'], ['5dd90a4 feat: x']), { publish: true, commit: true });
});


// Before pulling, only regenerated output may be dropped: catalog.json is rebuilt
// right after, while singles.json holds the user's edits and must survive.
test('generatedChanges picks only catalog.json among changed paths', () => {
  assert.deepEqual(generatedChanges(['singles.json', 'catalog.json', 'admin.html']), ['catalog.json']);
  assert.deepEqual(generatedChanges(['singles.json']), []);
  assert.deepEqual(generatedChanges([]), []);
});
