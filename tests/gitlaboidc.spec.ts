import { test, expect } from '@playwright/test';
import { GitlabOIDC } from '../src/gitlabOIDC.js';

function idToken(payload: object) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${encode(payload)}.signature`;
}

test('initializeFromEnv() picks up FLAKINESS_ID_TOKEN', async () => {
  const token = idToken({ aud: 'flakiness/nodejs-sdk', iss: 'https://gitlab.com' });
  const original = process.env.FLAKINESS_ID_TOKEN;
  process.env.FLAKINESS_ID_TOKEN = token;
  try {
    const oidc = GitlabOIDC.initializeFromEnv();
    expect(oidc).toBeTruthy();
    expect(await oidc!.createFlakinessAccessToken('flakiness/nodejs-sdk')).toBe(token);
  } finally {
    if (original === undefined)
      delete process.env.FLAKINESS_ID_TOKEN;
    else
      process.env.FLAKINESS_ID_TOKEN = original;
  }
});

test('initializeFromEnv() returns undefined without FLAKINESS_ID_TOKEN', async () => {
  const original = process.env.FLAKINESS_ID_TOKEN;
  delete process.env.FLAKINESS_ID_TOKEN;
  try {
    expect(GitlabOIDC.initializeFromEnv()).toBe(undefined);
  } finally {
    if (original !== undefined)
      process.env.FLAKINESS_ID_TOKEN = original;
  }
});

// A JWT `aud` claim may be a string or an array of strings, so the audience check is a
// membership test. Scoping a token to a single project is what the SDK documents.
test('createFlakinessAccessToken() handles an array `aud` claim', async () => {
  const token = idToken({ aud: ['flakiness/other-project', 'flakiness/nodejs-sdk'] });
  const oidc = new GitlabOIDC(token);
  expect(await oidc.createFlakinessAccessToken('flakiness/nodejs-sdk')).toBe(token);
});

test('createFlakinessAccessToken() rejects a mismatching audience', async () => {
  const oidc = new GitlabOIDC(idToken({ aud: 'https://gitlab.com' }));
  await expect(oidc.createFlakinessAccessToken('flakiness/nodejs-sdk')).rejects.toThrow(/audience is "https:\/\/gitlab.com"/);
});

test('createFlakinessAccessToken() rejects a token with no audience', async () => {
  // A token without an `aud` claim means the id_token was never declared with an audience.
  for (const payload of [{}, { aud: [] }, { aud: 42 }, { iss: 'https://gitlab.com' }]) {
    const oidc = new GitlabOIDC(idToken(payload));
    await expect(oidc.createFlakinessAccessToken('flakiness/nodejs-sdk')).rejects.toThrow(/has no audience/);
  }
});

test('createFlakinessAccessToken() rejects tokens that are not JWTs', async () => {
  // A GitLab ID token is always a JWT, so anything else means FLAKINESS_ID_TOKEN was set to
  // something that is not an ID token.
  for (const token of ['', 'not-a-jwt', 'header.', 'header.@@@.signature', `header.${Buffer.from('[]').toString('base64url')}.signature`]) {
    const oidc = new GitlabOIDC(token);
    await expect(oidc.createFlakinessAccessToken('flakiness/nodejs-sdk')).rejects.toThrow(/is not a JWT/);
  }
});
