import { FlakinessReport } from '@flakiness/flakiness-report';
import assert from 'assert';
import fs from 'fs';
import { URL } from 'url';
import { compressTextAsync, retryWithBackoff, sha1File, sha1Text } from './_internalUtils.js';
import { isGitHubOIDCAvailable, requestGitHubOIDCToken } from './githubOIDC.js';

type ReportUploaderOptions = {
  flakinessEndpoint: string;
  flakinessAccessToken: string;
}

/**
 * Represents an in-memory report attachment containing data as a Buffer.
 *
 * This type is used for attachments that are created from data already in memory,
 * such as generated screenshots, logs, or other binary/text content that doesn't
 * originate from a file on disk.
 */
export type DataAttachment = {
  /** Discriminator indicating this is a buffer-based attachment */
  type: 'buffer',
  /** Unique identifier for the attachment, typically a hash of the content */
  id: FlakinessReport.AttachmentId;
  /** MIME type of the attachment content (e.g., 'image/png', 'text/plain') */
  contentType: string,
  /** The actual attachment data as a Buffer */
  body: Buffer;
}

/**
 * Represents a file-based report attachment that references an existing file on disk.
 *
 * This type is used for attachments that already exist as files in the filesystem,
 * such as screenshots saved to disk, log files, or other artifacts generated during
 * test execution.
 */
export type FileAttachment = {
  /** Discriminator indicating this is a file-based attachment */
  type: 'file',
  /** Unique identifier for the attachment, typically a hash of the file content */
  id: FlakinessReport.AttachmentId;
  /** MIME type of the attachment content (e.g., 'image/png', 'text/plain') */
  contentType: string,
  /** Absolute or relative path to the attachment file on disk */
  path: string;
}

/**
 * Union type representing any kind of report attachment.
 *
 * Attachments can be either file-based (referencing existing files) or data-based
 * (containing in-memory data). Use the `type` property to discriminate between the two.
 */
export type Attachment = FileAttachment | DataAttachment;

/**
 * Creates a file-based attachment from an existing file on disk.
 *
 * This function reads the specified file to generate a unique ID (SHA-1 hash) and creates
 * a FileAttachment object that can be used with report upload functions.
 *
 * @param {string} contentType - MIME type of the file content (e.g., 'image/png', 'text/plain',
 *   'application/json'). This should accurately represent the file's content type.
 * @param {string} filePath - Absolute or relative path to the file on disk. The file must
 *   exist and be readable at the time this function is called.
 *
 * @returns {Promise<FileAttachment>} Promise that resolves to a FileAttachment object with:
 *   - `type: 'file'` - Indicates this is a file-based attachment
 *   - `contentType` - The provided MIME type
 *   - `id` - SHA-1 hash of the file content used as unique identifier
 *   - `path` - The provided file path
 *
 * @throws {Error} Throws if the file cannot be read.
 *
 * @example
 * ```typescript
 * // Create attachment from a screenshot file
 * const screenshot = await createFileAttachment('image/png', './test-results/screenshot.png');
 *
 * // Create attachment from a log file
 * const logFile = await createFileAttachment('text/plain', '/tmp/test.log');
 *
 * // Use with upload
 * await uploadReport(report, [screenshot, logFile]);
 * ```
 */
export async function createFileAttachment(contentType: string, filePath: string): Promise<FileAttachment> {
  return {
    type: 'file',
    contentType,
    id: await sha1File(filePath) as FlakinessReport.AttachmentId,
    path: filePath,
  };
}

