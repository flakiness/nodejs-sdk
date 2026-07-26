/**
 * Provides GitLab CI/CD OIDC (OpenID Connect) authentication.
 *
 * Enables passwordless authentication with Flakiness.io from GitLab CI/CD pipelines
 * using GitLab ID tokens. Used internally by {@link uploadReport} for automatic
 * authentication, but can also be used directly.
 *
 * Unlike GitHub Actions — where the SDK mints an OIDC token at runtime and picks the
 * `aud` claim itself — GitLab mints ID tokens when the job starts and exposes them as
 * environment variables. The audience is therefore declared in `.gitlab-ci.yml` and must
 * match the flakiness project the report is uploaded to:
 *
 * ```yaml
 * test:
 *   id_tokens:
 *     FLAKINESS_ID_TOKEN:
 *       aud: my-org/my-project
 *   script:
 *     - npm test
 * ```
 *
 * `aud` expands CI/CD variables (GitLab 16.1+), so a shared pipeline template can use
 * `aud: $FLAKINESS_PROJECT`.
 *
 * @example
 * ```typescript
 * const oidc = GitlabOIDC.initializeFromEnv();
 * if (oidc) {
 *   const token = await oidc.createFlakinessAccessToken('my-org/my-project');
 * }
 * ```
 */
export class GitlabOIDC {
  /**
   * Creates a GitlabOIDC instance from GitLab CI/CD environment variables.
   *
   * Reads the `FLAKINESS_ID_TOKEN` environment variable, which GitLab CI/CD sets for jobs
   * that declare an `id_tokens: FLAKINESS_ID_TOKEN:` entry in `.gitlab-ci.yml`.
   *
   * @returns {GitlabOIDC | undefined} A GitlabOIDC instance if the environment variable is
   *   present, or `undefined` if not running in GitLab CI/CD with an ID token configured.
   */
  static initializeFromEnv(): GitlabOIDC|undefined {
    const idToken = process.env.FLAKINESS_ID_TOKEN;
    return idToken ? new GitlabOIDC(idToken) : undefined;
  }

  /**
   * Human-readable name of the CI provider, suitable for log messages.
   *
   * To branch on the provider, use `oidc instanceof GitlabOIDC` instead — this string is meant
   * for humans and may be reworded.
   */
  readonly name = 'GitLab CI/CD';

  constructor(
    private _idToken: string,
  ) {

  }

  /**
   * Returns the Flakiness access token for the specified project — the GitLab ID token itself.
   *
   * This method succeeds as long as the ID token names `flakinessProject` in its `aud` claim.
   * However, the returned token can only be used to upload reports if the Flakiness.io project
   * is bound to the GitLab project running the pipeline. If the project is not bound,
   * Flakiness.io will reject the token on upload.
   *
   * @param {string} flakinessProject - The flakiness project identifier in `"org/project"` format.
   *
   * @returns {Promise<string>} A Flakiness access token.
   *
   * @throws {Error} If the ID token's `aud` claim does not include `flakinessProject`. GitLab
   *   bakes the audience into the token when the job starts, so this can only be fixed in
   *   `.gitlab-ci.yml`.
   */
  async createFlakinessAccessToken(flakinessProject: string) {
    // The audience is baked into the token by GitLab and cannot be changed at runtime, so a
    // mismatch is a `.gitlab-ci.yml` misconfiguration that the server would reject anyway.
    const audience = jwtAudience(this._idToken);
    if (audience && !audience.includes(flakinessProject)) {
      throw new Error([
        `GitLab ID token audience is ${audience.map(aud => JSON.stringify(aud)).join(', ')}, but the report uploads to "${flakinessProject}".`,
        `Set the audience of the FLAKINESS_ID_TOKEN id_token in .gitlab-ci.yml to "${flakinessProject}".`,
      ].join(' '));
    }
    return this._idToken;
  }
}

/**
 * Reads the `aud` claim from a JWT without verifying the signature; the Flakiness.io server
 * is the one that verifies the token. Returns `undefined` if the token cannot be parsed, in
 * which case the token is passed through and the server reports the problem.
 */
function jwtAudience(jwt: string): string[]|undefined {
  const payload = jwt.split('.')[1];
  if (!payload)
    return undefined;
  try {
    const { aud } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof aud === 'string')
      return [aud];
    if (Array.isArray(aud) && aud.every(entry => typeof entry === 'string'))
      return aud;
    return undefined;
  } catch {
    return undefined;
  }
}
