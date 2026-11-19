# Enable shared planning v2

Apply this release to a preview first. It needs four new database migrations before the new UI can load. Do not rerun 001 or delete existing tables.

1. Run `supabase/migrations/002_planning.sql` in Supabase SQL Editor, once.
2. Run `supabase/migrations/003_email_reminders.sql`, once.
3. Run `supabase/migrations/004_mailbox_notifications.sql`, once. If you already ran 002 and 003 for the preview, run only 004. This enables recipient-only unread notifications and reply notes.
4. Run `supabase/migrations/005_profile_pictures.sql`, once. If earlier migrations were already applied, run only the new ones. This creates a private image bucket and profile-picture permissions.
5. In Authentication → URL Configuration, add your production URL with `/reset-password` to the redirect allowlist. Keep the existing production root and local development entries. Add `http://localhost:5173/reset-password` for local password-reset testing. Confirmation links carrying `?invite=...` also need an allowed URL pattern, e.g. your exact production origin followed by `/**`. Use only your own origins; do not allow all Vercel projects.
6. Build and deploy the branch on Vercel, then test with your separate test accounts before merging to main.

## Daily email summaries

This is a separate sender from Supabase Auth confirmation emails. Your existing SMTP setup stays in place; the reminder worker uses Brevo’s HTTP API. It sends one opt-in daily summary per person: counts of plans today/tomorrow and unfinished tasks due/overdue. No titles, locations, partner emails, private notes or surprise details appear in emails. All-day events are counted by their entered calendar day. Tasks assigned only to the partner are excluded. A day without relevant items sends nothing.

### Configure and deploy the function

