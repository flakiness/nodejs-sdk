import chalk from 'chalk';
import open from "open";
import { randomUUIDBase62 } from './_internalUtils.js';
import { FlakinessProjectConfig } from "./flakinessProjectConfig.js";
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
 *
 * @example
 * ```typescript
 * await showReport('./flakiness-report');
 * ```
 */
export async function showReport(reportFolder: string) {
  const config = await FlakinessProjectConfig.load();
  const projectPublicId = config.projectPublicId();

  const reportViewerEndpoint = config.reportViewerUrl();

  const token = randomUUIDBase62();
  const server = new StaticServer(token, reportFolder, reportViewerEndpoint);
  await server.start(9373, '127.0.0.1');

  const url = new URL(reportViewerEndpoint);
  url.searchParams.set('port', String(server.port()));
  url.searchParams.set('token', token);
  if (projectPublicId)
    url.searchParams.set('ppid', projectPublicId);

  console.log(chalk.cyan(`
  Serving Flakiness report at ${(url.toString())}
  Press Ctrl+C to quit.`))
  await open(url.toString());
  await new Promise(() => {});
}