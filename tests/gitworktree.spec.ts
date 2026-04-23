import { test, expect } from '@playwright/test';
import path from 'path';
import { GitWorktree } from '../src/gitWorktree.js';

function initializeOrThrow(somePath: string) {
  const result = GitWorktree.initialize(somePath);
  if (!result.ok)
    throw new Error(result.error);
  return result;
}

test('GitWorktree.initialize() should work', () => {
  const result = GitWorktree.initialize('.');
  expect(result.ok).toBe(true);
  if (!result.ok)
    return;
  expect(result.commitId).toMatch(/^[0-9a-f]{40}$/);
  expect(result.worktree.rootPath()).toBeTruthy();
});

test('GitWorktree.initialize() returns error for non-git path', () => {
  const result = GitWorktree.initialize('/');
  expect(result.ok).toBe(false);
  if (result.ok)
    return;
  expect(result.error).toBeTruthy();
});

test('rootPath() returns an absolute path containing this repo', () => {
  const { worktree } = initializeOrThrow('.');
  const root = worktree.rootPath();
  expect(path.isAbsolute(root)).toBe(true);
  // The root should be an ancestor of the current working directory
  expect(process.cwd().startsWith(path.normalize(root))).toBe(true);
});

test('GitWorktree.gitPath() converts absolute path to git-relative', () => {
  const { worktree } = initializeOrThrow('.');
  const gitPath = worktree.gitPath(worktree.rootPath() + '/package.json');
  expect(gitPath).toBe('package.json');
});

test('GitWorktree.gitPath() works for nested paths', () => {
  const { worktree } = initializeOrThrow('.');
  const gitPath = worktree.gitPath(worktree.rootPath() + '/src/gitWorktree.ts');
  expect(gitPath).toBe('src/gitWorktree.ts');
});

test('GitWorktree.absolutePath() converts git-relative to native absolute', () => {
  const { worktree } = initializeOrThrow('.');
  const absPath = worktree.absolutePath('package.json');
  expect(absPath).toBe(path.join(worktree.rootPath(), 'package.json'));
});

test('GitWorktree.gitPath() and absolutePath() are inverses', () => {
  const { worktree } = initializeOrThrow('.');
  const original = path.join(worktree.rootPath(), 'src', 'gitWorktree.ts');
  const roundtripped = worktree.absolutePath(worktree.gitPath(original));
  expect(roundtripped).toBe(original);
});

test('GitWorktree.listCommits() returns recent commits', async () => {
  const { worktree, commitId } = initializeOrThrow('.');
  // In pull requests, we cannot checkout with proper history.
  // But 3 commits we're given :-)
  const commits = await worktree.listCommits(3);
  expect(commits.length).toBe(3);
  expect(commits[0].commitId).toMatch(/^[0-9a-f]{40}$/);
  expect(commits[0].timestamp).toBeGreaterThan(0);
  expect(commits[0].message).toBeTruthy();
  expect(commits[0].commitId).toBe(commitId);
});