Use Supabase Dashboard → Edge Functions → create `send-reminders`, pasting `supabase/functions/send-reminders/index.ts`, or deploy with the CLI:

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy send-reminders --no-verify-jwt
```

The function uses its own `x-cron-secret` check. It rejects calls without the matching secret; disabling gateway JWT verification does not make sending public.

In Supabase → Edge Functions → Secrets, add:

| Secret                 | Value                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `BREVO_API_KEY`        | A new Brevo API key (not the SMTP key)                     |
| `BREVO_SENDER_EMAIL`   | The exact verified Brevo sender address                    |
| `APP_URL`              | Your production HTTPS origin, without a trailing slash     |
| `REMINDER_CRON_SECRET` | A randomly generated long password, at least 32 characters |

Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function automatically. Never put server secrets in Vercel’s `VITE_` variables, frontend code, screenshots or GitHub. Brevo may require authorizing its API connection separately from SMTP. Check its logs if a request is rejected.

### Schedule it

1. Enable `pg_cron` and `pg_net` in Supabase. Cron runs server-side, including when the app is closed.
2. In Supabase Vault, create secrets named `reminder_function_url` (your function’s full URL ending `/functions/v1/send-reminders`) and `reminder_cron_secret` (the same value as `REMINDER_CRON_SECRET`). Add them through the dashboard rather than committing them in SQL.
3. Run `supabase/schedule-reminders.sql` once in SQL Editor. It registers a single named job every 15 minutes. Rerunning updates that schedule.
4. Invoke the function with a POST and your `x-cron-secret` header while reminders are still disabled. It should return zero processed jobs. An unauthorized call should return 401.
5. Activate the service with `update public.reminder_service set enabled=true where id=true;` in SQL Editor. Refresh the app: Settings → Email reminders is now available. Each person must opt in themselves.
6. Test with a confirmed test account, a task due today and its reminder hour set to the current local hour. Check Brevo transactional logs and `reminder_deliveries` after the next scheduled run. No second email should be sent for that account/day.

Preferences use IANA time zones, so local delivery hour follows daylight saving. If the scheduler is late, it can send later that same day. Summaries have no exact-time guarantee on free services. The function claims up to 20 recipients per invocation; suitable for this personal app, not a bulk mailing system. Provider quotas are shared with your other Brevo email traffic.

### Delivery failures and turning it off

`reminder_deliveries` is admin/server-only. Status `sent` means Brevo accepted the request, not guaranteed inbox delivery. `failed` indicates a definite rejection; fix configuration first. `unknown` means the network or worker stopped with an uncertain outcome: check Brevo logs before manually retrying to avoid duplicate mail. Only rate-limit responses are automatically retried, at most three attempts. Turning preferences off is checked again immediately before sending, though a request already in flight cannot be recalled.

To stop all reminders: `update public.reminder_service set enabled=false where id=true;`. For individual opt-out, use app Settings. To remove the scheduler: `select cron.unschedule('our-space-reminders');`.

## Portfolio demo without personal data

Create a **second Vercel project** from this repository. Set `VITE_PORTFOLIO_DEMO=true` for its Production and Preview environments. Do not add Supabase environment variables to that project. Deploy the same frontend with framework Vite, build `npm run build`, output `dist`.

This mode opens a purpose-built public introduction with an interactive sample home. The code refuses to create a Supabase client in portfolio mode, even if database variables were accidentally present. Sample people are Alex and Sam; all edits remain in that visitor’s browser. There is no real signup or email sending. The toolbar can switch people, reset sample data, and return to the introduction.

Use the second project URL on your portfolio. Create screenshots only from that demo. Never use screenshots of real accounts, real invitation links or email dashboards. The real app remains on your existing Vercel project with `VITE_PORTFOLIO_DEMO` unset/false. The demo stores fictional surprise details locally so both sample roles can be explored; it is an interaction demo, not a claim of local data secrecy.

Suggested portfolio framing: “Our Space — a shared household planner that combines practical routines with thoughtful date invitations.” Explain the household coordination problem, the recipient/sender flows, row-level database security, and the tradeoff of a small opt-in daily digest. Do not claim user studies or performance results that have not been measured.

## What this release includes

Recipient-only mailbox, sender plans and reply status, one-time hearts, three card designs, accepted/another-time responses, password recovery/resend confirmation, invitation preservation across confirmation, recurring tasks (daily/weekly/14/30 days), bounded repeating calendar entries (up to 12), weekly meals with once-only ingredient transfer, trips with dates/budget/costs/packing/itinerary, optional email summaries and isolated portfolio demo.

A recurring task advances its existing row by one period; it does not yet keep a completion history. Repeated events are independent entries, so edit or delete each occurrence separately. Rescheduling a date clears its old reply. Ingredient edits do not change items already copied to groceries. Trip planning uses EUR and entered costs, without currency conversion or booking integrations. WhatsApp, push notifications, offline editing, avatars and automatic scheduling are not included.

## Mailbox activity update

Apply `004_mailbox_notifications.sql` before deploying the updated branch. It adds recipient-only notifications, a read timestamp and optional RSVP notes. Only the database emits invitation, heart and reply activity; clients cannot forge notifications or change their content. A separate authorized RPC sends a note to the date partner. Notes are limited to 500 characters and are never copied into reminder emails.

Unread counts appear in the header mailbox and home mailbox link. Opening a notification marks only that entry read; “Mark all as read” is explicit. Dismissing the arrival toast leaves it unread. Offline arrivals appear on the next app visit; the open app refreshes via Realtime and a 30-second polling fallback. Read notifications do not replay their arrival animation. These are in-app alerts, not background phone push notifications or individual activity emails. Existing upcoming invitations are backfilled once; historical hearts and replies are not replayed. Activity disappears when its event is deleted.

Test with your paired test accounts: create a date as A, check B’s unread badge and invitation, accept with a note as B, send a heart, then check A’s two new entries and arriving-heart animation. Send an independent note back, mark entries read, reload and confirm counts stay read. Test night mode and reduced motion. Date repetition is now opt-in via “Repeat this plan”; unticked creates exactly one event.

## Profile pictures and opened heart letters

Apply `005_profile_pictures.sql` once before testing photo uploads. It creates the private `profile-pictures` bucket with 2 MB stored-file and JPG/PNG/WebP restrictions; only owners can upload/delete in their folder, and only owners or a current space partner can read the chosen picture. The frontend requests one-hour signed URLs, refreshing them before expiry. A signed link is a temporary bearer link; do not publish it. Avatar updates use the profiles Realtime publication with the existing polling fallback.

Settings → Your profile → Choose a profile picture accepts JPG, PNG or WebP up to 5 MB. The browser center-crops to 512×512 and re-encodes before upload, removing source metadata. Removing a photo restores initials; replacing/removing attempts to clean up its previous stored file. Failed profile saves remove the newly uploaded file and preserve the previous selection. Demo uploads stay in that visitor’s browser and never touch Supabase. Uploads require no changes to Brevo, the reminder function or Vercel secrets.

The sent heart now has its own 1.6-second lifecycle independent of the button bounce, a filled icon and contrasting badge in both themes. Opening a heart notification shows a heart letter animation even if the entry is already read, with “Play it again”; entry URLs carry the notification ID as well as the event ID. Dismissing or reading notifications still does not resend a heart. Reduced-motion users see the stationary heart letter without flying particles.

“Resend confirmation” is hidden on initial login/signup screens and during password reset. It appears only after a signup awaiting confirmation or an unconfirmed-email sign-in error. Password recovery keeps its separate “Send reset link” action.
