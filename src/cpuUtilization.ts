import { FlakinessReport as FK } from "@flakiness/flakiness-report";
import os from 'os';
import { addTelemetryPoint, TelemetryPoint, toProtocolTelemetry } from "./_telemetry.js";

type CpuSample = {
  totalTicks: number,
  busyTicks: number,
};

function sampleCpus(): CpuSample[] {
  return os.cpus().map(cpu => {
    const totalTicks = cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    const idleTicks = cpu.times.idle;
    const busyTicks = totalTicks - idleTicks;
    return { totalTicks, busyTicks };
  });
}

/**
 * Tracks CPU utilization over time by recording periodic samples.
 *
 * Call `sample()` at desired intervals (e.g., test start/end, every second) to record
 * CPU usage. The class tracks both average and max utilization across all CPU cores.
 * Use `enrich()` to add the collected telemetry to a report.
 */
export class CPUUtilization {
  private _lastSample = sampleCpus();

  private _precision: number;
  private _cpuAvg: TelemetryPoint[] = [];
  private _cpuMax: TelemetryPoint[] = [];

  /**
   * @param options.precision - Minimum change in percentage points to record a new data point. Defaults to 7.
   */
  constructor(options?: {
    precision?: number,
  }) {
    this._precision = options?.precision ?? 7; // percents
  }

  /**
   * Records the current CPU utilization since the last sample.
   * The first call primes the baseline; subsequent calls record deltas.
   */
  sample() {
    const newSample = sampleCpus();
    if (newSample.length === this._lastSample.length) {
      // We measure utilization in percents, 0%-100%
      const utilization = newSample.map((cpu, idx) =>
        // If the CPU did no work since the last sample, then it's
        // utilization is effectively 0.
        cpu.totalTicks === this._lastSample[idx].totalTicks
          ? 0
          : (cpu.busyTicks - this._lastSample[idx].busyTicks) / (cpu.totalTicks - this._lastSample[idx].totalTicks) * 100
      );
      const timestamp = Date.now();
      addTelemetryPoint(this._cpuAvg, {
        timestamp,
        value: utilization.reduce((acc, x) => acc + x) / utilization.length,
      }, this._precision);
      addTelemetryPoint(this._cpuMax, {
        timestamp,
        value: Math.max(...utilization),
      }, this._precision);
    }
    this._lastSample = newSample;
  }

  /**
   * Adds collected CPU telemetry to the report.
   */
  enrich(report: FK.Report) {
    report.cpuCount = os.cpus().length;
    report.cpuMax = toProtocolTelemetry(this._cpuMax);
    report.cpuAvg = toProtocolTelemetry(this._cpuAvg);
  }
}
