import path from 'node:path';
import { styleText } from 'node:util';
import { showReportCommand } from './showReportCommand.js';

/**
 * Builds the human-facing message that test runners print after writing a report.
 *
 * In interactive environments this returns instructions for opening the report
 * locally with the Flakiness CLI. On CI (detected via `process.env.CI`), where
 * launching the local viewer isn't useful, it returns a one-liner pointing at the
 * folder the report was written to instead.
 *
 * @param {string} reportFolder - Absolute or relative path to the report folder.
 *
 * @returns {string} A ready-to-print message.
 *
 * @example
 * ```typescript
 * console.log(showReportMessage('./flakiness-report'));
 * // Interactive: "To open last Flakiness report, run:\n\n  npx flakiness show"
 * // On CI:       "Flakiness report written to /abs/path/flakiness-report"
 * ```
 */
export function showReportMessage(reportFolder: string): string {
  if (process.env.CI)
    return `Flakiness report written to ${path.resolve(reportFolder)}`;

  const command = showReportCommand(reportFolder);
  return `To open last Flakiness report, run:\n\n  ${styleText('cyan', command)}`;
}
