import fs from 'fs';
import path from 'path';
import { GitWorktree } from './gitWorktree.js';

function createConfigPath(dir: string) {
  return path.join(dir, '.flakiness', 'config.json');
}

let gConfigPath: string|undefined;

function ensureConfigPath(): string {
  if (!gConfigPath)
    gConfigPath = computeConfigPath();
  return gConfigPath;
}

function computeConfigPath() {
  // 1. Iterate the directory structure from process.cwd(), looking for the `.flakiness` folder.
  // Pick it if it exists.
  for (let p = process.cwd(); p !== path.resolve(p, '..'); p = path.resolve(p, '..')) {
    const configPath = createConfigPath(p);
    if (fs.existsSync(configPath))
      return configPath;
  }
  // 2. Since no existing config is found, try to find git root and place config there.
  try {
    const worktree = GitWorktree.create(process.cwd());
    return createConfigPath(worktree.rootPath());
  } catch (e) {
    // the computeGitRoot will fail if we're not inside git.
    // In this case, put config in the process.cwd.
    return createConfigPath(process.cwd());
  }
}

type JSONConfig = {
  projectPublicId?: string;
  customReportViewerUrl?: string,
}

/**
 * Manages Flakiness project configuration stored in `.flakiness/config.json`.
 *
 * The configuration file is automatically located by searching upward from the current working
 * directory for an existing `.flakiness` folder, or by placing it at the git repository root
 * if no existing config is found.
 */
export class FlakinessProjectConfig {
  /**
   * Loads the Flakiness project configuration from disk.
   *
   * Searches for an existing `.flakiness/config.json` file starting from the current working
   * directory and walking up the directory tree. If no config exists, it determines the
   * appropriate location (git root or current directory) for future saves.
   *
   * @returns {Promise<FlakinessProjectConfig>} Promise that resolves to a FlakinessProjectConfig
   *   instance. If no config file exists, returns an instance with default/empty values.
   *
   * @example
   * ```typescript
   * const config = await FlakinessProjectConfig.load();
   * const projectId = config.projectPublicId();
   * ```
   */
  static async load(): Promise<FlakinessProjectConfig> {
    const configPath = ensureConfigPath();
    const data = await fs.promises.readFile(configPath, 'utf-8').catch(e => undefined);
    const json: JSONConfig = data ? JSON.parse(data) as JSONConfig : {};
    return new FlakinessProjectConfig(configPath, json);
  }

  /**
   * Creates a new empty Flakiness project configuration.
   *
   * Creates a configuration instance with no values set. Use this when you want to build
   * a configuration from scratch. Call `save()` to persist it to disk.
   *
   * @returns {FlakinessProjectConfig} A new empty configuration instance.
   *
   * @example
   * ```typescript
   * const config = FlakinessProjectConfig.createEmpty();
   * config.setProjectPublicId('my-project-id');
   * await config.save();
   * ```
   */
  static createEmpty() {
    return new FlakinessProjectConfig(ensureConfigPath(), {});
  }

  constructor(
    private _configPath: string,
    private _config: JSONConfig) {
  }

  /**
   * Returns the absolute path to the configuration file.
   *
   * @returns {string} Absolute path to `.flakiness/config.json`.
   */
  path() {
    return this._configPath;
  }

  /**
   * Returns the project's public ID, if configured.
   *
   * The project public ID is used to associate reports with a specific Flakiness.io project.
   *
   * @returns {string | undefined} Project public ID, or `undefined` if not set.
   */
  projectPublicId() {
    return this._config.projectPublicId;
  }

  /**
   * Returns the report viewer URL, either custom or default.
   *
   * @returns {string} Custom report viewer URL if configured, otherwise the default
   *   `https://report.flakiness.io`.
   */
  reportViewerUrl() {
    return this._config.customReportViewerUrl ?? 'https://report.flakiness.io';
  }

  /**
   * Sets or clears the custom report viewer URL.
   *
   * @param {string | undefined} url - Custom report viewer URL to use, or `undefined` to
   *   clear and use the default URL.
   */
  setCustomReportViewerUrl(url: string|undefined) {
    if (url)
      this._config.customReportViewerUrl = url;
    else
      delete this._config.customReportViewerUrl;
  }

  /**
   * Sets the project's public ID.
   *
   * @param {string | undefined} projectId - Project public ID to set, or `undefined` to clear.
   */
  setProjectPublicId(projectId: string|undefined) {
    this._config.projectPublicId = projectId;
  }

  /**
   * Saves the configuration to disk.
   *
   * Writes the current configuration values to `.flakiness/config.json`. Creates the
   * `.flakiness` directory if it doesn't exist.
   *
   * @returns {Promise<void>} Promise that resolves when the file has been written.
   *
   * @throws {Error} Throws if unable to create directories or write the file.
   *
   * @example
   * ```typescript
   * const config = await FlakinessProjectConfig.load();
   * config.setProjectPublicId('my-project');
   * await config.save();
   * ```
   */
  async save() {
    await fs.promises.mkdir(path.dirname(this._configPath), { recursive: true });
    await fs.promises.writeFile(this._configPath, JSON.stringify(this._config, null, 2));
  }
}
