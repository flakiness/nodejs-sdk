import { FlakinessReport } from '@flakiness/flakiness-report';
import assert from 'assert';
import { exec } from 'child_process';
import debug from 'debug';
import { posix as posixPath, win32 as win32Path } from 'path';
import { promisify } from 'util';
import { Brand, shell } from './_internalUtils.js';

const log = debug('fk:git');

const execAsync = promisify(exec);

/**
 * Represents a git commit with its metadata.
 *
 * This type is returned by `GitWorktree.listCommits()` and contains all the information
 * needed to identify and reference a commit in a git repository.
 */
export type GitCommit = {
  /** Full commit hash (SHA-1, 40 characters) */
  commitId: FlakinessReport.CommitId,
  /** Commit timestamp in milliseconds since Unix epoch */
  timestamp: FlakinessReport.UnixTimestampMS,
  /** Commit message (subject line only) */
  message: string,
  /** Author name, if available */
  author?: string,
  /** Array of parent commit IDs (empty for initial commit, typically one for normal commits, multiple for merges) */
  parents: FlakinessReport.CommitId[],
}

type PosixAbsolutePath = Brand<string, 'PosixPath'>;

/**
 * Different environments might yield different paths.
 * - Win32: D:\foo\bar.txt
 * - ALMOST_POSIX: D:/foo/bar.txt (this is how many folks on the internet end up converting Win32 paths to Posix paths, including Playwright.)
 * - Posix: /d/foo/bar.txt
 * Goal is to normalize them all to POSIX.
 * @param aPath a relative or absolute path.
 * @returns
 */
const IS_WIN32_PATH = new RegExp('^[a-zA-Z]:\\\\', 'i');
const IS_ALMOST_POSIX_PATH = new RegExp('^[a-zA-Z]:/', 'i');

function toPosixAbsolutePath(absolutePath: string): PosixAbsolutePath {
  if (IS_WIN32_PATH.test(absolutePath)) {
    // convert Win32 path to ALMOST_POSIX path
    absolutePath = absolutePath.split(win32Path.sep).join(posixPath.sep);
  }
  if (IS_ALMOST_POSIX_PATH.test(absolutePath))
    return ('/' + absolutePath[0] + absolutePath.substring(2)) as PosixAbsolutePath;
  return absolutePath as PosixAbsolutePath;
}

function toNativeAbsolutePath(posix: PosixAbsolutePath): string {
  // On non-win32 systems, posix path is already native
  if (process.platform !== 'win32')
    return posix;

  // Convert POSIX path (/d/foo/bar.txt) to Win32 format (D:\foo\bar.txt)
  assert(posix.startsWith('/'), 'The path must be absolute');
  const m = posix.match(/^\/([a-zA-Z])(\/.*)?$/);
  assert(m, `Invalid POSIX path: ${posix}`)

  const drive = m[1];
  const rest = (m[2] ?? '').split(posixPath.sep).join(win32Path.sep);
  return drive.toUpperCase() + ':' + rest;
}

/**
 * Utilities for working with git repositories and converting between git-relative paths
 * and absolute native paths. Essential for creating Flakiness Reports where all paths
 * must be relative to the git root.
 */
export class GitWorktree {
  /**
   * Creates a GitWorktree instance from any path inside a git repository.
   *
   * @param {string} somePathInsideGitRepo - Any path (file or directory) within a git repository.
   *   Can be absolute or relative. The function will locate the git root directory.
   *
   * @returns {GitWorktree} A new GitWorktree instance bound to the discovered git root.
   *
   * @throws {Error} Throws if the path is not inside a git repository or if git commands fail.
   *
   * @example
   * ```typescript
   * const worktree = GitWorktree.create('./src/my-test.ts');
   * const gitRoot = worktree.rootPath();
   * ```
   */
  static create(somePathInsideGitRepo: string) {
    const root = shell(`git`, ['rev-parse', '--show-toplevel'], {
      cwd: somePathInsideGitRepo,
      encoding: 'utf-8',
    });
    assert(root, `FAILED: git rev-parse --show-toplevel HEAD @ ${somePathInsideGitRepo}`);
    return new GitWorktree(root);
  }

  private _posixGitRoot: PosixAbsolutePath;

  constructor(private _gitRoot: string) {
    this._posixGitRoot = toPosixAbsolutePath(this._gitRoot);
  }

  /**
   * Returns the native absolute path of the git repository root directory.
   *
   * @returns {string} Native absolute path to the git root. Format matches the current platform
   *   (Windows or POSIX).
   *
   * @example
   * ```typescript
   * const root = worktree.rootPath();
   * // On Windows: 'D:\project'
   * // On Unix: '/project'
   * ```
   */
  rootPath(): string {
    return this._gitRoot;
  }

