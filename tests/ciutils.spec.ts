import { test, expect } from '@playwright/test';
import { CIUtils } from '../src/ciUtils.js';

const isContainer = process.env.FK_ENV_CONTAINER === '1';
const isGitHubActions = !!process.env.GITHUB_ACTIONS;

test('runUrl() returns undefined outside CI', () => {
  test.skip(isGitHubActions, 'Only runs outside GitHub Actions');
  expect(CIUtils.runUrl()).toBeUndefined();
});

test('runUrl() returns a valid GitHub Actions URL', () => {
  test.skip(!isGitHubActions, 'Only runs in GitHub Actions');
  const url = CIUtils.runUrl();
  expect(url).toBeTruthy();
  expect(url).toContain('/actions/runs/');
  expect(url).toContain(process.env.GITHUB_RUN_ID!);
  // Verify it's a parseable URL
  expect(() => new URL(url!)).not.toThrow();
});

test('runUrl() includes run attempt when available', () => {
  test.skip(!isGitHubActions, 'Only runs in GitHub Actions');
  test.skip(!process.env.GITHUB_RUN_ATTEMPT, 'No GITHUB_RUN_ATTEMPT set');
  const url = CIUtils.runUrl()!;
  expect(url).toContain('attempt=' + process.env.GITHUB_RUN_ATTEMPT);
});
