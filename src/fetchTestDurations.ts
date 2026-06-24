import { FlakinessReport } from '@flakiness/flakiness-report';
import { URL } from 'url';
import { compressTextAsync, getJSON, putBuffer, sha1Text } from './_internalUtils.js';
import { GithubOIDC } from './githubOIDC.js';

type TestDurationsFetcherOptions = {
  flakinessEndpoint: string;
  // When set, requests authenticate as automation and the server resolves the
  // project from the token. When unset, the fetcher runs anonymously and names
  // the project via `orgSlug`/`projectSlug`, which the server only honors for
  // public projects (e.g. pull requests from forks, which have no token).
  flakinessAccessToken?: string;
  orgSlug?: string;
  projectSlug?: string;
}

/**
 * Options for {@link fetchTestDurations}.
 */
export type FetchTestDurationsOptions = {
  /**
   * Custom Flakiness.io endpoint URL.
   *
   * Defaults to the `FLAKINESS_ENDPOINT` environment variable, or 'https://flakiness.io'
   * if the environment variable is not set.
   *
   * @example 'https://custom.flakiness.io'
   */
  flakinessEndpoint?: string;

  /**
   * Access token for authenticating with the Flakiness.io platform.
   *
   * Defaults to the `FLAKINESS_ACCESS_TOKEN` environment variable. If no token is provided
   * through this option or the environment variable, the function attempts GitHub Actions OIDC
   * when running in GitHub Actions (requires `report.flakinessProject` to be set and the project
   * to be bound to the repository). If no token can be obtained, durations are fetched anonymously
   * using `report.flakinessProject`, which the server only allows for public projects.
   *
   * @example 'flakiness-io-1234567890abcdef...'
   */
  flakinessAccessToken?: string;
}

// The computed historical durations are not ready immediately after submit, so
// we poll the download URL for up to ~90 seconds before giving up.
const DOWNLOAD_BACKOFF = [Array(10).fill(1000), Array(10).fill(2000), Array(20).fill(3000)].flat();

/**
 * Fetches historical test durations for a report from the Flakiness.io platform.
 *
 * This is used to compute "balanced shards" — by knowing how long each test took
 * historically, a test runner can balance tests across shards so that every shard
 * finishes at roughly the same time.
 *
 * The function performs the following steps:
 * 1. Resolves credentials: an access token, GitHub Actions OIDC, or anonymous access
 *    for public projects.
 * 2. Computes a shard-group key from the report so that all shards of the same run
 *    fetch an identical set of timings.
 * 3. Uploads the (compressed) report so the platform knows which tests to time.
 * 4. Submits the request and polls the resulting download URL until the computed
 *    durations are ready (up to ~90 seconds).
 *
 * ## Authentication
 *
 * Authentication follows the same priority order as {@link uploadReport}:
 * 1. **Access token** — provided via `flakinessAccessToken` option or `FLAKINESS_ACCESS_TOKEN` env var.
 * 2. **GitHub Actions OIDC** — when running in GitHub Actions with no access token. This requires
 *    `report.flakinessProject` to be set and the project to be bound to the GitHub repository.
 * 3. **Anonymous** — when no token can be obtained but `report.flakinessProject` is set. The request
 *    names the project via that field and sends no credentials. The server only honors this for public
 *    projects, which covers pull requests from forks: GitHub denies them both repository secrets and an
 *    OIDC token. Private projects are rejected by the server.
 *
 * @param {FlakinessReport.Report} report - The report describing the tests to fetch durations for.
 * @param {FetchTestDurationsOptions} options - Optional configuration object.
 *
 * @returns {Promise<FlakinessReport.Report>} A report enriched with historical test durations.
 *
 * @throws {Error} If the project cannot be identified (no access token and no `report.flakinessProject`),
 *   any API call fails, or the durations are not ready within the polling timeout.
 *
 * @example
 * ```typescript
 * const reportWithDurations = await fetchTestDurations(report);
 * ```
 */
