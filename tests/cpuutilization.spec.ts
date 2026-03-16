import { test, expect } from '@playwright/test';
import { CPUUtilization } from '../src/cpuUtilization.js';
import os from 'os';

test('sample() does not throw', () => {
  const cpu = new CPUUtilization();
  expect(() => cpu.sample()).not.toThrow();
});

test('enrich() adds cpu telemetry to report', () => {
  const cpu = new CPUUtilization();
  cpu.sample();
  cpu.sample();
  const report: any = {};
  cpu.enrich(report);
  expect(report.cpuCount).toBe(os.cpus().length);
  expect(report.cpuCount).toBeGreaterThan(0);
  expect(Array.isArray(report.cpuMax)).toBe(true);
  expect(Array.isArray(report.cpuAvg)).toBe(true);
});