/**
 * Creates an in-memory attachment from Buffer data.
 *
 * This function creates a DataAttachment object from data that's already in memory as a Buffer.
 * It generates a unique ID (SHA-1 hash) from the data content and stores the data directly
 * in the attachment object for immediate use during upload.
 *
 * @param {string} contentType - MIME type of the data content (e.g., 'image/png', 'text/plain',
 *   'application/json'). This should accurately represent the data's content type.
 * @param {Buffer} data - The attachment data as a Buffer. Can contain any type of data
 *   (binary, text, etc.) that can be represented as bytes.
 *
 * @returns {Promise<DataAttachment>} Promise that resolves to a DataAttachment object with:
 *   - `type: 'buffer'` - Indicates this is a data-based attachment
 *   - `contentType` - The provided MIME type
 *   - `id` - SHA-1 hash of the data content used as unique identifier
 *   - `body` - The provided Buffer data
 *
 * @example
 * ```typescript
 * // Create attachment from string data
 * const logData = Buffer.from('Test execution log\nAll tests passed', 'utf-8');
 * const logAttachment = await createDataAttachment('text/plain', logData);
 *
 * // Use with upload
 * await uploadReport(report, [logAttachment]);
 * ```
 */
export async function createDataAttachment(contentType: string, data: Buffer): Promise<DataAttachment> {
  return {
    type: 'buffer',
    contentType,
    id: sha1Text(data) as FlakinessReport.AttachmentId,
    body: data,
  };
}

type UploadResult = 
  | { status: 'success'; reportUrl: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string };

