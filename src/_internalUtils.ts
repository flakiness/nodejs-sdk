import { spawnSync, SpawnSyncOptionsWithStringEncoding } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import util from 'util';
import zlib from 'zlib';

const asyncBrotliCompress = util.promisify(zlib.brotliCompress);
export async function compressTextAsync(text: string|Buffer): Promise<Buffer> {
  return asyncBrotliCompress(text, {
    chunkSize: 32 * 1024,
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
      [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
    }
  });
}

export type Brand<T, Brand extends string> = T & {
  readonly [B in Brand as `__${B}_brand`]: never;
};


async function retryWithBackoff<T>(
  job: () => Promise<T>,
  backoff: (error: unknown, retry: number) => number|undefined,
): Promise<T> {
  // Avoid infinite loop: never retry more then, say, 100 times.
  for (let i = 0; i < 100; ++i) {
    try {
      return await job();
    } catch (error) {
      const timeout = backoff(error, i);
      if (timeout === undefined)
        throw error;
      await new Promise(x => setTimeout(x, timeout));
    }
  }
  // This might be executed if we ran over the max retry count.
  return await job();
}

export const HTTP_BACKOFF = [100, 500, 1000, 1000, 1000, 1000];

class HTTPResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRetryableHTTPError(error: unknown, extraRetryableStatuses: readonly number[]): boolean {
  if (error instanceof HTTPResponseError) {
    return error.status === 408
      || error.status === 425
      || error.status === 429
      || (error.status >= 500 && error.status <= 599)
      || extraRetryableStatuses.includes(error.status)
    ;
  }
  // An explicit caller cancellation should be observed immediately. Other errors
  // (connection resets, truncated bodies, malformed transient responses) can be retried.
  return !(error instanceof Error && error.name === 'AbortError');
}

async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new HTTPResponseError(response.status + ' ' + response.url + ' ' + body, response.status);
  }
  return response;
}

export async function getJSON<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  backoff: number[] = HTTP_BACKOFF,
  extraRetryableStatuses: readonly number[] = [],
): Promise<T | undefined> {
  backoff = backoff.slice();
  return await retryWithBackoff(async () => {
    const response = await fetchOk(input, init);
    const text = await response.text();
    return text.trim() ? JSON.parse(text) as T : undefined;
  }, (error, retryIdx) => {
    return retryIdx < backoff.length && isRetryableHTTPError(error, extraRetryableStatuses) ? backoff[retryIdx] : undefined;
  });
}

export async function putBuffer(input: RequestInfo | URL, body: Buffer, headers?: HeadersInit, backoff: number[] = HTTP_BACKOFF): Promise<void> {
  await retryWithBackoff(async () => {
    const response = await fetchOk(input, {
      method: 'PUT',
      headers,
      body: new Uint8Array(body),
    });
    // Read response to ensure it completes.
    await response.arrayBuffer();
  }, (error, retryIdx) => {
    return retryIdx < backoff.length && isRetryableHTTPError(error, []) ? backoff[retryIdx] : undefined;
  });
}

export function shell(command: string, args?: string[], options?: SpawnSyncOptionsWithStringEncoding) {
  try {
    const result = spawnSync(command, args, { encoding: 'utf-8', ...options });
    if (result.status !== 0) {
      return undefined;
    }
    return (result.stdout as string).trim();
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

export function sha1Text(data: crypto.BinaryLike) {
  const hash = crypto.createHash('sha1');
  hash.update(data);
  return hash.digest('hex');
}

export function sha1File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => { hash.update(chunk); });

    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Whether the current process is running on CI.
 *
 * Virtually every CI provider (GitHub Actions, GitLab, CircleCI, …) sets the `CI`
 * environment variable, usually to `true` or `1`. An explicit `false`/`0`/empty
 * value is treated as an opt-out rather than as "on" — `process.env.CI` is a
 * non-empty truthy string in those cases too, so a plain truthiness check is wrong.
 */
export function isCI(): boolean {
  const ci = (process.env.CI ?? '').toLowerCase();
  return ci !== '' && ci !== 'false' && ci !== '0';
}

export function randomUUIDBase62(): string {
  const BASE62_CHARSET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let num = BigInt('0x' + crypto.randomUUID().replace(/-/g, ''));
  if (num === 0n)
    return BASE62_CHARSET[0];

  const chars = [];
  while (num > 0n) {
    const remainder = Number(num % 62n);
    num /= 62n;
    chars.push(BASE62_CHARSET[remainder]);
  }
  
  return chars.reverse().join('');
}
