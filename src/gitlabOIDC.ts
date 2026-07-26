import type { OIDCProvider } from './oidc.js';

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
export class GitlabOIDC implements OIDCProvider {
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
   * @throws {Error} If the ID token is not a JWT, carries no `aud` claim, or its `aud` claim
   *   does not include `flakinessProject`. GitLab mints the token when the job starts, so all
   *   three can only be fixed in `.gitlab-ci.yml`.
   */
  async createFlakinessAccessToken(flakinessProject: string) {
    // Every check below is a `.gitlab-ci.yml` misconfiguration that cannot be fixed at runtime
    // and that the server would reject anyway, so failing here with a precise message beats
    // letting the upload come back as a bare 401.
    const payload = jwtPayload(this._idToken);
    if (!payload) {
      throw new Error([
        `GitLab ID token is not a JWT.`,
        `Check that FLAKINESS_ID_TOKEN comes from an id_tokens entry with \`aud: ${flakinessProject}\` in .gitlab-ci.yml.`,
      ].join(' '));
    }

    const audience = audienceClaim(payload);
    if (!audience.length) {
      throw new Error([
        `GitLab ID token has no audience, so it cannot upload to "${flakinessProject}".`,
        `Declare the FLAKINESS_ID_TOKEN id_token with \`aud: ${flakinessProject}\` in .gitlab-ci.yml.`,
      ].join(' '));
    }
    if (!audience.includes(flakinessProject)) {
      throw new Error([
        `GitLab ID token audience is ${audience.map(aud => JSON.stringify(aud)).join(', ')}, but the report uploads to "${flakinessProject}".`,
        `Set the audience of the FLAKINESS_ID_TOKEN id_token in .gitlab-ci.yml to "${flakinessProject}".`,
      ].join(' '));
    }
    return this._idToken;
  }
}

/**
 * Reads a JWT payload without verifying the signature; the Flakiness.io server is the one that
 * verifies the token. Returns `undefined` if the token is not a JWT.
 */
function jwtPayload(jwt: string): Record<string, unknown>|undefined {
  const payload = jwt.split('.')[1];
  if (!payload)
    return undefined;
  try {
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json && typeof json === 'object' && !Array.isArray(json) ? json : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes the `aud` claim, which a JWT may carry as either a string or an array of strings,
 * into a list. Returns an empty list when the claim is absent or unusable.
 */
function audienceClaim(payload: Record<string, unknown>): string[] {
  const aud = payload['aud'];
  if (typeof aud === 'string')
    return [aud];
  if (Array.isArray(aud))
    return aud.filter(entry => typeof entry === 'string');
  return [];
}
