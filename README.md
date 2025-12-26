# Flakiness Node.js SDK

The Flakiness SDK provides a comprehensive set of tools for creating and managing [Flakiness JSON Reports](https://github.com/flakiness/flakiness-report) in Node.js.

## Installation

```bash
npm i @flakiness/sdk
```

## Quick Start

Here's a minimal example of creating a Flakiness JSON Report:

```typescript
import { 
  FlakinessReport,
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
        expectedStatus: 'passed',
        actualStatus: 'passed',
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
- `FlakinessReport` - Type definitions for the report format
- `ReportUtils` - Browser-safe utilities (normalizeReport, stripAnsi, visitTests)

Use this entry point when you need to process or manipulate reports in browser-based tools or web applications.

## Top-Level Exports

### Report Type & Validation
- **`FlakinessReport`** - Type definitions and validation for the [Flakiness JSON Report](https://github.com/flakiness/flakiness-report) format

### Building Reports
- **`CIUtils`** - Utilities to extract CI/CD information (run URLs, environment detection)
- **`GitWorktree`** - Git repository utilities for path conversion and commit information
- **`ReportUtils`** - Namespace with utilities for report creation and manipulation:
  - `createEnvironment()` - Create environment objects with system information
  - `normalizeReport()` - Deduplicate environments, suites, and tests
  - `createTestStepSnippetsInplace()` - Generate code snippets for test steps
  - `stripAnsi()` - Remove ANSI escape codes from strings
  - `visitTests()` - Recursively visit all tests in a report
  - `createFileAttachment()` / `createDataAttachment()` - Create report attachments
- **`SystemUtilizationSampler`** - Monitor and record CPU/memory utilization during test runs

### Working with Reports
- **`showReport()`** - Start a local server and open the report in your browser
- **`uploadReport()`** - Upload reports and attachments to Flakiness.io
- **`writeReport()`** - Write reports to disk in the standard Flakiness report format

### Project Configuration
- **`FlakinessProjectConfig`** - Manage project configuration stored in `.flakiness/config.json`

