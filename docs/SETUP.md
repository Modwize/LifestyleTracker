# Backend setup

One-time setup for the personal instance. ~30 minutes end to end.

## 1. Supabase project

1. Create a Supabase project (region closest to you).
2. Copy `Settings → API` values into `.env` (see `.env.example`).
3. Install the Supabase CLI: `brew install supabase/tap/supabase`.
4. `supabase link --project-ref <ref>`
5. Apply schema:
   ```bash
   supabase db push
   ```
   This runs every file in `supabase/migrations/` in order.

## 2. Create your auth user

1. Supabase Studio → Authentication → Users → Invite User → your email.
2. Click the magic link to confirm.
3. Seed your profile:
   ```bash
   psql "$SUPABASE_DB_URL" \
     -v owner_email="'you@example.com'" \
     -f supabase/seeds/0001_user_profile.sql
   ```

## 3. Create integration credentials

### Oura (Personal Access Token)
- https://cloud.ouraring.com/personal-access-tokens → Create.
- Save as `OURA_PAT`.
- **Rotate the OAuth client secret you shared in chat** — it's no longer needed.

### Telegram bot
1. In Telegram, open **@BotFather** → `/newbot` → follow prompts. Copy the token.
2. Generate a webhook secret:
   ```bash
   openssl rand -hex 32
   ```
3. Save both to `.env` as `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET`.

### Apple Shortcut
1. Generate a secret:
   ```bash
   openssl rand -hex 32
   ```
2. Save as `APPLE_SHORTCUT_SHARED_SECRET`.

## 4. Deploy edge functions + secrets

```bash
supabase secrets set --env-file .env
supabase functions deploy ingest-oura
supabase functions deploy ingest-apple-health
supabase functions deploy telegram-webhook
supabase functions deploy notification-dispatcher
supabase functions deploy daily-rollup
supabase functions deploy weekly-review
```

## 5. Register the Telegram webhook

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<ref>.supabase.co/functions/v1/telegram-webhook" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

Then open a Telegram chat with your bot and send `/start`.

## 6. Install the iPhone Shortcut

Create a Shortcut called "LifestyleTracker Sync" with these steps:
1. **Get Health Sample** → Step Count → Today
2. **Get Health Sample** → Sleep Analysis (Asleep) → Last 24 Hours → sum minutes
3. **Get Health Sample** → Body Mass → Today → most recent (optional)
4. **Get Contents of URL**
   - URL: `https://<ref>.supabase.co/functions/v1/ingest-apple-health`
   - Method: POST
   - Headers: `X-Shortcut-Secret` = `<your secret>`
   - Request Body (JSON):
     ```json
     {
       "days": [{
         "day": "<Today ISO>",
         "steps": <steps>,
         "sleep_minutes": <minutes>,
         "weight_lbs": <lbs>
       }]
     }
     ```

Schedule it in **Shortcuts → Automation → Time of Day → 23:55 daily**.

## 7. Schedule cron jobs

Open Supabase Studio → SQL Editor → paste `supabase/cron.sql` → run.

Verify:
```sql
select jobid, jobname, schedule from cron.job order by jobname;
```

Expect: `oura-hourly`, `notifications-every-5m`, `daily-rollup-0305est`, `weekly-review-friday`.

## 8. Smoke test

In Telegram:
```
/start
/protein 35 25
/steps 4200
/nutrition mostly
/today
```

The `/today` reply should show all values you just logged.

Friday morning you'll get the weekly review as a Telegram message automatically.
