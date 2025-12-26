/*
  Copyright (c) Microsoft Corporation.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

import { codeFrameColumns } from '@babel/code-frame';
import { FlakinessReport } from '@flakiness/flakiness-report';
import fs from 'fs';
import { GitWorktree } from './gitWorktree.js';
import { visitTests } from './visitTests.js';

/**
 * Generates code snippets for test steps and attaches them to the report in-place.
 *
 * This function reads source files from the git worktree and creates highlighted code snippets
 * for each test step that has a location. The snippets include 3 lines of context (1 before,
 * the line itself, 1 after) with syntax highlighting and a visual indicator pointing to the
 * exact column position.
 *
 * The snippets are attached directly to the `step.snippet` property of each test step in the
 * report object. Steps without locations or with invalid file paths are silently skipped.
 *
 * @param {GitWorktree} worktree - Git worktree instance used to resolve file paths from
 *   git-relative paths to absolute paths for reading source files.
 *
 * @param {FlakinessReport.Report} report - Flakiness report to process. The report is modified
 *   in-place by adding `snippet` properties to test steps.
 *
 * @returns {void} This function modifies the report in-place and does not return a value.
 *
 * @example
 * ```typescript
 * const worktree = GitWorktree.create(process.cwd());
 * createTestStepSnippetsInplace(worktree, report);
 * // Report steps now have .snippet properties with highlighted code
 * ```
 */
export function createTestStepSnippetsInplace(worktree: GitWorktree, report: FlakinessReport.Report) {
  const allSteps = new Map<FlakinessReport.GitFilePath, Set<FlakinessReport.TestStep>>();
  visitTests(report, test => {
    for (const attempt of test.attempts) {
      for (const step of attempt.steps ?? []) {
        if (!step.location)
          continue;
        let fileSteps = allSteps.get(step.location.file);
        if (!fileSteps) {
          fileSteps = new Set();
          allSteps.set(step.location.file, fileSteps);
        }
        fileSteps.add(step);
      }
    }
  });

  for (const [gitFilePath, steps] of allSteps) {
    let source: string;
    try {
      source = fs.readFileSync(worktree.absolutePath(gitFilePath), 'utf-8');
    } catch (e) {
      continue;
    }
    const lines = source.split('\n').length;
    const highlighted = codeFrameColumns(source, { start: { line: lines, column: 1 } }, { highlightCode: true, linesAbove: lines, linesBelow: 0 });
    const highlightedLines = highlighted.split('\n');
    const lineWithArrow = highlightedLines[highlightedLines.length - 1];
    for (const step of steps) {
      if (!step.location)
        continue;
      // Don't bother with snippets that have less than 3 lines.
      if (step.location.line < 2 || step.location.line >= lines)
        continue;
      // Cut out snippet.
      const snippetLines = highlightedLines.slice(step.location.line - 2, step.location.line + 1);
      // Relocate arrow.
      const index = lineWithArrow.indexOf('^');
      const shiftedArrow = lineWithArrow.slice(0, index) + ' '.repeat(step.location.column - 1) + lineWithArrow.slice(index);
      // Insert arrow line.
      snippetLines.splice(2, 0, shiftedArrow);
      step.snippet = snippetLines.join('\n');
    }
  }
}
