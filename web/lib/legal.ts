import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppLocale } from '@/i18n/routing';

export type LegalDoc = 'terms' | 'privacy' | 'account-deletion' | 'child-safety';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'legal');

export async function loadLegalMarkdown(
  doc: LegalDoc,
  locale: AppLocale,
): Promise<string | null> {
  const candidates = [`${doc}.${locale}.md`, `${doc}.ko.md`];
  for (const filename of candidates) {
    try {
      return await fs.readFile(path.join(CONTENT_ROOT, filename), 'utf8');
    } catch {
      continue;
    }
  }
  return null;
}

export function isLocalizedAvailable(_doc: LegalDoc, _locale: AppLocale): boolean {
  // All legal documents (terms, privacy, account-deletion, child-safety) are
  // fully localized for every supported locale (ko/en/ja).
  return true;
}
