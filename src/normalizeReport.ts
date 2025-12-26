import { FlakinessReport } from "@flakiness/flakiness-report";
import stableObjectHash from 'stable-hash';

type Brand<T, Brand extends string> = T & {
  readonly [B in Brand as `__${B}_brand`]: never;
};

type TestId = Brand<string, 'FlakinessReport.TestId'>;
type SuiteId = Brand<string, 'FlakinessReport.SuiteId'>;
type EnvId = Brand<string, 'FlakinessReport.EnvId'>;

class Multimap<K, V> {
  private _map = new Map<K, Set<V>>();

  set(key: K, value: V) {
    const set = this._map.get(key) ?? new Set();
    this._map.set(key, set);
    set.add(value);
  }

  getAll(key: K): V[] {
    return Array.from(this._map.get(key) ?? []);
  }
}

/**
 * Normalizes a Flakiness report by deduplicating environments, suites, and tests.
 *
 * This function processes a report to:
 * - Deduplicate environments based on their content (using stable hashing)
 * - Deduplicate suites and tests that appear multiple times
 * - Reindex environment references in test attempts to match the deduplicated environment array
 * - Merge tags from duplicate tests
 *
 * Use this function to clean up reports that may contain duplicate data from multiple
 * test runs or report generation passes.
 *
 * @param {FlakinessReport.Report} report - The Flakiness report to normalize.
 *
 * @returns {FlakinessReport.Report} A new normalized report with deduplicated environments,
 *   suites, and tests. The structure and content remain the same, but duplicates are removed.
 *
 * @example
 * ```typescript
 * const normalizedReport = normalizeReport(rawReport);
 * await writeReport(normalizedReport, attachments, './output');
 * ```
 */
export function normalizeReport(report: FlakinessReport.Report): FlakinessReport.Report {
  const gEnvs = new Map<EnvId, FlakinessReport.Environment>();
  const gSuites = new Map<SuiteId, FlakinessReport.Suite>();
  const gTests = new Multimap<TestId, FlakinessReport.Test>();

  const gSuiteIds = new Map<FlakinessReport.Suite, SuiteId>();
  const gTestIds = new Map<FlakinessReport.Test, TestId>();
  const gEnvIds = new Map<FlakinessReport.Environment, EnvId>();

  const gSuiteChildren = new Multimap<SuiteId, FlakinessReport.Suite>();
  const gSuiteTests = new Multimap<SuiteId, FlakinessReport.Test>();

  for (const env of report.environments) {
    const envId = computeEnvId(env);
    gEnvs.set(envId, env);
    gEnvIds.set(env, envId);
  }

  const usedEnvIds = new Set<EnvId>();

  function visitTests(tests: FlakinessReport.Test[], suiteId: SuiteId) {
    for (const test of tests ?? []) {
      const testId = computeTestId(test, suiteId);
      gTests.set(testId, test);
      gTestIds.set(test, testId);
      gSuiteTests.set(suiteId, test);

      for (const attempt of test.attempts) {
        const env = report.environments[attempt.environmentIdx];
        const envId = gEnvIds.get(env)!;
        usedEnvIds.add(envId);
      }
    }
  }

  function visitSuite(suite: FlakinessReport.Suite, parentSuiteId?: SuiteId) {
    const suiteId = computeSuiteId(suite, parentSuiteId);
    gSuites.set(suiteId, suite);
    gSuiteIds.set(suite, suiteId);
    for (const childSuite of suite.suites ?? []) {
      visitSuite(childSuite, suiteId);
      gSuiteChildren.set(suiteId, childSuite);
    }
    visitTests(suite.tests ?? [], suiteId);
  }

  function transformTests(tests: FlakinessReport.Test[]): FlakinessReport.Test[] {
    const testIds = new Set(tests.map(test => gTestIds.get(test)!));
    return [...testIds].map(testId => {
      const tests = gTests.getAll(testId);
      const tags = tests.map(test => test.tags ?? []).flat();

      return {
        location: tests[0].location,
        title: tests[0].title,
        tags: tags.length ? tags : undefined,
        attempts: tests.map(t => t.attempts).flat().map(attempt => ({
          ...attempt,
          environmentIdx: envIdToIndex.get(gEnvIds.get(report.environments[attempt.environmentIdx]!)!)!,
        })),
      } satisfies FlakinessReport.Test;
    });
  }

  function transformSuites(suites:FlakinessReport.Suite[]): FlakinessReport.Suite[] {
    const suiteIds = new Set(suites.map(suite => gSuiteIds.get(suite)!));
    return [...suiteIds].map(suiteId => {
      const suite = gSuites.get(suiteId)!;
      return {
        location: suite.location,
        title: suite.title,
        type: suite.type,
        suites: transformSuites(gSuiteChildren.getAll(suiteId)),
        tests: transformTests(gSuiteTests.getAll(suiteId)),
      } as FlakinessReport.Suite;
    });
  }

  visitTests(report.tests ?? [], 'suiteless' as SuiteId);
  for (const suite of report.suites)
    visitSuite(suite);

  const newEnvironments = [...usedEnvIds];
  const envIdToIndex = new Map(newEnvironments.map((envId, index) => [envId, index]));

  return {
    ...report,
    environments: newEnvironments.map(envId => gEnvs.get(envId)!),
    suites: transformSuites(report.suites),
    tests: transformTests(report.tests ?? [])
  } satisfies FlakinessReport.Report;
}

function computeEnvId(env: FlakinessReport.Environment): EnvId {
  return stableObjectHash(env) as EnvId;
}

function computeSuiteId(suite: FlakinessReport.Suite, parentSuiteId?: SuiteId): SuiteId {
  return stableObjectHash({
    parentSuiteId: parentSuiteId ?? '',
    type: suite.type,
    file: suite.location?.file ?? '',
    title: suite.title,
  }) as SuiteId;
}

function computeTestId(test: FlakinessReport.Test, suiteId: SuiteId): TestId {
  return stableObjectHash({
    suiteId,
    file: test.location?.file ?? '',
    title: test.title,
  }) as TestId;
}