export async function fetchTestDurations(
  report: FlakinessReport.Report,
  options?: FetchTestDurationsOptions,
): Promise<FlakinessReport.Report> {
  let flakinessAccessToken = options?.flakinessAccessToken ?? process.env['FLAKINESS_ACCESS_TOKEN'];

  const githubOIDC = GithubOIDC.initializeFromEnv();
  if (!flakinessAccessToken && githubOIDC && report.flakinessProject)
    flakinessAccessToken = await githubOIDC.createFlakinessAccessToken(report.flakinessProject);

  const flakinessEndpoint = options?.flakinessEndpoint ?? process.env['FLAKINESS_ENDPOINT'] ?? 'https://flakiness.io';

  // Without a token, durations can still be fetched anonymously for public
  // projects. This covers pull requests from forks, which GitHub denies both
  // repository secrets and an OIDC token. An anonymous request must name the
  // project via `report.flakinessProject` (there's no token for the server to
  // resolve it from); the server rejects the request if the project is private.
  let orgSlug: string | undefined;
  let projectSlug: string | undefined;
  if (!flakinessAccessToken) {
    if (!report.flakinessProject)
      throw new Error('Cannot fetch test durations: no Flakiness access token, and `report.flakinessProject` is unset so the project cannot be identified. Set FLAKINESS_ACCESS_TOKEN, pass `flakinessAccessToken`, or set `flakinessProject` (anonymous, public projects only).');
    [orgSlug, projectSlug] = report.flakinessProject.split('/');
    if (!orgSlug || !projectSlug)
      throw new Error(`Cannot fetch test durations: \`report.flakinessProject\` must be in "org/project" format, got ${JSON.stringify(report.flakinessProject)}.`);
  }

  const fetcher = new TestDurationsFetcher(report, { flakinessAccessToken, flakinessEndpoint, orgSlug, projectSlug });
  return await fetcher.fetch();
}

class TestDurationsFetcher {
  private _report: FlakinessReport.Report;
  private _options: TestDurationsFetcherOptions;

  constructor(report: FlakinessReport.Report, options: TestDurationsFetcherOptions) {
    this._report = report;
    this._options = options;
  }

  private async _api<OUTPUT>(pathname: string, token: string | undefined, body?: any): Promise<OUTPUT> {
    const url = new URL(this._options.flakinessEndpoint);
    url.pathname = pathname;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Anonymous requests (public projects) send no credentials; the server
    // would reject an empty/garbage bearer token as UNAUTHORIZED.
    if (token)
      headers['Authorization'] = `Bearer ${token}`;
    return await getJSON<OUTPUT>(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async fetch(): Promise<FlakinessReport.Report> {
    // Shard group key makes sure that all shards fetch the same timings.
    // We do NOT use envs as a shard group since environments might 
    // fluctuate between runs: the shard jobs might run on different versions of the 
    // OS, i.e. when Github Actions do a gradual rollout of a new VM Image.
    const shardGroupKey = sha1Text(JSON.stringify({
      commitId: this._report.commitId,
      category: this._report.category,
      testRunnerName: this._report.testRunner?.name ?? 'unknown',
      testRunnerVersion: this._report.testRunner?.version ?? 'unknown',
    }));

    const createResponse = await this._api<{ testDurationsToken: string, uploadUrl: string }>(
      '/api/testDurations/create',
      this._options.flakinessAccessToken,
      {
        commitId: this._report.commitId,
        shardGroupKey,
        // With a token the server resolves the project from it. Anonymous
        // callers must name the project explicitly; these are undefined (and so
        // omitted from the JSON) in the authenticated path.
        orgSlug: this._options.orgSlug,
        projectSlug: this._options.projectSlug,
      },
    );

    await this._uploadReport(JSON.stringify(this._report), createResponse.uploadUrl);

    const submitResponse = await this._api<{ downloadUrl: string }>(
      '/api/testDurations/submit',
      createResponse.testDurationsToken,
    );

    return await getJSON<FlakinessReport.Report>(submitResponse.downloadUrl, undefined, DOWNLOAD_BACKOFF);
  }

  private async _uploadReport(data: string, uploadUrl: string) {
    const compressed = await compressTextAsync(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(compressed) + '',
      'Content-Encoding': 'br',
    };
    await putBuffer(uploadUrl, compressed, headers);
  }
}
