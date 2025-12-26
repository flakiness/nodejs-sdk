import { FlakinessReport } from "@flakiness/flakiness-report";
import { spawnSync } from 'child_process';
import os from 'os';

type SystemUtilizationSample = {
  timestamp: FlakinessReport.UnixTimestampMS,
  idleTicks: number,
  totalTicks: number,
  freeBytes: number,
};

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

function getSystemUtilization(): SystemUtilizationSample {
  let idleTicks = 0;
  let totalTicks = 0;
  for (const cpu of os.cpus()) {
    totalTicks += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    idleTicks += cpu.times.idle;
  }
  return {
    idleTicks,
    totalTicks,
    timestamp: Date.now() as FlakinessReport.UnixTimestampMS,
    freeBytes: os.platform() === 'darwin' ? getAvailableMemMacOS() : os.freemem(),
  };
}

function toFKUtilization(sample: SystemUtilizationSample, previous: SystemUtilizationSample): FlakinessReport.SystemUtilizationSample {
  const idleTicks = sample.idleTicks - previous.idleTicks;
  const totalTicks = sample.totalTicks - previous.totalTicks;
  const cpuUtilization = Math.floor((1 - idleTicks / totalTicks) * 10000) / 100;
  const memoryUtilization = Math.floor((1 - sample.freeBytes / os.totalmem()) * 10000) / 100;
  return {
    cpuUtilization,
    memoryUtilization: memoryUtilization,
    dts: (sample.timestamp - previous.timestamp) as FlakinessReport.DurationMS,
  }
}

/**
 * Samples and records system CPU and memory utilization over time.
 *
 * This class continuously monitors system resource usage at regular intervals and stores
 * the samples in a format suitable for inclusion in Flakiness reports. Sampling starts
 * immediately upon construction and continues until `dispose()` is called.
 *
 * The first sample is collected after 50ms, and subsequent samples are collected every
 * 1000ms (1 second). CPU utilization is calculated as a percentage based on CPU tick
 * differences between samples. Memory utilization uses platform-specific methods for
 * accurate measurement (especially on macOS).
 */
export class SystemUtilizationSampler {
  /**
   * The accumulated system utilization data.
   *
   * This object is populated as samples are collected and can be directly included in
   * Flakiness reports. It contains:
   * - `samples` - Array of utilization samples with CPU/memory percentages and durations
   * - `startTimestamp` - Timestamp when sampling began
   * - `totalMemoryBytes` - Total system memory in bytes
   */
  public readonly result: FlakinessReport.SystemUtilization;

  private _lastSample = getSystemUtilization();
  private _timer: NodeJS.Timeout;

  /**
   * Creates a new SystemUtilizationSampler and starts sampling immediately.
   *
   * The first sample is collected after 50ms, and subsequent samples are collected
   * every 1000ms. Call `dispose()` to stop sampling and clean up resources.
   */
  constructor() {
    this.result = {
      samples: [],
      startTimestamp: this._lastSample.timestamp,
      totalMemoryBytes: os.totalmem(),
    };
    // We collect the very first sample pretty fast; all other will be slower.
    this._timer = setTimeout(this._addSample.bind(this), 50);
  }

  private _addSample() {
    const sample = getSystemUtilization();
    this.result.samples.push(toFKUtilization(sample, this._lastSample));
    this._lastSample = sample;
    this._timer = setTimeout(this._addSample.bind(this), 1000);
  }

  /**
   * Stops sampling and cleans up resources.
   *
   * Call this method when you're done collecting utilization data to stop the sampling
   * timer and prevent memory leaks. The `result` object remains accessible after disposal.
   */
  dispose() {
    clearTimeout(this._timer);
  }
}
