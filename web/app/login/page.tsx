// Magic-link login. Single field, single submit.

import { sendMagicLink } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  const sent = searchParams.sent === '1';
  return (
    <main className="flex min-h-screen flex-col items-stretch justify-center px-6">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tightish">Healthwize</h1>
        <p className="mb-8 text-sm text-zinc-500">Sign in to continue.</p>

        {sent ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
            Check your inbox. The magic link will sign you in.
          </p>
        ) : (
          <form action={sendMagicLink} className="space-y-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
              Email
            </label>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-[15px] font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Send magic link
            </button>
            {searchParams.error && (
              <p className="text-sm text-zinc-500">{searchParams.error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
