const ansiRegex = new RegExp('[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))', 'g');

/**
 * Removes ANSI escape codes from a string.
 *
 * ANSI escape codes are used for terminal formatting (colors, styles, cursor movement).
 * This function strips all ANSI codes, making the string safe for storage in reports
 * or display in non-terminal contexts.
 *
 * @param {string} str - String that may contain ANSI escape codes.
 *
 * @returns {string} String with all ANSI escape codes removed.
 *
 * @example
 * ```typescript
 * const clean = stripAnsi(chalk.red('Error: test failed'));
 * // Returns: 'Error: test failed' (without color codes)
 * ```
 */
export function stripAnsi(str: string): string {
  return str.replace(ansiRegex, '');
}
