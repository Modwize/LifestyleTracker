# Healthwize web (PWA)

Next.js 14 + Supabase SSR. Mobile-first. Installable on iOS via Safari →
"Add to Home Screen" — full-screen app icon, no App Store.

## Local dev

```bash
cd web
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL + ANON_KEY
npm install
npm run dev                  # http://localhost:3000
```

Sign in via magic link → land on Today.

## Deploy

```bash
# from web/
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_SITE_URL          # https://<your-project>.vercel.app
vercel --prod
```

In Supabase → Authentication → URL Configuration:
- Site URL: `https://<your-project>.vercel.app`
- Redirect URLs: `https://<your-project>.vercel.app/auth/callback`

## Design constraints

- No emojis in the UI
- Single accent color (emerald) used only for "on track" states
- System dark mode (no toggle)
- One screen does one job; quick-adds happen in Telegram

## Routes

- `/login` — magic link
- `/` — Today (score, actions, week adherence, alerts)

Coming next: `/week`, `/log`, `/timeline`.
