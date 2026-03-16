import { test, expect } from '@playwright/test';
import { GithubOIDC } from '../src/githubOIDC.js';

const isGitHubActions = !!process.env.GITHUB_ACTIONS;

test('initializeFromEnv() returns undefined outside GitHub Actions', () => {
  test.skip(isGitHubActions, 'Only runs outside GitHub Actions');
  expect(GithubOIDC.initializeFromEnv()).toBeUndefined();
});

test('initializeFromEnv() returns an instance in GitHub Actions with id-token:write', () => {
  test.skip(!isGitHubActions, 'Only runs in GitHub Actions');
  test.skip(!process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'OIDC not available — needs id-token: write permission');
  const oidc = GithubOIDC.initializeFromEnv();
  expect(oidc).toBeTruthy();
});