interface Logger {
  log(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export type UploadOptions = {
  /**
   * Custom Flakiness.io endpoint URL for upload operations.
   *
   * Defaults to the `FLAKINESS_ENDPOINT` environment variable, or 'https://flakiness.io'
   * if the environment variable is not set. Use this to point to custom or self-hosted
   * Flakiness.io instances.
   *
   * @example 'https://custom.flakiness.io'
   */
  flakinessEndpoint?: string;

  /**
   * Access token for authenticating with the Flakiness.io platform.
   *
   * Defaults to the `FLAKINESS_ACCESS_TOKEN` environment variable. If no token is provided
   * through this option or the environment variable, the upload will be skipped with a
   * 'skipped' status. Obtain this token from your Flakiness.io project settings.
   *
   * @example 'flakiness-io-1234567890abcdef...'
   */
  flakinessAccessToken?: string;

  /**
   * Custom logger for upload progress, warnings, and error messages.
   *
   * Defaults to the global `console` object. The logger must implement the `Logger` interface
   * with `log()`, `warn()`, and `error()` methods. Use this to integrate with your application's
   * logging system or to suppress/redirect upload messages.
   *
   * @example customLogger with winston, pino, or other logging libraries
   */
  logger?: Logger;

  /**
   * Controls whether the upload function throws errors on failure.
   *
   * - `false` (default): "Safe mode" - Returns a failed result object instead of throwing.
   *   Recommended for CI environments where test execution should continue even if upload fails.
   * - `true`: "Strict mode" - Throws an error on upload failure, which can halt execution.
   *   Use when upload success is critical to your workflow.
   *
   * @default false
   */
  throwOnFailure?: boolean;

  /**
   * Audience claim (`aud`) for GitHub Actions OIDC authentication, in `org/proj` format.
   *
   * When running in GitHub Actions with `permissions: id-token: write` and no explicit
   * access token is provided, the SDK will request a GitHub OIDC token with this audience
   * and use it to authenticate uploads.
   *
   * Defaults to the `FLAKINESS_OIDC_AUDIENCE` environment variable.
   *
   * @example 'my-org/my-project'
   */
  githubOIDCAudience?: string;
}

/**
 * Uploads a Flakiness report and its attachments to the Flakiness.io platform.
 *
 * This function handles the complete upload process including:
 * - Authentication using access tokens
 * - Report compression and upload
 * - Attachment upload with automatic compression for text-based content
 * - Error handling and retry logic with exponential backoff
 * - Comprehensive logging of the upload process
 *
 * The function operates in "safe mode" by default, meaning it won't throw errors on upload
 * failures unless explicitly configured to do so.
 *
 * @param {FlakinessReport.Report} report - The Flakiness report object to upload.
 *
 * @param {Attachment[]} attachments - Array of attachments to upload alongside the report.
 *   Can include both file-based and data-based attachments.
 *
 * @param {UploadOptions} options - Optional configuration object with the following properties:
 *
 * @returns {Promise<UploadResult>} Promise that resolves to an upload result object:
 *   - `{ status: 'success', reportUrl: string }` - Upload succeeded, includes web URL to view report
 *   - `{ status: 'skipped', reason: string }` - Upload was skipped (e.g., no access token)
 *   - `{ status: 'failed', error: string }` - Upload failed, includes error message
 *
 * @throws {Error} Only throws if `options.throwOnFailure` is true and upload fails.
 *
 * @example
 * ```typescript
 * await uploadReport(report, attachments);
 * ```
 */
export async function uploadReport(
  report: FlakinessReport.Report,
  attachments: Attachment[],
  options?: UploadOptions
): Promise<UploadResult> {
  let flakinessAccessToken = options?.flakinessAccessToken ?? process.env['FLAKINESS_ACCESS_TOKEN'];
  const flakinessEndpoint = options?.flakinessEndpoint ?? process.env['FLAKINESS_ENDPOINT'] ?? 'https://flakiness.io';

  const logger = options?.logger ?? console;

  // If no explicit access token, try GitHub OIDC authentication.
  if (!flakinessAccessToken && isGitHubOIDCAvailable()) {
    const audience = options?.githubOIDCAudience ?? process.env['FLAKINESS_OIDC_AUDIENCE'];
    if (audience) {
      try {
        logger.log(`[flakiness.io] Requesting GitHub OIDC token...`);
        flakinessAccessToken = await requestGitHubOIDCToken(audience);
      } catch (e: any) {
        const errorMessage = e.message || String(e);
        logger.error(`[flakiness.io] ✕ Failed to obtain GitHub OIDC token: ${errorMessage}`);
        if (options?.throwOnFailure)
          throw e;
        return { status: 'failed', error: `GitHub OIDC token request failed: ${errorMessage}` };
      }
    }
  }

  if (!flakinessAccessToken) {
    const reason = 'No FLAKINESS_ACCESS_TOKEN or GitHub OIDC audience found';
    if (process.env.CI)
      logger.warn(`[flakiness.io] ⚠ Skipping upload: ${reason}`);
    return { status: 'skipped', reason };
  }

  try {
    const upload = new ReportUpload(report, attachments, { flakinessAccessToken, flakinessEndpoint });
    const uploadResult = await upload.upload();
    if (!uploadResult.success) {
      const errorMessage = uploadResult.message || 'Unknown upload error';
      logger.error(`[flakiness.io] ✕ Failed to upload: ${errorMessage}`);
      if (options?.throwOnFailure)
        throw new Error(`Flakiness upload failed: ${errorMessage}`);
      return { status: 'failed', error: errorMessage };
    }
    logger.log(`[flakiness.io] ✓ Uploaded to ${uploadResult.reportUrl}`);
    return { status: 'success', reportUrl: uploadResult.reportUrl! };
  } catch (e: any) {
    // --- Scenario D: Unexpected Crash (FAIL) ---
    const errorMessage = e.message || String(e);
    logger.error(`[flakiness.io] ✕ Unexpected error during upload: ${errorMessage}`);
    if (options?.throwOnFailure)
      throw e;
    return { status: 'failed', error: errorMessage };
  }
}

const HTTP_BACKOFF = [100, 500, 1000, 1000, 1000, 1000];

class ReportUpload {
  private _report: FlakinessReport.Report;
  private _attachments: Attachment[];
  private _options: ReportUploaderOptions;

  constructor(report: FlakinessReport.Report, attachments: Attachment[], options: ReportUploaderOptions) {
    this._options = options;
    this._report = report;
    this._attachments = attachments;
  }

  private async _api<OUTPUT>(pathname: string, token: string, body?: any): Promise<{ result?: OUTPUT, error?: string }> {
    const url = new URL(this._options.flakinessEndpoint);
    url.pathname = pathname;
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async response => !response.ok ? {
      result: undefined,
      error: response.status + ' ' + url.href + ' ' + await response.text(),
    } : {
      result: await response.json() as OUTPUT,
      error: undefined,
    }).catch(error => ({
      result: undefined,
      error,
    }));
  }

  async upload(): Promise<{ success: false, message?: string } | { success: true, reportUrl: string }> {
    const response = await this._api<{ uploadToken: string, presignedReportUrl: string, webUrl: string, }>('/api/upload/start', this._options.flakinessAccessToken);
    if (response?.error || !response.result)
      return { success: false, message: response.error};
    const webUrl = new URL(response.result.webUrl, this._options.flakinessEndpoint).toString();

    const attachmentsPresignedUrls = await this._api<{ attachmentId: string, presignedUrl: string }[]>('/api/upload/attachments', response.result.uploadToken, {
      attachmentIds: this._attachments.map(a => a.id),
    });
    if (attachmentsPresignedUrls?.error || !attachmentsPresignedUrls.result)
      return { success: false, message: attachmentsPresignedUrls.error};

    const attachments = new Map(attachmentsPresignedUrls.result.map(a => [a.attachmentId, a.presignedUrl]));
    await Promise.all([
      this._uploadReport(JSON.stringify(this._report), response.result.presignedReportUrl),
      ...this._attachments.map(attachment => {
        const uploadURL = attachments.get(attachment.id);
        if (!uploadURL)
          throw new Error('Internal error: missing upload URL for attachment!');
        return this._uploadAttachment(attachment, uploadURL);
      }),
    ]);
    await this._api<{ webUrl: string }>('/api/upload/finish', response.result.uploadToken);
    return { success: true, reportUrl: webUrl };
  }

  private async _uploadReport(data: string, uploadUrl: string) {
    const compressed = await compressTextAsync(data);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(compressed) + '',
      'Content-Encoding': 'br',
    };
    await retryWithBackoff(async () => {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: Buffer.from(compressed),
      });
      if (!response.ok) {
        throw new Error(`Request to ${uploadUrl} failed with ${response.status}`);
      }
      // Read response to ensure it completes
      await response.arrayBuffer();
    }, HTTP_BACKOFF);
  }

  private async _uploadAttachment(attachment: Attachment, uploadUrl: string) {
    const mimeType = attachment.contentType.toLocaleLowerCase().trim();
    const compressable = mimeType.startsWith('text/')
      || mimeType.endsWith('+json')
      || mimeType.endsWith('+text')
      || mimeType.endsWith('+xml')
    ;
    // Stream file only if there's attachment path and we should NOT compress it.
    if (!compressable && attachment.type === 'file') {
      await retryWithBackoff(async () => {
        const fileBuffer = await fs.promises.readFile(attachment.path);
        const response = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': attachment.contentType,
            'Content-Length': fileBuffer.length + '',
          },
          body: new Uint8Array(fileBuffer),
        });
        if (!response.ok) {
          throw new Error(`Request to ${uploadUrl} failed with ${response.status}`);
        }
        // Read response to ensure it completes
        await response.arrayBuffer();
      }, HTTP_BACKOFF);
      return;
    }
    let buffer = attachment.type === 'buffer' ? attachment.body : await fs.promises.readFile(attachment.path);
    assert(buffer);

    const encoding = compressable ? 'br' : undefined;

    if (compressable)
      buffer = await compressTextAsync(buffer);

    const headers: Record<string, string> = {
      'Content-Type': attachment.contentType,
      'Content-Length': Buffer.byteLength(buffer) + '',
    };
    if (encoding) {
      headers['Content-Encoding'] = encoding;
    }

    await retryWithBackoff(async () => {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: new Uint8Array(buffer),
      });
      if (!response.ok) {
        throw new Error(`Request to ${uploadUrl} failed with ${response.status}`);
      }
      // Read response to ensure it completes
      await response.arrayBuffer();
    }, HTTP_BACKOFF);
  }
}