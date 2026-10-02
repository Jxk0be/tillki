-- Admin allowlist: the only two accounts that become admins when they sign in with Google.
-- Safe to run more than once.
insert into public.allowed_emails (email, display_name, role) values
  ('jakeshoffner27@gmail.com', 'Jake', 'admin'),
  ('kat.prouty@gmail.com', 'Kat', 'admin')
on conflict (email) do update set display_name = excluded.display_name, role = excluded.role;
