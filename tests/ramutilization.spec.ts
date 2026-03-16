import { test, expect } from '@playwright/test';
import { RAMUtilization } from '../src/ramUtilization.js';
import os from 'os';

test('sample() does not throw', () => {
  const ram = new RAMUtilization();
  expect(() => ram.sample()).not.toThrow();
});

test('enrich() adds ram telemetry to report', () => {
  const ram = new RAMUtilization();
  ram.sample();
  ram.sample();
  const report: any = {};
  ram.enrich(report);
  expect(report.ramBytes).toBe(os.totalmem());
  expect(report.ramBytes).toBeGreaterThan(0);
  expect(Array.isArray(report.ram)).toBe(true);
});
