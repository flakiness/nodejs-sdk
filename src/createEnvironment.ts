import { FlakinessReport } from '@flakiness/flakiness-report';
import fs from 'fs';
import os from 'os';
import { shell } from './_internalUtils.js';

function readLinuxOSRelease() {
  const osReleaseText = fs.readFileSync('/etc/os-release', 'utf-8');
  return new Map(osReleaseText.toLowerCase().split('\n').filter(line => line.includes('=')).map(line => {
    line = line.trim();
    let [key, value] = line.split('=');
    if (value.startsWith('"') && value.endsWith('"'))
      value = value.substring(1, value.length - 1);
    return [key, value];
  }));
}

type OSInfo = { name?: string, arch?: string, version?: string };
function osLinuxInfo(): OSInfo {
  const arch = shell(`uname`, [`-m`]);
  const osReleaseMap = readLinuxOSRelease();
  const name = osReleaseMap.get('name') ?? shell(`uname`);
  const version = osReleaseMap.get('version_id');
  return { name, arch, version };
}

function osDarwinInfo(): OSInfo {
  const name = 'macos';
  const arch = shell(`uname`, [`-m`]);
  const version = shell(`sw_vers`, [`-productVersion`]);
  return { name, arch, version };
}

function osWinInfo(): OSInfo {
  const name = 'win';
  const arch = process.arch;
  const version = os.release();
  return { name, arch, version };
}

function getOSInfo(): OSInfo {
  if (process.platform === 'darwin')
    return osDarwinInfo();
  if (process.platform === 'win32')
    return osWinInfo();
  return osLinuxInfo();
}

function extractEnvConfiguration() {
  const ENV_PREFIX = 'FK_ENV_';
  return Object.fromEntries(Object
    .entries(process.env)
    .filter(([key]) => key.toUpperCase().startsWith(ENV_PREFIX.toUpperCase()))
    .map(([key, value]) => [key.substring(ENV_PREFIX.length).toLowerCase(), (value ?? '').trim().toLowerCase()])
  );
}

/**
 * Creates a Flakiness environment object with system information and user data.
 *
 * Automatically detects operating system details (name, architecture, version) and merges
 * environment variables prefixed with `FK_ENV_` into the user-supplied data. This function
 * is essential for creating environment metadata that helps identify test execution contexts
 * in Flakiness reports.
 *
 * @param {Object} options - Configuration object for the environment.
 * @param {string} options.name - Human-readable name for the environment (e.g., 'CI', 'Local Dev', 'Staging').
 * @param {Record<string, string>} [options.userSuppliedData] - Additional key-value pairs to include
 *   in the environment data. These are merged with `FK_ENV_*` environment variables.
 * @param {any} [options.opaqueData] - Optional opaque data object that will be stored with the
 *   environment but not used for environment deduplication.
 *
 * @returns {FlakinessReport.Environment} Environment object containing:
 *   - `name` - The provided environment name
 *   - `systemData` - Automatically detected OS information (arch, name, version)
 *   - `userSuppliedData` - Merged data from `FK_ENV_*` variables and `userSuppliedData` option
 *   - `opaqueData` - The provided opaque data, if any
 *
 * @example
 * ```typescript
 * // Basic usage
 * const env = createEnvironment({ name: 'CI' });
 *
 * // With custom data
 * const env = createEnvironment({
 *   name: 'Staging',
 *   userSuppliedData: { region: 'us-east-1', instance: 'large' }
 * });
 * ```
 */
export function createEnvironment(options: {
  name: string,
  userSuppliedData?: Record<string, string>,
  opaqueData?: any,
}): FlakinessReport.Environment {
  const osInfo = getOSInfo();
  return {
    name: options.name,
    systemData: {
      osArch: osInfo.arch,
      osName: osInfo.name,
      osVersion: osInfo.version,
    },
    userSuppliedData: {
      ...extractEnvConfiguration(),
      ...options.userSuppliedData ?? {},
    },
    opaqueData: options.opaqueData,
  }
}
