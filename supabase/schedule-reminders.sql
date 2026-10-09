-- Run after deploying send-reminders and creating both Vault entries.
-- Enable pg_cron and pg_net in the Supabase dashboard first.
select cron.schedule(
 'our-space-reminders',
 '*/15 * * * *',
 $$select net.http_post(
   url := (select decrypted_secret from vault.decrypted_secrets where name='reminder_function_url'),
   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
     (select decrypted_secret from vault.decrypted_secrets where name='reminder_cron_secret')),
   body := '{}'::jsonb,
   timeout_milliseconds := 10000
 );$$
);
