import { test, expect } from '@playwright/test';
import path from 'path';
import { GitWorktree } from '../src/gitWorktree.js';

test('GitWorktree.initialize() should work', () => {
  const { error, worktree, commitId } = GitWorktree.initialize('.');
  expect(error).toBeUndefined();
  expect(worktree).toBeTruthy();
  expect(commitId).toMatch(/^[0-9a-f]{40}$/);
  expect(worktree!.rootPath()).toBeTruthy();
});

test('GitWorktree.initialize() returns error for non-git path', () => {
  const { error, worktree, commitId } = GitWorktree.initialize('/');
  expect(error).toBeTruthy();
  expect(worktree).toBeUndefined();
  expect(commitId).toBeUndefined();
});

test('rootPath() returns an absolute path containing this repo', () => {
  const { worktree } = GitWorktree.initialize('.');
  const root = worktree!.rootPath();
  expect(path.isAbsolute(root)).toBe(true);
  // The root should be an ancestor of the current working directory
  expect(process.cwd().startsWith(path.normalize(root))).toBe(true);
});

test('GitWorktree.gitPath() converts absolute path to git-relative', () => {
  const { worktree } = GitWorktree.initialize('.');
  const gitPath = worktree!.gitPath(worktree!.rootPath() + '/package.json');
  expect(gitPath).toBe('package.json');
});

test('GitWorktree.gitPath() works for nested paths', () => {
  const { worktree } = GitWorktree.initialize('.');
  const gitPath = worktree!.gitPath(worktree!.rootPath() + '/src/gitWorktree.ts');
  expect(gitPath).toBe('src/gitWorktree.ts');
});

test('GitWorktree.absolutePath() converts git-relative to native absolute', () => {
  const { worktree } = GitWorktree.initialize('.');
  const absPath = worktree!.absolutePath('package.json');
  expect(absPath).toBe(path.join(worktree!.rootPath(), 'package.json'));
});

test('GitWorktree.gitPath() and absolutePath() are inverses', () => {
  const { worktree } = GitWorktree.initialize('.');
  const original = path.join(worktree!.rootPath(), 'src', 'gitWorktree.ts');
  const roundtripped = worktree!.absolutePath(worktree!.gitPath(original));
  expect(roundtripped).toBe(original);
});

test('GitWorktree.listCommits() returns recent commits', async () => {
  const { worktree, commitId } = GitWorktree.initialize('.');
  // In pull requests, we cannot checkout with proper history.
  // But 3 commits we're given :-)
  const commits = await worktree!.listCommits(3);
  expect(commits.length).toBe(3);
  expect(commits[0].commitId).toMatch(/^[0-9a-f]{40}$/);
  expect(commits[0].timestamp).toBeGreaterThan(0);
  expect(commits[0].message).toBeTruthy();
  expect(commits[0].commitId).toBe(commitId);
});
