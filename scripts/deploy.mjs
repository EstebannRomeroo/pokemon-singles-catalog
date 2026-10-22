import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

// One command for the last three steps of the publish flow.
//
// Why it exists: `npm run prices` reports what it did, but `git push` prints nothing
// on success. That silence is why a finished inventory sat unpublished for two hours:
// the step that failed was the one with no feedback. This script makes the publish
// step visible and asks before it does anything irreversible.
//
// What it will never do: force-push, touch a branch other than the current one, or
// publish without an explicit confirmation.

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// catalog.json items already carry a "game-product" id; singles.json entries do not,
// so both shapes are accepted here and normalized to the same key.
export function idsOf(source) {
  const rows = Array.isArray(source) ? source : (source?.items ?? []);
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => row?.id ?? (row?.game != null && row?.product != null ? `${row.game}-${row.product}` : null))
    .filter((id) => typeof id === 'string');
}

// Both directions are reported: a new card is missing from the catalog, and a sold
// card is still present in it. Reporting one direction would hide half the problem.
export function syncReport(singles, catalog) {
  const have = new Set(idsOf(singles));
  const shown = new Set(idsOf(catalog));
  const missing = [...have].filter((id) => !shown.has(id)).sort();
  const stale = [...shown].filter((id) => !have.has(id)).sort();
  return { missing, stale, inSync: missing.length === 0 && stale.length === 0 };
}

export function deployMessage(paths) {
  if (paths.includes('singles.json')) return 'chore: publish inventory';
  if (paths.includes('catalog.json')) return 'chore: refresh prices';
  return 'chore: update catalog files';
}

// `git status --porcelain` prefixes every line with a two-character status code.
export function parseChangedPaths(porcelain) {
  return porcelain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(line.indexOf(' ') + 1).trim())
    .filter(Boolean);
}

// `git log --oneline` yields "<short-hash> <subject>". The subject is kept whole
// because it is shown to the user verbatim in the confirmation prompt.
export function parsePendingCommits(oneline) {
  return oneline
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const boundary = line.indexOf(' ');
      if (boundary === -1) return { short: line, subject: '' };
      return { short: line.slice(0, boundary), subject: line.slice(boundary + 1).trim() };
    });
}

// Two independent reasons to publish: uncommitted work in the tree, and commits
// already made but not pushed. A pending commit alone must not create a commit —
// the tree is clean, so that would only produce an empty commit.
export function decideAction(changedPaths, pendingCommits) {
  const hasPending = pendingCommits.length > 0;
  return {
    publish: changedPaths.length > 0 || hasPending,
    commit: changedPaths.length > 0,
  };
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const readJson = async (file) => JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

async function main() {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  if (branch !== 'main') {
    console.error(`Estás en la rama "${branch}", no en main. Publicar solo desde main.`);
    process.exit(1);
  }

  // Two independent signals. `git status` sees only the working tree; a commit
  // that was made but never pushed leaves the tree clean, so status alone would
  // report "nothing to publish" for exactly the failure this script exists to
  // prevent. Both are read before deciding anything.
  const pending = parsePendingCommits(git('log', `origin/${branch}..HEAD`, '--oneline'));

  // Always regenerate first: a singles.json already committed and pushed leaves
  // a clean tree, yet catalog.json can still be stale. Deciding before this step
  // reported "nothing to publish" while the site showed the old inventory.
  console.log('Regenerando catalog.json…');
  try {
    execFileSync('npm', ['run', 'prices'], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    console.error('\nFalló npm run prices. No se publicó nada.');
    process.exit(1);
  }

  // Regenerating may have changed catalog.json, so the report is read afterwards.
  const singles = await readJson('singles.json');
  const catalog = await readJson('catalog.json');
  const report = syncReport(singles, catalog);

  console.log('');
  console.log(`  singles.json : ${plural(idsOf(singles).length, 'entrada', 'entradas')}`);
  console.log(`  catalog.json : ${plural(idsOf(catalog).length, 'item', 'items')}`);
  if (!report.inSync) {
    // Not fatal: a manual price or a qty change is a legitimate publish on its own.
    if (report.missing.length) console.log(`  sin publicar : ${report.missing.join(', ')}`);
    if (report.stale.length) console.log(`  obsoletas    : ${report.stale.join(', ')}`);
  }

  const paths = parseChangedPaths(git('status', '--porcelain'));
  const action = decideAction(paths, pending);
  if (!action.publish) {
    console.log('');
    console.log('No hay cambios que publicar.');
    return;
  }

  console.log('');
  if (paths.length) {
    console.log('  Archivos modificados sin commitear:');
    for (const path of paths) console.log(`    M ${path}`);
  }
  if (pending.length) {
    // This is the case the previous version missed entirely.
    console.log(`  ${plural(pending.length, 'commit local sin publicar', 'commits locales sin publicar')}:`);
    for (const commit of pending) console.log(`    ${commit.short} ${commit.subject}`);
  }
  console.log('');

  const rl = createInterface({ input: stdin, output: stdout });
  let answer = '';
  try {
    answer = (await rl.question(`¿Publicar en ${branch}? (s/n) `)).trim().toLowerCase();
  } finally {
    rl.close();
  }
  if (answer !== 's' && answer !== 'si' && answer !== 'y' && answer !== 'yes') {
    console.log('No se publicó nada.');
    return;
  }

  // A pending commit means the tree is clean, so there is nothing to commit.
  // Skipping it avoids an empty commit while still pushing the work.
  if (action.commit) {
    git('add', '-A');
    git('commit', '-m', deployMessage(paths));
  }
  git('push', 'origin', branch);

  const head = git('rev-parse', '--short', 'HEAD').trim();
  console.log('');
  console.log(`✓ publicado ${head} → origin/${branch}`);
  console.log('  GitHub Pages tarda hasta un minuto en servir la versión nueva.');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
