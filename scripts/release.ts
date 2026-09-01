#!/usr/bin/env bun
/**
 * Release helper — package.json is the single source of truth for the app version
 * (see ai/decisions.md §23).
 *
 * Usage: bun run release <patch|minor|major|x.y.z> [--dry-run]
 *
 * 1. Computes the next version from package.json (or takes an explicit x.y.z).
 * 2. Rewrites every file that carries the version: package.json,
 *    src/lib/version.ts, src-tauri/Cargo.toml, src-tauri/Cargo.lock.
 *    (src-tauri/tauri.conf.json inherits it via `"version": "../package.json"`
 *    and needs no bump.)
 * 3. Commits the bump as `chore: release vX.Y.Z`, creates tag `vX.Y.Z` and pushes
 *    both. In CI (Release workflow, manual dispatch) this runs as the "version"
 *    job; the build matrix then checks out the tag and attaches the native bundles
 *    to a draft GitHub release.
 *
 * Safety rails: aborts on uncommitted tracked changes or an existing tag (local
 * or on origin) — a re-run can never double-release. --dry-run prints the plan
 * and touches nothing.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname;
const FILES = ['package.json', 'src/lib/version.ts', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

/** Semver weight for "is newer" comparisons (major·10⁶ + minor·10³ + patch). */
const weight = (version: string): number => version.split('.').reduce((acc, part) => acc * 1000 + Number(part), 0);

function nextVersion(current: string, bump: string): string {
  if (!SEMVER.test(current)) {
    fail(`package.json version "${current}" is not x.y.z`);
  }
  if (SEMVER.test(bump)) {
    if (weight(bump) <= weight(current)) {
      fail(`${bump} is not newer than the current ${current}`);
    }
    return bump;
  }
  if (bump !== 'patch' && bump !== 'minor' && bump !== 'major') {
    fail(`usage: bun run release <patch|minor|major|x.y.z> [--dry-run] (got "${bump}")`);
  }
  const [maj, min, pat] = current.split('.').map(Number);
  if (bump === 'major') {
    return `${maj + 1}.0.0`;
  }
  if (bump === 'minor') {
    return `${maj}.${min + 1}.0`;
  }
  return `${maj}.${min}.${pat + 1}`;
}

const esc = (s: string): string => s.replace(/\./g, '\\.');

/** Replaces the first `pattern` match in `file`; aborts when absent — silent drift is worse than a failed release. */
async function rewrite(file: string, pattern: RegExp, replacement: string, next: string): Promise<void> {
  const text = await Bun.file(join(ROOT, file)).text();
  if (!pattern.test(text)) {
    fail(`${file}: expected pattern not found (${pattern}) — file layout changed?`);
  }
  await Bun.write(join(ROOT, file), text.replace(pattern, replacement));
  console.log(`  ✓ ${file} → ${next}`);
}

// --- parse arguments ----------------------------------------------------------
const [bumpArg = '', ...rest] = process.argv.slice(2);
const dry = rest.includes('--dry-run');
if (!bumpArg) {
  fail('usage: bun run release <patch|minor|major|x.y.z> [--dry-run]');
}

// --- safety rails (before touching anything, so a broken tree fails fast) ------
if (!dry) {
  const dirty = (await $`git status --porcelain -uno`.cwd(ROOT).quiet().text()).trim();
  if (dirty) {
    fail(`working tree has uncommitted changes:\n${dirty}\ncommit or stash them first`);
  }
}

const pkgPath = join(ROOT, 'package.json');
let pkg: { version: string } & Record<string, unknown>;
try {
  pkg = await Bun.file(pkgPath).json();
} catch (error) {
  fail(`cannot parse package.json (${error instanceof Error ? error.message : String(error)})`);
}
const current: string = pkg.version;
const next = nextVersion(current, bumpArg);
const tag = `v${next}`;
console.log(`Release ${current} → ${next}${dry ? ' (dry run — nothing will be written)' : ''}`);

if (!dry) {
  const localTag = (await $`git tag -l ${tag}`.cwd(ROOT).quiet().text()).trim();
  if (localTag) {
    fail(`tag ${tag} already exists locally`);
  }
  try {
    const remote = (await $`git ls-remote --tags origin ${tag}`.cwd(ROOT).quiet().text()).trim();
    if (remote) {
      fail(`tag ${tag} already exists on origin — bump to a newer version instead`);
    }
  } catch {
    console.warn('  ⚠ could not reach origin to check for an existing tag — continuing');
  }
}

// --- rewrite version-bearing files ------------------------------------------------
if (dry) {
  console.log(`  would rewrite: ${FILES.join(', ')}`);
} else {
  pkg.version = next;
  await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  ✓ package.json → ${next}`);
  await rewrite('src/lib/version.ts', new RegExp(`APP_VERSION = '${esc(current)}'`), `APP_VERSION = '${next}'`, next);
  await rewrite('src-tauri/Cargo.toml', new RegExp(`version = "${esc(current)}"`), `version = "${next}"`, next);
  // The root package's own entry inside the lockfile (the "version" line right after name = "plan").
  await rewrite(
    'src-tauri/Cargo.lock',
    new RegExp(`name = "plan"\\nversion = "${esc(current)}"`),
    `name = "plan"\nversion = "${next}"`,
    next,
  );
}

// --- commit, tag, push -------------------------------------------------------------
if (!dry) {
  await $`git add ${FILES}`.cwd(ROOT);
  await $`git commit -m ${`chore: release ${tag}`}`.cwd(ROOT);
  await $`git tag ${tag}`.cwd(ROOT);
  console.log(`  ✓ committed and tagged ${tag}`);

  // In CI (workflow_dispatch) GITHUB_REF_NAME is the branch the run was dispatched
  // from; locally fall back to the checked-out branch.
  const branch = process.env.GITHUB_REF_NAME || (await $`git branch --show-current`.cwd(ROOT).quiet().text()).trim();
  if (!branch) {
    fail('could not determine the branch to push to (detached HEAD?)');
  }
  try {
    await $`git push origin HEAD:refs/heads/${branch}`.cwd(ROOT);
    await $`git push origin ${tag}`.cwd(ROOT);
    console.log(`  ✓ pushed commit to ${branch} and tag ${tag}`);
  } catch (error) {
    fail(
      `push failed (${error instanceof Error ? error.message : String(error)}). Commit and tag exist locally — push manually:\n` +
        `  git push origin HEAD:refs/heads/${branch} && git push origin ${tag}`,
    );
  }
  // The Release workflow's build job reads the tag from this output.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
  }
}

console.log(`✔ ${dry ? 'dry run complete' : `released ${tag}`}`);
