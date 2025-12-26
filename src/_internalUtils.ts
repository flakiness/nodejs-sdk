import { spawnSync, SpawnSyncOptionsWithStringEncoding } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
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

const FLAKINESS_DBG = !!process.env.FLAKINESS_DBG;
export function errorText(error: Error) {
  return FLAKINESS_DBG ? error.stack : error.message;
}

export async function retryWithBackoff<T>(job: () => Promise<T>, backoff: number[] = []): Promise<T> {
  for (const timeout of backoff) {
    try {
      return await job();
    } catch (e: any) {
      if (e instanceof AggregateError)
        console.error(`[flakiness.io err]`, errorText(e.errors[0]));
      else if (e instanceof Error)
        console.error(`[flakiness.io err]`, errorText(e));
      else
        console.error(`[flakiness.io err]`, e);
      await new Promise(x => setTimeout(x, timeout));
    }
  }
  return await job();
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