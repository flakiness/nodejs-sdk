/**
 * GitHub Actions OIDC token support for Flakiness.io authentication.
 *
 * When running in GitHub Actions with `permissions: id-token: write`,
 * this module can request an OIDC token from GitHub and use it to
 * authenticate with the Flakiness.io upload API instead of a static
 * access token.
 *
 * The OIDC token's `aud` (audience) claim is set to the Flakiness.io
 * project identifier in `org/proj` format.
 */

/**
 * Returns `true` when running inside GitHub Actions with OIDC token
 * request capability (i.e. the job has `permissions: id-token: write`).
 */
export function isGitHubOIDCAvailable(): boolean {
  return !!(process.env.ACTIONS_ID_TOKEN_REQUEST_URL && process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN);
}

/**
 * Requests a GitHub Actions OIDC token with the given audience claim.
 *
 * @param audience - The `aud` claim value, formatted as `org/proj`
 *   (e.g. `"my-org/my-project"`). This must match the project
 *   configured on flakiness.io.
 * @returns The OIDC JWT string.
 * @throws If the token request fails or the required environment
 *   variables are not set.
 */
export async function requestGitHubOIDCToken(audience: string): Promise<string> {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken)
    throw new Error('GitHub OIDC environment variables are not available. Ensure the job has `permissions: id-token: write`.');

  const url = new URL(requestUrl);
  url.searchParams.set('audience', audience);

  const response = await fetch(url, {
    headers: {
      'Authorization': `bearer ${requestToken}`,
      'Accept': 'application/json; api-version=2.0',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to request GitHub OIDC token: ${response.status} ${body}`);
  }

  const json = await response.json() as { value?: string };
  if (!json.value)
    throw new Error('GitHub OIDC token response did not contain a token value.');

  return json.value;
}
