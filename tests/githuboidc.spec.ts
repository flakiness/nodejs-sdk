import { test, expect } from '@playwright/test';
import { GithubOIDC } from '../src/githubOIDC.js';

test.skip(!process.env.GITHUB_ACTIONS, 'Only runs in GitHub Actions');
test.skip(!process.env.ACTIONS_ID_TOKEN_REQUEST_URL, 'Github OIDC not available — needs id-token: write permission');

test('initializeFromEnv() mints a flakiness token in GitHub Actions with id-token:write', async () => {
  const oidc = GithubOIDC.initializeFromEnv();
  expect(oidc).toBeTruthy();
  const token = await oidc!.createFlakinessAccessToken('flakiness/nodejs-sdk');
  expect(token).toBeTruthy();
});
