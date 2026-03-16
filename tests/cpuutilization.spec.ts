import { test, expect } from '@playwright/test';
import { CPUUtilization } from '../src/cpuUtilization.js';
import os from 'os';

test('should work', async () => {
  const cpu = new CPUUtilization();
  cpu.sample();
  await new Promise(x => setTimeout(x, 100));
  cpu.sample();
  const report: any = {};
  cpu.enrich(report);
  expect(report.cpuCount).toBe(os.cpus().length);
  expect(Array.isArray(report.cpuMax)).toBe(true);
  expect(Array.isArray(report.cpuAvg)).toBe(true);
});
