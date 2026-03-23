[![Tests](https://img.shields.io/endpoint?url=https%3A%2F%2Fflakiness.io%2Fapi%2Fbadge%3Finput%3D%257B%2522badgeToken%2522%253A%2522badge-5qUBbhdeYquEDJyBxGAv2X%2522%257D)](https://flakiness.io/flakiness/nodejs-sdk)

# Flakiness Node.js SDK

The Flakiness SDK provides a comprehensive set of tools for creating and managing [Flakiness JSON Reports](https://github.com/flakiness/flakiness-report) in Node.js.

## Installation

```bash
npm i @flakiness/sdk @flakiness/flakiness-report
```

Requires Node.js ^20.17.0 or >=22.9.0.

## Quick Start

Here's a minimal example of creating a Flakiness JSON Report:

```typescript
import { FlakinessReport } from '@flakiness/flakiness-report';
import {
  GitWorktree,
  ReportUtils,
  writeReport,
  uploadReport,
  CIUtils 
} from '@flakiness/sdk';

// Initialize git worktree and environment
const worktree = GitWorktree.create(process.cwd());
const env = ReportUtils.createEnvironment({ name: 'CI' });

// Create a simple test report
const report: FlakinessReport.Report = {
  category: 'testreport',
  commitId: worktree.headCommitId(),
  title: CIUtils.runTitle(),
  url: CIUtils.runUrl(),
  environments: [env],
  suites: [{
    title: 'My Test Suite',
    type: 'describe',
    tests: [{
      title: 'My Test',
      location: { file: 'test.spec.ts', line: 10, column: 1 },
      attempts: [{
        environmentIdx: 0,
        status: 'passed',
        expectedStatus: 'passed',
        duration: 100 as FlakinessReport.DurationMS,
      }],
    }],
  }],
  startTimestamp: Date.now() as FlakinessReport.UnixTimestampMS,
  duration: 100 as FlakinessReport.DurationMS,
};

// Write report to disk or upload to Flakiness.io
await writeReport(report, [], './flakiness-report');
// Or: await uploadReport(report, [], { flakinessAccessToken: 'your-token' });
```

## Entry Points

The SDK provides two entry points:

### `@flakiness/sdk`

The main entry point for Node.js environments. Provides full access to all SDK functionality including:
- Git repository utilities
- File system operations
- System resource monitoring
- Report upload/download
- Local report viewing

### `@flakiness/sdk/browser`

A browser-compatible entry point with a subset of utilities that work in browser environments. Exports:
- `ReportUtils` - Browser-safe utilities (normalizeReport, stripAnsi, visitTests)

Use this entry point when you need to process or manipulate reports in browser-based tools or web applications.

## Top-Level Exports

### Building Reports
- **`CIUtils`** - Utilities to extract CI/CD information (run URLs, run titles, environment detection)
- **`GithubOIDC`** - GitHub Actions OIDC integration for passwordless Flakiness.io authentication
- **`GitWorktree`** - Git repository utilities for path conversion and commit information
- **`ReportUtils`** - Namespace with utilities for report creation and manipulation:
  - `createEnvironment()` - Create environment objects with system information
  - `normalizeReport()` - Deduplicate environments, suites, and tests
  - `collectSources()` - Extract source code snippets for locations in the report
  - `stripAnsi()` - Remove ANSI escape codes from strings
  - `visitTests()` - Recursively visit all tests in a report
  - `createFileAttachment()` / `createDataAttachment()` - Create report attachments
- **`CPUUtilization`** - Track CPU utilization over time via periodic sampling
- **`RAMUtilization`** - Track RAM utilization over time via periodic sampling

### Working with Reports
- **`readReport()`** - Read a Flakiness report and its attachments from disk
- **`showReport()`** - Start a local server and open the report in your browser
- **`showReportCommand()`** - Build a shell command for opening the report later with the Flakiness CLI
- **`uploadReport()`** - Upload reports and attachments to Flakiness.io
- **`writeReport()`** - Write reports to disk in the standard Flakiness report format

## Uploading Reports

`uploadReport()` authenticates using one of the following methods (in order of priority):

1. **Access token** — pass `flakinessAccessToken` option or set the `FLAKINESS_ACCESS_TOKEN` environment variable.
2. **GitHub Actions OIDC** — when running inside GitHub Actions, `uploadReport` can authenticate automatically without an access token. This works when both conditions are met:
   - The report has `flakinessProject` set to a flakiness project identifier (e.g. `"org/proj"`).
   - The flakiness project is bound to the GitHub repository that runs the action.

   Your GitHub Actions workflow must grant the `id-token: write` permission:

   ```yaml
   permissions:
     id-token: write
   ```

   ```typescript
   const report: FlakinessReport.Report = {
     flakinessProject: 'my-org/my-project',
     // ... rest of the report
   };
   // No access token needed — OIDC authentication is used automatically.
   await uploadReport(report, attachments);
   ```

If neither method is available, the upload is skipped with a `'skipped'` status.
