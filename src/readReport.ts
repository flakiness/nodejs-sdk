import { FlakinessReport } from '@flakiness/flakiness-report';
import fs from 'fs/promises';
import path from 'path';
import { FileAttachment } from './uploadReport.js';
import { visitTests } from './visitTests.js';

export async function readReport(reportFolder: string): Promise<{
  report: FlakinessReport.Report,
  attachments: FileAttachment[],
  missingAttachments: FlakinessReport.Attachment[],
}> {
  reportFolder = path.resolve(reportFolder);
  // Read all files from attachments directory.
  const text = await fs.readFile(path.join(reportFolder, 'report.json'), 'utf-8');
  const report = JSON.parse(text) as FlakinessReport.Report;
  
  const attachmentFiles = await listFilesRecursively(reportFolder);
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