  /**
   * Returns the commit ID (SHA-1 hash) of the current HEAD commit.
   *
   * @returns {FlakinessReport.CommitId} Full 40-character commit hash of the HEAD commit.
   *
   * @throws {Error} Throws if git command fails or repository is in an invalid state.
   *
   * @example
   * ```typescript
   * const commitId = worktree.headCommitId();
   * // Returns: 'a1b2c3d4e5f6...' (40-character SHA-1)
   * ```
   */
  headCommitId(): FlakinessReport.CommitId {
    const sha = shell(`git`, ['rev-parse', 'HEAD'], {
      cwd: this._gitRoot,
      encoding: 'utf-8',
    });
    assert(sha, `FAILED: git rev-parse HEAD @ ${this._gitRoot}`);
    return sha.trim() as FlakinessReport.CommitId;
  }

  /**
   * Converts a native absolute path to a git-relative POSIX path.
   *
   * Takes any absolute path (Windows or POSIX format) and converts it to a POSIX path
   * relative to the git repository root. This is essential for Flakiness reports where
   * all file paths must be git-relative and use POSIX separators.
   *
   * @param {string} absolutePath - Native absolute path to convert. Can be in Windows format
   *   (e.g., `D:\project\src\test.ts`) or POSIX format (e.g., `/project/src/test.ts`).
   *
   * @returns {FlakinessReport.GitFilePath} POSIX path relative to git root (e.g., `src/test.ts`).
   *   Returns an empty string if the path is the git root itself.
   *
   * @example
   * ```typescript
   * const gitPath = worktree.gitPath('/Users/project/src/test.ts');
   * // Returns: 'src/test.ts'
   * ```
   */
  gitPath(absolutePath: string): FlakinessReport.GitFilePath {
    return posixPath.relative(this._posixGitRoot, toPosixAbsolutePath(absolutePath)) as FlakinessReport.GitFilePath;
  }

  /**
   * Converts a git-relative POSIX path to a native absolute path.
   *
   * Takes a POSIX path relative to the git root and converts it to the native absolute path
   * format for the current platform (Windows or POSIX). This is the inverse of `gitPath()`.
   *
   * @param {FlakinessReport.GitFilePath} relativePath - POSIX path relative to git root
   *   (e.g., `src/test.ts`).
   *
   * @returns {string} Native absolute path. On Windows, returns Windows format (e.g., `D:\project\src\test.ts`).
   *   On POSIX systems, returns POSIX format (e.g., `/project/src/test.ts`).
   *
   * @example
   * ```typescript
   * const absolutePath = worktree.absolutePath('src/test.ts');
   * // On Windows: 'D:\project\src\test.ts'
   * // On Unix: '/project/src/test.ts'
   * ```
   */
  absolutePath(relativePath: FlakinessReport.GitFilePath): string {
    return toNativeAbsolutePath(posixPath.join(this._posixGitRoot, relativePath) as PosixAbsolutePath);
  }

  /**
   * Lists recent commits from the repository.
   *
   * Retrieves commit information including commit ID, timestamp, author, message, and parent commits.
   * Note: CI environments often have shallow checkouts with limited history, which may affect
   * the number of commits returned.
   *
   * @param {number} count - Maximum number of commits to retrieve, starting from HEAD.
   *
   * @returns {Promise<GitCommit[]>} Promise that resolves to an array of commit objects, ordered
   *   from most recent to oldest. Each commit includes:
   *   - `commitId` - Full commit hash
   *   - `timestamp` - Commit timestamp in milliseconds since Unix epoch
   *   - `message` - Commit message (subject line)
   *   - `author` - Author name
   *   - `parents` - Array of parent commit IDs
   *
   * @example
   * ```typescript
   * const commits = await worktree.listCommits(10);
   * console.log(`Latest commit: ${commits[0].message}`);
   * ```
   */
  async listCommits(count: number): Promise<GitCommit[]> {
    return await listCommits(this._gitRoot, 'HEAD', count);
  }
}

async function listCommits(gitRoot: string, head: string, count: number): Promise<GitCommit[]> {
  const FIELD_SEPARATOR = '|~|';
  const RECORD_SEPARATOR = '\0';

  // Git log format: hash, timestamp, author, subject, parents
  const prettyFormat = [
    '%H',  // Full commit hash
    '%ct', // Commit timestamp (Unix seconds)
    '%an', // Author name
    '%s',  // Subject line
    '%P'   // Parent hashes (space-separated)
  ].join(FIELD_SEPARATOR);

  const command = `git log ${head} -n ${count} --pretty=format:"${prettyFormat}" -z`;

  try {
    const { stdout } = await execAsync(command, { cwd: gitRoot });

    if (!stdout) {
      return [];
    }

    return stdout
      .trim()
      .split(RECORD_SEPARATOR)
      .filter(record => record)
      .map(record => {
        const [commitId, timestampStr, author, message, parentsStr] = record.split(FIELD_SEPARATOR);
        const parents = parentsStr ? parentsStr.split(' ').filter(p => p) : [];

        return {
          commitId: commitId as FlakinessReport.CommitId,
          timestamp: parseInt(timestampStr, 10) * 1000 as FlakinessReport.UnixTimestampMS,
          author,
          message,
          parents: parents as FlakinessReport.CommitId[],
          walkIndex: 0,
        };
      });
  } catch (error) {
    log(`Failed to list commits for repository at ${gitRoot}:`, error);
    return [];
  }
}