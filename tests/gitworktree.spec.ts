import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { GitWorktree } from '../src/gitWorktree.js';

test('create() returns a GitWorktree for the current repo', () => {
  const wt = GitWorktree.create('.');
  expect(wt).toBeTruthy();
  expect(wt.rootPath()).toBeTruthy();
});

test('rootPath() returns an absolute path containing this repo', () => {
  const wt = GitWorktree.create('.');
  const root = wt.rootPath();
  expect(path.isAbsolute(root)).toBe(true);
  // The root should be an ancestor of the current working directory
  expect(process.cwd().startsWith(path.normalize(root))).toBe(true);
});

test('headCommitId() returns a 40-char SHA', () => {
  const wt = GitWorktree.create('.');
  const commitId = wt.headCommitId();
  expect(commitId).toMatch(/^[0-9a-f]{40}$/);
});

test('gitPath() converts absolute path to git-relative', () => {
  const wt = GitWorktree.create('.');
  const gitPath = wt.gitPath(wt.rootPath() + '/package.json');
  expect(gitPath).toBe('package.json');
});

test('gitPath() works for nested paths', () => {
  const wt = GitWorktree.create('.');
  const gitPath = wt.gitPath(wt.rootPath() + '/src/gitWorktree.ts');
  expect(gitPath).toBe('src/gitWorktree.ts');
});

test('absolutePath() converts git-relative to native absolute', () => {
  const wt = GitWorktree.create('.');
  const absPath = wt.absolutePath('package.json');
  expect(absPath).toBe(path.join(wt.rootPath(), 'package.json'));
});

test('gitPath() and absolutePath() are inverses', () => {
  const wt = GitWorktree.create('.');
  const original = path.join(wt.rootPath(), 'src', 'gitWorktree.ts');
  const roundtripped = wt.absolutePath(wt.gitPath(original));
  expect(roundtripped).toBe(original);
});

test('listCommits() returns recent commits', async () => {
  const wt = GitWorktree.create('.');
  const commits = await wt.listCommits(5);
  expect(commits.length).toBeGreaterThan(0);
  expect(commits[0].commitId).toMatch(/^[0-9a-f]{40}$/);
  expect(commits[0].timestamp).toBeGreaterThan(0);
  expect(commits[0].message).toBeTruthy();
});

test('listCommits() HEAD matches headCommitId()', async () => {
  const wt = GitWorktree.create('.');
  const commits = await wt.listCommits(1);
  expect(commits[0].commitId).toBe(wt.headCommitId());
});

