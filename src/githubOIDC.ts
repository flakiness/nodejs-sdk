/**
 * Provides GitHub Actions OIDC (OpenID Connect) token exchange.
 *
 * Enables passwordless authentication with Flakiness.io from GitHub Actions workflows
 * by exchanging GitHub's OIDC tokens for Flakiness access tokens. Used internally by
 * {@link uploadReport} for automatic authentication, but can also be used directly.
 *
 * Requires the workflow to have `id-token: write` permission.
 *
 * @example
 * ```typescript
 * const oidc = GithubOIDC.initializeFromEnv();
 * if (oidc) {
 *   const token = await oidc.createFlakinessAccessToken('my-org/my-project');
 * }
 * ```
 */
export class GithubOIDC {
  /**
   * Creates a GithubOIDC instance from GitHub Actions environment variables.
   *
   * Reads the `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN`
   * environment variables that GitHub Actions sets for jobs with `id-token: write` permission.
   *
   * @returns {GithubOIDC | undefined} A GithubOIDC instance if both environment variables
   *   are present, or `undefined` if not running in GitHub Actions with OIDC enabled.
   */
  static initializeFromEnv(): GithubOIDC|undefined {
    const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    return requestUrl && requestToken ? new GithubOIDC(requestUrl, requestToken) : undefined;
  }

  constructor(
    private _requestUrl: string,
    private _requestToken: string,
  ) {

  }

  /**
   * Mints a Flakiness access token for the specified project via GitHub OIDC.
   *
   * This method always succeeds as long as the GitHub Actions environment is properly
   * configured. However, the returned token can only be used to upload reports if the
   * Flakiness.io project is bound to the GitHub repository running the workflow.
   * If the project is not bound, Flakiness.io will reject the token on upload.
   *
   * @param {string} flakinessProject - The flakiness project identifier in `"org/project"` format.
   *
   * @returns {Promise<string>} A Flakiness access token.
   *
   * @throws {Error} If the token request fails or the response does not contain a token value.
   */
  async createFlakinessAccessToken(flakinessProject: string) {
    const url = new URL(this._requestUrl);
    url.searchParams.set('audience', flakinessProject);

    const response = await fetch(url, {
      headers: {
        'Authorization': `bearer ${this._requestToken}`,
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
}
