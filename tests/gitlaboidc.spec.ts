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

test('createFlakinessAccessToken() passes through tokens it cannot parse', async () => {
  // The server is the authority on token validity; an unparseable token must reach it
  // instead of failing locally with a confusing audience error.
  for (const token of ['not-a-jwt', idToken({}), 'header.@@@.signature'])
    expect(await new GitlabOIDC(token).createFlakinessAccessToken('flakiness/nodejs-sdk')).toBe(token);
});
