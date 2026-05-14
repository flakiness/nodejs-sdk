import { FlakinessReport } from '@flakiness/flakiness-report';

/**
 * Detects the JavaScript runtime executing the current process.
 *
 * Returns the runtime name (`bun`, `deno`, `node`) and its version, suitable for
 * use as `FlakinessReport.Report.runtime`. Bun and Deno expose Node-compat
 * versions on `process.versions.node`, so this probes their globals first to
 * avoid mis-identifying them as Node.
 *
 * @returns {FlakinessReport.Report['runtime']} The detected runtime, or `undefined` if no
 *   supported runtime is recognized (e.g., browser environments).
 *
 * @example
 * ```typescript
 * const report = ReportUtils.normalizeReport({
 *   // ...
 *   runtime: ReportUtils.detectRuntime(),
 * });
 * ```
 */
export function detectRuntime(): FlakinessReport.Report['runtime'] {
  const g = globalThis as { Bun?: { version: string }, Deno?: { version: { deno: string } } };
  if (g.Bun?.version)
    return { name: 'bun', version: g.Bun.version };
  if (g.Deno?.version?.deno)
    return { name: 'deno', version: g.Deno.version.deno };
  if (process.versions?.node)
    return { name: 'node', version: process.versions.node };
  return undefined;
}
