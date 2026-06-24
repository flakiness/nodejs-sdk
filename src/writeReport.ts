import { FlakinessReport } from '@flakiness/flakiness-report';
import fs from 'fs';
import path from 'path';
import { randomUUIDBase62 } from './_internalUtils.js';
import { Attachment, FileAttachment } from './uploadReport.js';

/**
 * Writes a Flakiness report along with its attachments to the output folder, according to the
 * directory layout specified in the https://github.com/flakiness/flakiness-report specification.
 *
 * This function creates the standard Flakiness report structure:
 * - `report.json` - The main report file containing test results and metadata
 * - `attachments/` - Directory containing all attachment files, named by their ID
 *
 * The output folder is completely removed and recreated to ensure a clean state.
 *
 * @param {FlakinessReport.Report} report - A Flakiness JSON Report object. This object will be
 *   serialized to JSON and written as `report.json`.
 *
 * @param {Attachment[]} attachments - Array of report attachments.
 *
 * @param {string} outputFolder - Relative or absolute path to the output folder. The folder will be
 *   removed if it exists and then recreated. Parent directories will be created as needed.
 *
 * @returns {Promise<FileAttachment[]>} Promise that resolves to an array of `FileAttachment` objects
 *   representing the attachments as they exist in the output folder. Each returned attachment will have:
 *   - `type: 'file'` - All returned attachments are file-based
 *   - `contentType` - Preserved from the input attachment
 *   - `id` - Preserved from the input attachment
 *   - `path` - Local file path within the `attachments/` subdirectory
 *
 * @throws {Error} Throws if unable to remove/create directories, copy files, write data, or serialize JSON.
 *
 * @example
 * ```typescript
 * const attachments = [
 *   await createFileAttachment('image/png', './screenshot.png'),
 *   await createDataAttachment('text/plain', Buffer.from('test log data'))
 * ];
 *
 * const writtenAttachments = await writeReport(report, attachments, './flakiness-report');
 * // Creates:
 * // ./flakiness-report/report.json
 * // ./flakiness-report/attachments/{hash-id-1}
 * // ./flakiness-report/attachments/{hash-id-2}
 * ```
 */
export async function writeReport(report: FlakinessReport.Report, attachments: Attachment[], outputFolder: string): Promise<FileAttachment[]> {
  outputFolder = path.resolve(outputFolder);
  // Atomic write: first, create a tmp folder
  const tmpFolder = outputFolder + '-' + randomUUIDBase62();
  const tmpReportPath = path.join(tmpFolder, 'report.json');
  const tmpAttachmentsFolder = path.join(tmpFolder, 'attachments');
  const finalAttachmentsFolder = path.join(outputFolder, 'attachments');
  await fs.promises.rm(tmpFolder, { recursive: true, force: true });
  await fs.promises.mkdir(tmpFolder, { recursive: true });
  await fs.promises.writeFile(tmpReportPath, JSON.stringify(report), 'utf-8');

  if (attachments.length)
    await fs.promises.mkdir(tmpAttachmentsFolder);

  const fileAttachments: FileAttachment[] = [];
  for (const attachment of attachments) {
    const tmpAttachmentPath = path.join(tmpAttachmentsFolder, attachment.id);
    const finalAttachmentPath = path.join(finalAttachmentsFolder, attachment.id);
    if (attachment.type === 'file')
      await fs.promises.cp(attachment.path, tmpAttachmentPath);
    else if (attachment.type === 'buffer')
      await fs.promises.writeFile(tmpAttachmentPath, attachment.body);
    fileAttachments.push({
      type: 'file',
      contentType: attachment.contentType,
      id: attachment.id,
      // This will live under `outputFolder` in the end.
      path: finalAttachmentPath,
    });
  }
  // Rename tmpFolder into outputFolder; try a few times. If last attempt still fails,
  // then finally throw an error.
  const MAX_ATTEMPTS = 10;
  let lastError: any;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; ++attempt) {
    try {
      await fs.promises.rm(outputFolder, { recursive: true, force: true });
      await fs.promises.rename(tmpFolder, outputFolder);
      return fileAttachments;
    } catch (e) {
      lastError = e;
      await new Promise(x => setTimeout(x, Math.random() * 50 + 50));
    }
  }
  // Cleanup tmpFolder
  await fs.promises.rm(tmpFolder, { recursive: true, force: true });
  throw lastError;
}
