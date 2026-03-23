import { test, expect } from '@playwright/test';
import { CIUtils } from '../src/ciUtils.js';

const isGitHubActions = !!process.env.GITHUB_ACTIONS;

test('returns a valid GitHub Actions URL', () => {
  test.skip(!isGitHubActions, 'Only runs in GitHub Actions');
  const url = CIUtils.runUrl();
  expect(url).toBeTruthy();
  expect(url).toContain('/actions/runs/');
  expect(url).toContain(process.env.GITHUB_RUN_ID!);
  // Verify it's a parseable URL
  expect(() => new URL(url!)).not.toThrow();
});

test('returns a valid runTitle', () => {
  test.skip(!isGitHubActions, 'Only runs in GitHub Actions');
  const title = CIUtils.runTitle();
  expect(title).toBeTruthy();
});
