import { FlakinessReport } from '@flakiness/flakiness-report';
import fs from 'fs/promises';
import path from 'path';
import { FileAttachment } from './uploadReport.js';
import { visitTests } from './visitTests.js';

/**
 * Reads a Flakiness report and its attachments from a folder on disk.
 *
 * This function reads a Flakiness report that was previously written to disk using `writeReport()`.
 * It parses the `report.json` file and locates all attachment files referenced in the report.
 *
 * The function expects the report folder to follow the standard Flakiness report structure:
 * - `report.json` - The main report file containing test results and metadata
 * - `attachments/` - Directory containing all attachment files, named by their ID
 *
 * @param {string} reportFolder - Absolute or relative path to the folder containing the Flakiness
 *   report. The folder must contain a `report.json` file. Attachments are expected to be in the
 *   `attachments/` subdirectory, but the function will work even if the attachments directory
 *   doesn't exist (all attachments will be reported as missing).
 *
 * @returns {Promise<{report: FlakinessReport.Report, attachments: FileAttachment[], missingAttachments: FlakinessReport.Attachment[]}>}
 *   Promise that resolves to an object containing:
 *   - `report` - The parsed Flakiness report object
 *   - `attachments` - Array of `FileAttachment` objects for attachments that were found on disk.
 *     Each attachment has:
 *     - `type: 'file'` - All returned attachments are file-based
 *     - `contentType` - MIME type from the report
 *     - `id` - Attachment ID (filename)
 *     - `path` - Absolute path to the attachment file
 *   - `missingAttachments` - Array of attachment objects from the report that could not be found
 *     on disk. This allows callers to detect and handle missing attachments gracefully.
 *
 * @throws {Error} Throws if `report.json` cannot be read, the folder doesn't exist, or JSON parsing fails.
 *
 * @example
 * ```typescript
 * const { report, attachments, missingAttachments } = await readReport('./flakiness-report');
 *
 * if (missingAttachments.length > 0) {
 *   console.warn(`Warning: ${missingAttachments.length} attachments are missing`);
 * }
 *
 * // Use the report and attachments
 * await uploadReport(report, attachments);
 * ```
 */
export async function readReport(reportFolder: string): Promise<{
  report: FlakinessReport.Report,
  attachments: FileAttachment[],
  missingAttachments: FlakinessReport.Attachment[],
}> {
  reportFolder = path.resolve(reportFolder);
  const text = await fs.readFile(path.join(reportFolder, 'report.json'), 'utf-8');
  const report = JSON.parse(text) as FlakinessReport.Report;
  
  // Read all files from attachments directory (if it exists).
  const attachmentsFolder = path.join(reportFolder, 'attachments');
  let attachmentFiles: string[] = [];
  try {
    attachmentFiles = await listFilesRecursively(attachmentsFolder);
  } catch (error: any) {
    // If attachments directory doesn't exist, that's okay - all attachments will be reported as missing
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  const filenameToPath = new Map(attachmentFiles.map(file => [path.basename(file), file]));
  const attachmentIdToPath = new Map<FlakinessReport.AttachmentId, FileAttachment>();
  const missingAttachments = new Map<FlakinessReport.AttachmentId, FlakinessReport.Attachment>();
  visitTests(report, (test) => {
    for (const attempt of test.attempts) {
      for (const attachment of attempt.attachments ?? []) {
        const attachmentPath = filenameToPath.get(attachment.id);
        if (!attachmentPath) {
          missingAttachments.set(attachment.id, attachment);
        } else {
          attachmentIdToPath.set(attachment.id, {
            contentType: attachment.contentType,
            id: attachment.id,
            path: attachmentPath,
            type: 'file',
          });
        }
      }
    }
  });
  return {
    report,
    attachments: Array.from(attachmentIdToPath.values()),
    missingAttachments: Array.from(missingAttachments.values()),
  };
}

async function listFilesRecursively(dir: string, result: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory())
      await listFilesRecursively(fullPath, result);
    else
      result.push(fullPath);
  }
  return result;
}