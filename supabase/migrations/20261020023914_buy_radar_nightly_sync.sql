-- =============================================================================
-- Buy Radar, phase 2: run anilist-sync every night.
--
-- pg_cron calls the Edge Function with pg_net. The call carries a random token
-- that is generated here and kept in Vault, and the function checks it with
-- radar_cron_token_ok(). Nobody ever sees or copies the token.
-- =============================================================================

create extension if not exists pg_net;

-- 64 random hex characters, stored encrypted in Vault.
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'radar_cron_token',
  'Sent by pg_cron to the Buy Radar Edge Functions; checked by radar_cron_token_ok().'
);

-- True when the token matches the one in Vault. Only the service role (the Edge
-- Functions) may call it.
create function public.radar_cron_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'radar_cron_token' and decrypted_secret = p_token
  );
$$;
revoke execute on function public.radar_cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.radar_cron_token_ok(text) to service_role;

-- Posts to a radar Edge Function with the cron token. Returns pg_net's request id.
create function public.radar_call_function(p_name text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://btqazxppnppmhenwmhmu.supabase.co/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-radar-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'radar_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$;
revoke execute on function public.radar_call_function(text) from public, anon, authenticated;

-- 07:10 UTC is 3:10am in New York during daylight time and 2:10am in winter.
select cron.schedule(
  'radar-nightly-anilist-sync',
  '10 7 * * *',
  $$select public.radar_call_function('anilist-sync')$$
);
