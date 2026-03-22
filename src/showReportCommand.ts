import fs from 'node:fs';
import path from 'node:path';
import which from 'which';

const DEFAULT_REPORT_FOLDER = 'flakiness-report';
const FLAKINESS_CLI_COMMANDS = {
  GLOBAL: 'flakiness',
  PNPM: 'pnpm dlx flakiness',
  NPM: 'npx flakiness',
} as const;

type FlakinessCLICommand = typeof FLAKINESS_CLI_COMMANDS[keyof typeof FLAKINESS_CLI_COMMANDS];
type PackageManager = 'npm' | 'other' | 'pnpm';

/**
 * Builds a command that opens a Flakiness report with the Flakiness CLI.
 *
 * The command is tailored for the shell directory from which the current process
 * was originally invoked. This matters when package managers like pnpm change the
 * working directory while running scripts.
 *
 * @param {string} reportFolder - Absolute or relative path to the report folder.
 *
 * @returns {string} A shell command such as `pnpm dlx flakiness show`.
 *
 * @example
 * ```typescript
 * const command = showReportCommand('./flakiness-report');
 * // Returns: "npx flakiness show"
 * ```
 */
export function showReportCommand(reportFolder: string): string {
  const userCwd = path.resolve(process.env.INIT_CWD || process.cwd());
  const flakinessCLI = detectFlakinessCLIFromEnv() ?? detectFlakinessCLIFromFilesystem(userCwd) ?? detectFlakinessCLIFromPath() ?? FLAKINESS_CLI_COMMANDS.NPM;
  const absoluteReportFolder = path.resolve(reportFolder);
  const reportFolderArg = formatReportFolderArg(absoluteReportFolder, userCwd);
  return `${flakinessCLI} show${reportFolderArg ? ` ${reportFolderArg}` : ''}`;
}

function detectFlakinessCLIFromEnv(): FlakinessCLICommand | undefined {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.startsWith('pnpm/'))
    return FLAKINESS_CLI_COMMANDS.PNPM;
  if (userAgent.startsWith('npm/'))
    return FLAKINESS_CLI_COMMANDS.NPM;

  const execPath = process.env.npm_execpath ?? '';
  const execName = execPath ? path.basename(execPath).toLowerCase() : '';
  if (execName.startsWith('pnpm'))
    return FLAKINESS_CLI_COMMANDS.PNPM;
  return undefined;
}

function detectFlakinessCLIFromFilesystem(userCwd: string): FlakinessCLICommand | undefined {
  for (const dir of ancestorDirectories(userCwd)) {
    const packageManager = parsePackageJSON(dir);
    if (packageManager === 'pnpm')
      return FLAKINESS_CLI_COMMANDS.PNPM;
    if (packageManager === 'npm' || packageManager === 'other')
      return FLAKINESS_CLI_COMMANDS.NPM;
    if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml')))
      return FLAKINESS_CLI_COMMANDS.PNPM;
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')))
      return FLAKINESS_CLI_COMMANDS.PNPM;
  }
  return undefined;
}

function detectFlakinessCLIFromPath(): FlakinessCLICommand | undefined {
  if (which.sync('flakiness', { nothrow: true }))
    return FLAKINESS_CLI_COMMANDS.GLOBAL;
  if (which.sync('npx', { nothrow: true }))
    return FLAKINESS_CLI_COMMANDS.NPM;
  if (which.sync('pnpm', { nothrow: true }))
    return FLAKINESS_CLI_COMMANDS.PNPM;
  return undefined;
}

function parsePackageJSON(dir: string): PackageManager | undefined {
  const packageJsonPath = path.join(dir, 'package.json');
  if (!fs.existsSync(packageJsonPath))
    return undefined;

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      packageManager?: unknown,
    };
    if (typeof packageJson.packageManager !== 'string')
      return undefined;
    if (packageJson.packageManager.startsWith('pnpm@'))
      return 'pnpm';
    if (packageJson.packageManager.startsWith('npm@'))
      return 'npm';
    return 'other';
  } catch {
    return undefined;
  }
}

function ancestorDirectories(startDir: string): string[] {
  const directories: string[] = [];
  let current = path.resolve(startDir);
  while (true) {
    directories.push(current);
    const parent = path.dirname(current);
    if (parent === current)
      return directories;
    current = parent;
  }
}

function formatReportFolderArg(reportFolder: string, userCwd: string): string {
  if (isSamePath(reportFolder, path.resolve(userCwd, DEFAULT_REPORT_FOLDER)))
    return '';

  const relativePath = path.relative(userCwd, reportFolder) || '.';
  return quoteShellArgument(relativePath);
}

function isSamePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  if (process.platform === 'win32')
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  return normalizedLeft === normalizedRight;
}

function quoteShellArgument(argument: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(argument))
    return argument;
  return JSON.stringify(argument);
}
