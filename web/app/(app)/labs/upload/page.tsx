// Lab PDF upload. Simple single-file form.

import { Card, CardLabel } from '@/components/Card';
import { Header } from '@/components/Header';
import { uploadLabPdf } from '../actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  no_file: 'Select a PDF to upload.',
  not_pdf: 'File must be a PDF.',
  too_large: 'Max 10 MB per file.',
};

export default function UploadLabPage({ searchParams }: { searchParams: { error?: string } }) {
  const err = searchParams.error;
  return (
    <>
      <Header today={new Date()} />

      <main className="space-y-3 px-3 pb-6">
        <Card>
          <CardLabel>Upload lab report</CardLabel>
          <p className="mb-4 text-[13px] text-zinc-500">
            Drop a PDF from Quest, LabCorp, Boston Heart, or any other standard lab.
            Extraction runs automatically — you'll review the parsed values before they're stored.
          </p>
          <form action={uploadLabPdf} className="space-y-3">
            <input
              required
              type="file"
              name="file"
              accept="application/pdf"
              className="block w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-[14px] file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-[13px] file:font-medium file:text-white dark:border-zinc-800 dark:bg-zinc-900 dark:file:bg-zinc-50 dark:file:text-zinc-900"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-[14px] font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
            >
              Upload & extract
            </button>
            {err && (
              <p className="text-[13px] text-amber-600">{ERROR_MESSAGES[err] ?? err}</p>
            )}
          </form>
        </Card>

        <Card>
          <CardLabel>Privacy</CardLabel>
          <ul className="space-y-1 text-[13px] text-zinc-600 dark:text-zinc-400">
            <li>— PDFs live in a private bucket, readable only via short-lived signed URLs.</li>
            <li>— Extraction uses Anthropic's zero-retention API tier.</li>
            <li>— You can delete any draw (and its PDF) at any time.</li>
          </ul>
        </Card>
      </main>
    </>
  );
}
