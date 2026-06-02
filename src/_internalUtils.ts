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


export async function retryWithBackoff<T>(job: () => Promise<T>, backoff: number[] = []): Promise<T> {
  for (const timeout of backoff) {
    try {
      return await job();
    } catch (e: any) {
      await new Promise(x => setTimeout(x, timeout));
    }
  }
  return await job();
}

export const HTTP_BACKOFF = [100, 500, 1000, 1000, 1000, 1000];

async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const url = response.url || (input instanceof URL ? input.href : typeof input === 'string' ? input : input.url);
    const body = await response.text().catch(() => '');
    throw new Error(response.status + ' ' + url + ' ' + body);
  }
  return response;
}

export async function getJSON<T>(input: RequestInfo | URL, init?: RequestInit, backoff: number[] = HTTP_BACKOFF): Promise<T> {
  return await retryWithBackoff(async () => {
    const response = await fetchOk(input, init);
    return await response.json() as T;
  }, backoff);
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
  }, backoff);
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
