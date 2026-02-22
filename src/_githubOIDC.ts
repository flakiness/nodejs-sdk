export class GithubOIDC {
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

  async fetchToken(audience: string) {
    const url = new URL(this._requestUrl);
    url.searchParams.set('audience', audience);

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
