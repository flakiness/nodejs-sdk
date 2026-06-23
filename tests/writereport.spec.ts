import { FlakinessReport } from '@flakiness/flakiness-report';
import { test } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeReport } from '../src/writeReport.js';

class TmpFolder {
  static async create(prefix = 'fk-writereport-') {
    return new TmpFolder(await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix)));
  }

  constructor(public dir: string) {
  }

  [Symbol.dispose]() {
    fs.rmSync(this.dir, { recursive: true, force: true });
  } 
}

test('writeReport successfully writes report.json from parallel processes', async () => {
  using tmp = await TmpFolder.create();
  const outputFolder = path.join(tmp.dir, 'flakiness-report');
  const report = {
    title: 'hello',
    suites: [],
  } as unknown as FlakinessReport.Report;
  // Spawn 100 parallel writers and make sure they pass.
  await Promise.all(Array(100).fill(0).map(() => writeReport(report, [], outputFolder)));
});

