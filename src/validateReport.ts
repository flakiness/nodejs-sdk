import { FlakinessReport, Schema } from '@flakiness/flakiness-report';
import z from 'zod/v4';

/**
 * Validates a report object against the Flakiness Report schema.
 *
 * @param report - The report object to validate
 * @returns A formatted error string if validation fails, or `undefined` if the report is valid
 */
export function validateReport(report: FlakinessReport.Report): string|undefined {
  const validation = Schema.Report.safeParse(report);
  if (!validation.success) {
    const MAX_ISSUES = 5;

    const allIssues = validation.error.issues;
    const shownIssues = allIssues.slice(0, MAX_ISSUES);
    const remaining = allIssues.length - shownIssues.length;

    const base = [z.prettifyError(new z.ZodError(shownIssues))];
    if (remaining > 0)
      base.push(`... and ${remaining} more issue${remaining === 1 ? '' : 's'} ...`);
    return base.join('\n');
  }
  return undefined;
}

