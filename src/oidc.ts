import { GithubOIDC } from './githubOIDC.js';
import { GitlabOIDC } from './gitlabOIDC.js';

/**
 * A CI provider that can mint a Flakiness access token without a stored secret.
 *
 * Implemented by {@link GithubOIDC} and {@link GitlabOIDC}. Use `instanceof` to tell them apart.
 */
export type OIDCProvider = {
  /** Human-readable name of the CI provider, suitable for log messages. */
  readonly name: string;

  /**
   * Mints a Flakiness access token for the specified project.
   *
   * @param {string} flakinessProject - The flakiness project identifier in `"org/project"` format.
   * @returns {Promise<string>} A Flakiness access token.
   */
  createFlakinessAccessToken(flakinessProject: string): Promise<string>;
}

/**
 * Detects the OIDC provider for the current CI environment.
 *
 * Both providers hand out a token that *is* the credential: an OIDC JWT whose `aud` claim names
 * the flakiness project, which Flakiness.io verifies against the CI provider. This is the
 * detection {@link uploadReport} and {@link fetchTestDurations} use when no access token is
 * configured, exposed for tools that resolve credentials themselves.
 *
 * Providers are checked in order: GitHub Actions ({@link GithubOIDC}), then GitLab CI/CD
 * ({@link GitlabOIDC}).
 *
 * @returns {OIDCProvider | undefined} A provider for the current environment, or `undefined` when
 *   no CI OIDC credentials are available.
 *
 * @example
 * ```typescript
 * const oidc = initializeOIDCFromEnv();
 * if (oidc) {
 *   console.log(`Authenticating via ${oidc.name} OIDC`);
 *   const token = await oidc.createFlakinessAccessToken('my-org/my-project');
 * }
 * ```
 */
export function initializeOIDCFromEnv(): OIDCProvider|undefined {
  return GithubOIDC.initializeFromEnv() ?? GitlabOIDC.initializeFromEnv();
}
