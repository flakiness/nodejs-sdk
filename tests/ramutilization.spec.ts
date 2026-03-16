import { test, expect } from '@playwright/test';
import { RAMUtilization } from '../src/ramUtilization.js';
import os from 'os';

test('should work', async () => {
  const ram = new RAMUtilization();
  ram.sample();
  await new Promise(x => setTimeout(x, 100));
  ram.sample();
  const report: any = {};
  ram.enrich(report);
  expect(report.ramBytes).toBe(os.totalmem());
  expect(Array.isArray(report.ram)).toBe(true);
});
