/**
 * A collection of utilities to extract information about continuous integration providers.
 *
 * This namespace provides functions to automatically detect and extract useful information
 * from various CI/CD environments, including GitHub Actions, Azure DevOps, Jenkins, and others.
 */
export namespace CIUtils {
  /**
   * Automatically extracts the run URL for common continuous integration providers.
   *
   * This function attempts to detect the current CI environment and construct the appropriate
   * URL that links to the specific build/run where tests are being executed.
   *
   * Supported CI providers (checked in order):
   * - GitHub Actions
   * - Azure DevOps
   * - GitLab CI (via `CI_JOB_URL` environment variable)
   * - Jenkins (via `BUILD_URL` environment variable)
   *
   * @returns {string | undefined} The constructed CI run URL, or `undefined` if no supported
   *   CI environment is detected or required environment variables are missing.
   *
   * @example
   * ```typescript
   * const report: FlakinessReport.Report = {
   *   // ... other report properties
   *   url: CIUtils.runUrl(),
   * };
   * ```
   */
  export function runUrl(): string | undefined {
    return githubActions() ?? azure() ?? process.env.CI_JOB_URL ?? process.env.BUILD_URL;
  }
}

function githubActions(): string | undefined {
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repo = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;

  if (!repo || !runId) return undefined;

  try {
    const url = new URL(`${serverUrl}/${repo}/actions/runs/${runId}`);
    const attempt = process.env.GITHUB_RUN_ATTEMPT;
    if (attempt) url.searchParams.set('attempt', attempt);
    url.searchParams.set('check_suite_focus', 'true');
    return url.toString();
  } catch (error) {
    return undefined;
  }
}

function azure(): string | undefined {
  const collectionUri = process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
  const project = process.env.SYSTEM_TEAMPROJECT;
  const buildId = process.env.BUILD_BUILDID;

  if (!collectionUri || !project || !buildId)
    return undefined;

  try {
    const baseUrl = collectionUri.endsWith('/') ? collectionUri : `${collectionUri}/`;
    const url = new URL(`${baseUrl}${project}/_build/results`);

    url.searchParams.set('buildId', buildId);
    return url.toString();
  } catch (error) {
    return undefined;
  }
}
