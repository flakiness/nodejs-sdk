import { FlakinessReport } from "@flakiness/flakiness-report";

/**
 * Recursively visits all tests in a Flakiness report. For each test encountered, the visitor
 * function is called with the test object and an array of parent suites representing the full
 * hierarchy path from root to the test's immediate parent.
 *
 * @param {FlakinessReport.Report} report - The Flakiness report to traverse.
 *
 * @param {function} testVisitor - Callback function invoked for each test found in the report.
 *   Receives two parameters:
 *   - `test` {FlakinessReport.Test} - The current test object being visited
 *   - `parentSuites` {FlakinessReport.Suite[]} - Array of parent suites from root to immediate
 *     parent. Empty array for root-level tests. The array represents the full hierarchy path,
 *     with index 0 being the top-level suite and the last element being the immediate parent.
 *
 * @returns {void} This function does not return a value.
 *
 * @example
 * ```typescript
 * visitTests(report, (test, parentSuites) => {
 *   const suitePath = parentSuites.map(suite => suite.name).join(' > ');
 *   const fullPath = suitePath ? `${suitePath} > ${test.name}` : test.name;
 *   console.log(`${fullPath}: ${test.status}`);
 * });
 * ```
 */
export function visitTests(report: FlakinessReport.Report, testVisitor: (test: FlakinessReport.Test, parentSuites: FlakinessReport.Suite[]) => void) {
  function visitSuite(suite: FlakinessReport.Suite, parents: FlakinessReport.Suite[]) {
    parents.push(suite);
    for (const test of suite.tests ?? [])
      testVisitor(test, parents);
    for (const childSuite of suite.suites ?? [])
      visitSuite(childSuite, parents);
    parents.pop();
  }
  for (const test of report.tests ?? [])
    testVisitor(test, []);
  for (const suite of report.suites)
    visitSuite(suite, []);
}
