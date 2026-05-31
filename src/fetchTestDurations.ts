import { FlakinessReport } from '@flakiness/flakiness-report';
import { URL } from 'url';
import { compressTextAsync, fetchAndDrainWithRetries, fetchWithRetries, sha1Text } from './_internalUtils.js';
import { GithubOIDC } from './githubOIDC.js';

type TestDurationsFetcherOptions = {
  flakinessEndpoint: string;
  flakinessAccessToken: string;
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
   * through this option or the environment variable, the function will attempt to authenticate
   * via GitHub Actions OIDC when running in GitHub Actions (requires `report.flakinessProject`
   * to be set and the project to be bound to the repository).
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
 * 1. Authenticates using an access token or GitHub Actions OIDC.
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
 *
 * @param {FlakinessReport.Report} report - The report describing the tests to fetch durations for.
 * @param {FetchTestDurationsOptions} options - Optional configuration object.
 *
 * @returns {Promise<FlakinessReport.Report>} A report enriched with historical test durations.
 *
 * @throws {Error} If no access token is available, any API call fails, or the durations are not
 *   ready within the polling timeout.
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

  if (!flakinessAccessToken)
    throw new Error('No Flakiness access token available (set FLAKINESS_ACCESS_TOKEN, pass `flakinessAccessToken`, or run in GitHub Actions with `id-token: write` and a configured `flakinessProject`)');

  const flakinessEndpoint = options?.flakinessEndpoint ?? process.env['FLAKINESS_ENDPOINT'] ?? 'https://flakiness.io';
  const fetcher = new TestDurationsFetcher(report, { flakinessAccessToken, flakinessEndpoint });
  return await fetcher.fetch();
}

class TestDurationsFetcher {
  private _report: FlakinessReport.Report;
  private _options: TestDurationsFetcherOptions;

  constructor(report: FlakinessReport.Report, options: TestDurationsFetcherOptions) {
    this._report = report;
    this._options = options;
  }

  private async _api<OUTPUT>(pathname: string, token: string, body?: any): Promise<OUTPUT> {
    const url = new URL(this._options.flakinessEndpoint);
    url.pathname = pathname;
    return await fetchWithRetries(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async response => await response.json());
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
      { commitId: this._report.commitId, shardGroupKey },
    );

    await this._uploadReport(JSON.stringify(this._report), createResponse.uploadUrl);

    const submitResponse = await this._api<{ downloadUrl: string }>(
      '/api/testDurations/submit',
      createResponse.testDurationsToken,
    );

    return await fetchWithRetries(submitResponse.downloadUrl, undefined, DOWNLOAD_BACKOFF).then(async response => await response.json() as FlakinessReport.Report);
  }

  private async _uploadReport(data: string, uploadUrl: string) {
    const compressed = await compressTextAsync(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(compressed) + '',
      'Content-Encoding': 'br',
    };
    await fetchAndDrainWithRetries(uploadUrl, {
      method: 'PUT',
      headers,
      body: Buffer.from(compressed),
    });
  }
}
