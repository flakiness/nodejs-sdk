import { FlakinessReport as FK } from '@flakiness/flakiness-report';
import { spawnSync } from 'child_process';
import os from 'os';
import { addTelemetryPoint, TelemetryPoint, toProtocolTelemetry } from './_telemetry.js';

/**
 * On MacOS, the os.freemem() gives a very crude number; use the following
 * trick to have an output similar to the one that HTOP yields.
 */
function getAvailableMemMacOS() {
  const lines = spawnSync('vm_stat', { encoding: 'utf8' }).stdout.trim().split('\n');
  const pageSize = parseInt(lines[0].match(/page size of (\d+) bytes/)![1], 10);
  if (isNaN(pageSize)) {
    console.warn('[flakiness.io] Error detecting macos page size');
    return 0;
  }

  let totalFree = 0;
  for (const line of lines) {
    if (/Pages (free|inactive|speculative):/.test(line)) {
      const match = line.match(/\d+/);
      if (match)
        totalFree +=  parseInt(match[0], 10);
    }
  }
  return totalFree * pageSize;
}

export class RAMUtilization {
  private _precision: number;
  private _totalBytes = os.totalmem();

  private _ram: TelemetryPoint[] = [];

  constructor(options?: {
    precision?: number,
  }) {
    this._precision = options?.precision ?? 1; // percents
  }

  sample() {
    const freeBytes = os.platform() === 'darwin' ? getAvailableMemMacOS() : os.freemem();
    addTelemetryPoint(this._ram, {
      timestamp: Date.now(),
      value: (this._totalBytes - freeBytes) / this._totalBytes * 100,
    }, this._precision)
  }

  enrich(report: FK.Report) {
    report.ramBytes = this._totalBytes;
    report.ram = toProtocolTelemetry(this._ram);
  }
}
