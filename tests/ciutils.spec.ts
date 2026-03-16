import { test, expect } from '@playwright/test';
import { CIUtils } from '../src/ciUtils.js';

const isGitHubActions = !!process.env.GITHUB_ACTIONS;

test.skip(!isGitHubActions, 'Only runs in GitHub Actions');

test('runUrl() returns a valid GitHub Actions URL', () => {
  const url = CIUtils.runUrl();
  expect(url).toBeTruthy();
  expect(url).toContain('/actions/runs/');
  expect(url).toContain(process.env.GITHUB_RUN_ID!);
  // Verify it's a parseable URL
  expect(() => new URL(url!)).not.toThrow();
});
