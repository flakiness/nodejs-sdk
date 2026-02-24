import chalk from 'chalk';
import open from "open";
import { randomUUIDBase62 } from './_internalUtils.js';
import { StaticServer } from './staticServer.js';

/**
 * Opens and displays a Flakiness report in the default web browser.
 *
 * This function starts a local static server to serve the report files and automatically
 * opens the Flakiness report viewer in the user's default browser. 
 * 
 * The function runs indefinitely, until the process is terminated with Ctrl+C.
 *
 * @param {string} reportFolder - Absolute or relative path to the folder containing
 *   the Flakiness report.
 * @param {object} [options] - Optional configuration.
 * @param {string} [options.reportViewerUrl] - Custom report viewer URL. Defaults to
 *   `https://report.flakiness.io`.
 *
 * @example
 * ```typescript
 * await showReport('./flakiness-report');
 * ```
 */
export async function showReport(reportFolder: string, options?: {
  reportViewerUrl?: string,
}) {
  const reportViewerUrl = options?.reportViewerUrl ?? 'https://report.flakiness.io';
  const token = randomUUIDBase62();
  const server = new StaticServer(token, reportFolder, [
    reportViewerUrl,
    // trace.playwright.dev is used to load & display Playwright Test traces.
    'https://trace.playwright.dev',
  ]);
  await server.start(9373, '127.0.0.1');

  const url = new URL(reportViewerUrl);
  url.searchParams.set('port', String(server.port()));
  url.searchParams.set('token', token);

  console.log(chalk.cyan(`
  Serving Flakiness report at ${(url.toString())}
  Press Ctrl+C to quit.`))
  await open(url.toString());
  await new Promise(() => {});
}
