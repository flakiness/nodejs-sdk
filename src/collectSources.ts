import { FlakinessReport as FK } from '@flakiness/flakiness-report';
import fs from 'fs';
import { GitWorktree } from './gitWorktree.js';

function collectLocationsFromTestStep(testStep: FK.TestStep, onLocation: (location: FK.Location|undefined) => void) {
  onLocation(testStep.location);
  for (const step of testStep.steps ?? [])
    collectLocationsFromTestStep(step, onLocation);
}

function collectLocationsFromTest(test: FK.Test, onLocation: (location: FK.Location|undefined) => void) {
  onLocation(test.location);
  for (const attempt of test.attempts) {
    for (const annotation of attempt.annotations ?? [])
      onLocation(annotation.location);
    for (const err of attempt.errors ?? [])
      onLocation(err.location);
    for (const step of attempt.steps ?? [])
      collectLocationsFromTestStep(step, onLocation);
  }
}

function collectLocationsFromSuite(suite: FK.Suite, onLocation: (location: FK.Location|undefined) => void) {
  onLocation(suite.location);
  for (const child of suite.suites ?? [])
    collectLocationsFromSuite(child, onLocation);
  for (const test of suite.tests ?? [])
    collectLocationsFromTest(test, onLocation);
}

function collectLocationsFromReport(report: FK.Report, onLocation: (location: FK.Location|undefined) => void) {
  for (const e of report.unattributedErrors ?? [])
    onLocation(e.location);
  for (const test of report.tests ?? [])
    collectLocationsFromTest(test, onLocation);
  for (const suite of report.suites ?? [])
    collectLocationsFromSuite(suite, onLocation);
}

function lineNumbersToChunks(lineNumbers: Iterable<FK.Number1Based>, options: { context: number }): [FK.Number1Based, FK.Number1Based][] {
  const context = options.context;
  const result: [FK.Number1Based, FK.Number1Based][] = [];
  let current: [FK.Number1Based, FK.Number1Based]|undefined;
  for (const ln of Array.from(lineNumbers).sort((a, b) => a - b)) {
    const span = [ln - context, ln + context] as [FK.Number1Based, FK.Number1Based];
    if (!current || current[1] + 1 < span[0]) {
      result.push(span);
      current = span;
    } else {
      current[1] = span[1];
    }
  }
  return result;
}

export function collectSources(worktree: GitWorktree, report: FK.Report) {
  const filesToLines = new Map<FK.GitFilePath, Set<FK.Number1Based>>();
  collectLocationsFromReport(report, location => {
    if (!location)
      return;
    let lineNumbers = filesToLines.get(location.file);
    if (!lineNumbers) {
      lineNumbers = new Set();
      filesToLines.set(location.file, lineNumbers);
    }
    lineNumbers.add(location.line);
  });

  const sources: FK.Source[] = [];
  for (const [gitFilePath, lineNumbers] of filesToLines) {
    let source: string;
    try {
      source = fs.readFileSync(worktree.absolutePath(gitFilePath), 'utf-8');
    } catch (e) {
      continue;
    }
    const sourceLines = source.split('\n');
    for (const chunk of lineNumbersToChunks(lineNumbers, { context: 5 })) {
      const from = Math.max(chunk[0] - 1, 0);
      const to = Math.min(chunk[1], sourceLines.length);
      sources.push({
        filePath: gitFilePath,
        lineOffset: from !== 0 ? from + 1 : undefined,
        text: sourceLines.slice(from, to).join('\n'),
      });
    }
  }
  report.sources = sources;
}
