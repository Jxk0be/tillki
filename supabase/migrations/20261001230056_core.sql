-- =============================================================================
-- Kura schema, part 1 of 3: core tables, triggers, the admin lock, RLS, storage.
-- Functions (part 2) and views/snapshots (part 3) live in later migrations.
--
-- Conventions: money is integer cents (*_cents). Every table has RLS. Access is
-- granted explicitly to `authenticated` (nothing to `anon`) because new tables
-- are no longer auto-exposed to the Data API; RLS then limits rows to admins.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.item_category as enum ('manga', 'figure', 'merch', 'custom', 'other');
create type public.item_condition as enum ('new', 'like_new', 'very_good', 'good', 'acceptable', 'for_parts');
create type public.item_status as enum ('draft', 'in_stock', 'listed', 'reserved', 'sold', 'kept', 'written_off');
create type public.sales_platform as enum ('ebay', 'mercari', 'fb_marketplace', 'shopify', 'event', 'in_person', 'other');
create type public.expense_category as enum ('supplies', 'shipping', 'platform_fees', 'event_fees', 'travel', 'software', 'other');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- "{name} Volume {n}" -> "One Piece Volume 3". {nn} is the 2-digit zero-padded number.
create function public.render_volume_title(p_pattern text, p_name text, p_volume int)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(p_pattern, '{name}', p_name), '{nn}', lpad(p_volume::text, 2, '0')), '{n}', p_volume::text);
$$;

-- =============================================================================
-- Admin allowlist and profiles
-- =============================================================================
create table public.allowed_emails (
  email extensions.citext primary key,
  display_name text,
  role text not null default 'admin' check (role in ('admin', 'none')),
  created_at timestamptz not null default now()
);
comment on table public.allowed_emails is 'The only way anyone becomes an admin. No client access at all.';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email extensions.citext,
  display_name text,
  avatar_url text,
  role text not null default 'none' check (role in ('admin', 'none')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (email);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- True when the caller has an admin profile. SECURITY DEFINER so RLS policies can
-- call it without recursing into profiles' own policies. Only reads the caller's row.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- Creates a profile for every new auth user. Role comes ONLY from allowed_emails,
-- never from user metadata (which the user can edit).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(v_meta ->> 'full_name', v_meta ->> 'name', split_part(new.email, '@', 1)),
    coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
    case
      when exists (select 1 from public.allowed_emails a where lower(a.email::text) = lower(new.email) and a.role = 'admin')
        then 'admin'
      else 'none'
    end
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Note: functions below use search_path = '', where citext's case-insensitive "="
-- isn't visible, so email comparisons use lower(...) explicitly.

-- Keep profile roles in sync when the allowlist changes.
create function public.sync_profile_roles_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    update public.profiles p set role = 'none'
    where lower(p.email::text) = lower(old.email::text)
      and not exists (
        select 1 from public.allowed_emails a
        where lower(a.email::text) = lower(p.email::text) and a.role = 'admin'
      );
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.profiles p set role = new.role where lower(p.email::text) = lower(new.email::text);
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_profile_roles_from_allowlist() from public, anon, authenticated;

create trigger allowed_emails_sync_roles after insert or update or delete on public.allowed_emails
  for each row execute function public.sync_profile_roles_from_allowlist();

-- Auth hook: reject sign-ups whose email isn't on the allowlist.
-- Enable it in the dashboard
-- (Authentication > Hooks > Before User Created > Postgres > public.hook_before_user_created).
create function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := event -> 'user' ->> 'email';
begin
  if v_email is not null
     and exists (select 1 from public.allowed_emails a where lower(a.email::text) = lower(v_email)) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This account isn''t allowed to use Kura.'
    )
  );
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- =============================================================================
-- Lots, sets (templates) and items
-- =============================================================================
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text,
  purchased_at date,
  total_cost_cents int not null check (total_cost_cents >= 0),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger lots_set_updated_at before update on public.lots
  for each row execute function public.set_updated_at();

-- A "set" in the UI, e.g. One Piece. Each volume is an items row pointing here.
create table public.item_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title_pattern text not null default '{name} Volume {n}',
  description text,
  category public.item_category not null default 'manga',
  publisher text,
  language text default 'English',
  total_volumes int check (total_volumes > 0), -- null = unknown
  is_ongoing boolean not null default false,
  default_condition public.item_condition,
  default_cost_cents int check (default_cost_cents >= 0),
  default_list_price_cents int check (default_list_price_cents >= 0),
  tags text[] not null default '{}',
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create unique index item_templates_name_unique on public.item_templates (lower(name)) where archived_at is null;
create trigger item_templates_set_updated_at before update on public.item_templates
  for each row execute function public.set_updated_at();

create table public.template_images (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.item_templates (id) on delete cascade,
  storage_path text not null,
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  unique (template_id, position) deferrable initially immediate
);

create sequence public.item_sku_seq;

create table public.items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  name_is_custom boolean not null default false,
  description text, -- null on a set volume = use the set's description
  category public.item_category not null,
  template_id uuid references public.item_templates (id) on delete restrict,
  series text,
  volume_number int,
  isbn text,
  condition public.item_condition,
  -- quantity, cost_cents and purchased_at are maintained from item_acquisitions only.
  quantity int not null default 0 check (quantity >= 0),        -- total copies ever acquired
  cost_cents int not null default 0 check (cost_cents >= 0),    -- weighted average cost per copy
  list_price_cents int check (list_price_cents >= 0),
  purchased_at date,                                            -- earliest acquisition
  status public.item_status not null default 'in_stock',
  listed_at timestamptz,
  storage_location text,
  tags text[] not null default '{}',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(), -- the "date entered"
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint items_set_volume_check check (
    template_id is null or (volume_number is not null and volume_number > 0)
  )
);
comment on column public.items.quantity is 'Total copies ever acquired, from item_acquisitions. Units left = quantity - units sold.';
comment on column public.items.cost_cents is 'Weighted average cost per copy, from item_acquisitions.';

-- One row per volume of a set: a second copy raises quantity on the same row.
create unique index items_one_row_per_volume on public.items (template_id, volume_number)
  where template_id is not null and archived_at is null;
create index items_template_id_idx on public.items (template_id);
create index items_status_idx on public.items (status);
create index items_category_idx on public.items (category);
create index items_series_lower_idx on public.items (lower(series));
create index items_created_at_idx on public.items (created_at);
create index items_isbn_idx on public.items (isbn);
create index items_name_trgm_idx on public.items using gin (name extensions.gin_trgm_ops);

-- Runs before every insert/update on items:
--  * protects quantity/cost/purchased_at (only the acquisitions sync may change them)
--  * renders set volume names from the template's title pattern
--  * assigns the SKU and first listed_at
create function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_template_name text;
  v_pattern text;
begin
  if coalesce(current_setting('kura.syncing_item', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      new.quantity := 0;
      new.cost_cents := 0;
      new.purchased_at := null;
    else
      new.quantity := old.quantity;
      new.cost_cents := old.cost_cents;
      new.purchased_at := old.purchased_at;
    end if;
  end if;

  if new.template_id is not null then
    select t.name, t.title_pattern into v_template_name, v_pattern
    from public.item_templates t where t.id = new.template_id;
    new.series := v_template_name;
    if not new.name_is_custom then
      new.name := public.render_volume_title(v_pattern, v_template_name, new.volume_number);
    end if;
  end if;

  if tg_op = 'INSERT' and new.sku is null then
    new.sku := case new.category
        when 'manga' then 'MG'
        when 'figure' then 'FG'
        when 'merch' then 'MR'
        when 'custom' then 'CU'
        else 'OT'
      end || '-' || lpad(nextval('public.item_sku_seq')::text, 5, '0');
  end if;

  if new.status = 'listed' and new.listed_at is null then
    new.listed_at := now();
  end if;

  return new;
end;
$$;

create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();

-- Renaming a set (or changing its title pattern) re-renders its volumes' names.
create function public.item_templates_after_rename()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name or new.title_pattern is distinct from old.title_pattern then
    -- items_before_write re-renders names that aren't custom.
    update public.items set series = new.name where template_id = new.id;
  end if;
  return null;
end;
$$;

create trigger item_templates_after_rename after update on public.item_templates
  for each row execute function public.item_templates_after_rename();

create table public.item_images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  storage_path text not null,
  position smallint not null check (position between 0 and 4),
  created_at timestamptz not null default now(),
  unique (item_id, position) deferrable initially immediate
);

-- Friendly error for a 6th photo (positions 0-4 already cap it at 5).
create function public.reject_sixth_image()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  if tg_table_name = 'item_images' then
    select count(*) into v_count from public.item_images where item_id = new.item_id;
  else
    select count(*) into v_count from public.template_images where template_id = new.template_id;
  end if;
  if v_count >= 5 then
    raise exception 'Up to 5 photos are allowed.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger item_images_max_five before insert on public.item_images
  for each row execute function public.reject_sixth_image();
create trigger template_images_max_five before insert on public.template_images
  for each row execute function public.reject_sixth_image();

-- =============================================================================
-- Acquisitions: every time copies come in
-- =============================================================================
create table public.item_acquisitions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  lot_id uuid references public.lots (id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_cost_cents int not null check (unit_cost_cents >= 0),
  purchase_source text,
  purchased_at date not null default current_date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index item_acquisitions_item_id_idx on public.item_acquisitions (item_id);
create index item_acquisitions_lot_id_idx on public.item_acquisitions (lot_id);

-- =============================================================================
-- Sales and expenses
-- =============================================================================
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  bundle_id uuid, -- shared by every row of a bundle sale
  quantity int not null default 1 check (quantity > 0),
  sold_at timestamptz not null default now(),
  platform public.sales_platform not null,
  sale_price_cents int not null check (sale_price_cents >= 0),
  shipping_charged_cents int not null default 0 check (shipping_charged_cents >= 0),
  shipping_cost_cents int not null default 0 check (shipping_cost_cents >= 0),
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  other_cost_cents int not null default 0 check (other_cost_cents >= 0),
  notes text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sales_item_id_idx on public.sales (item_id);
create index sales_bundle_id_idx on public.sales (bundle_id) where bundle_id is not null;
create index sales_sold_at_idx on public.sales (sold_at);
create trigger sales_set_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  incurred_at date not null default current_date,
  category public.expense_category not null,
  amount_cents int not null check (amount_cents > 0),
  vendor text,
  note text,
  receipt_path text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_incurred_at_idx on public.expenses (incurred_at);
create trigger expenses_set_updated_at before update on public.expenses
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Item history
-- =============================================================================
create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  event_type text not null check (
    event_type in ('created', 'status_changed', 'price_changed', 'cost_changed', 'copies_added')
  ),
  old_value jsonb,
  new_value jsonb,
  actor uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index item_events_item_id_created_at_idx on public.item_events (item_id, created_at);

create function public.items_log_events()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.item_events (item_id, event_type, new_value)
    values (new.id, 'created', jsonb_build_object(
      'name', new.name, 'status', new.status, 'list_price_cents', new.list_price_cents));
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.item_events (item_id, event_type, old_value, new_value)
    values (new.id, 'status_changed',
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status));
  end if;
  if new.list_price_cents is distinct from old.list_price_cents then
    insert into public.item_events (item_id, event_type, old_value, new_value)
    values (new.id, 'price_changed',
      jsonb_build_object('list_price_cents', old.list_price_cents),
      jsonb_build_object('list_price_cents', new.list_price_cents));
  end if;
  -- Skip the cost "change" from the very first acquisition (0 -> real cost).
  if new.cost_cents is distinct from old.cost_cents and old.quantity > 0 then
    insert into public.item_events (item_id, event_type, old_value, new_value)
    values (new.id, 'cost_changed',
      jsonb_build_object('cost_cents', old.cost_cents), jsonb_build_object('cost_cents', new.cost_cents));
  end if;
  return null;
end;
$$;

create trigger items_log_events after insert or update on public.items
  for each row execute function public.items_log_events();

-- =============================================================================
-- Keeping items in sync with acquisitions and sales
-- =============================================================================

-- Recomputes quantity, average cost and first purchase date from acquisitions,
-- and brings a sold-out item back to in_stock when new copies arrive.
create function public.sync_item_from_acquisitions(p_item_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_qty int;
  v_cost int;
  v_first date;
  v_sold int;
begin
  select coalesce(sum(a.quantity), 0)::int,
         coalesce(round(sum(a.quantity::numeric * a.unit_cost_cents) / nullif(sum(a.quantity), 0)), 0)::int,
         min(a.purchased_at)
    into v_qty, v_cost, v_first
  from public.item_acquisitions a
  where a.item_id = p_item_id;

  select coalesce(sum(s.quantity), 0)::int into v_sold
  from public.sales s where s.item_id = p_item_id;

  if v_qty < v_sold then
    raise exception 'Can''t remove copies that were already sold (% sold, % would remain).', v_sold, v_qty
      using errcode = 'check_violation';
  end if;

  perform set_config('kura.syncing_item', 'on', true);
  update public.items i
  set quantity = v_qty,
      cost_cents = v_cost,
      purchased_at = v_first,
      status = case
        when i.status = 'sold' and v_qty > v_sold then 'in_stock'::public.item_status
        when i.status <> 'sold' and v_qty > 0 and v_sold >= v_qty then 'sold'::public.item_status
        else i.status
      end
  where i.id = p_item_id;
  perform set_config('kura.syncing_item', 'off', true);
end;
$$;

create function public.item_acquisitions_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_before int;
  v_after int;
begin
  if tg_op = 'INSERT' then
    select quantity into v_before from public.items where id = new.item_id;
  end if;

  if tg_op <> 'INSERT' then
    perform public.sync_item_from_acquisitions(old.item_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.item_id is distinct from old.item_id) then
    perform public.sync_item_from_acquisitions(new.item_id);
  end if;

  if tg_op = 'INSERT' then
    select quantity into v_after from public.items where id = new.item_id;
    insert into public.item_events (item_id, event_type, old_value, new_value)
    values (new.item_id, 'copies_added',
      jsonb_build_object('quantity', v_before),
      jsonb_build_object('quantity', v_after, 'added', new.quantity,
        'unit_cost_cents', new.unit_cost_cents, 'lot_id', new.lot_id));
  end if;
  return null;
end;
$$;

create trigger item_acquisitions_after_change after insert or update or delete on public.item_acquisitions
  for each row execute function public.item_acquisitions_after_change();

-- Rejects a sale for more units than are left. Locks the item row so two
-- simultaneous sales can't both take the last copy.
create function public.sales_check_units_left()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_qty int;
  v_sold int;
begin
  select i.quantity into v_qty from public.items i where i.id = new.item_id for update;
  if not found then
    raise exception 'Item not found.' using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(s.quantity), 0)::int into v_sold
  from public.sales s where s.item_id = new.item_id and s.id <> new.id;

  if new.quantity > v_qty - v_sold then
    raise exception 'Only % left of this item.', greatest(v_qty - v_sold, 0)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger sales_check_units_left before insert or update of item_id, quantity on public.sales
  for each row execute function public.sales_check_units_left();

-- Sold out -> 'sold'. A deleted sale that leaves stock -> back to 'listed' (if it
-- was ever listed) or 'in_stock'.
create function public.sync_item_sale_status(p_item_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_sold int;
begin
  select coalesce(sum(s.quantity), 0)::int into v_sold from public.sales s where s.item_id = p_item_id;

  update public.items i
  set status = case
      when i.quantity > 0 and v_sold >= i.quantity then 'sold'::public.item_status
      when i.listed_at is not null then 'listed'::public.item_status
      else 'in_stock'::public.item_status
    end
  where i.id = p_item_id
    and (
      (i.status <> 'sold' and i.quantity > 0 and v_sold >= i.quantity)
      or (i.status = 'sold' and v_sold < i.quantity)
    );
end;
$$;

create function public.sales_after_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.sync_item_sale_status(old.item_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.item_id is distinct from old.item_id) then
    perform public.sync_item_sale_status(new.item_id);
  end if;
  return null;
end;
$$;

create trigger sales_after_change after insert or update or delete on public.sales
  for each row execute function public.sales_after_change();

-- =============================================================================
-- Chat, settings, AI usage
-- =============================================================================
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_user_id_updated_at_idx on public.chat_threads (user_id, updated_at desc);
create trigger chat_threads_set_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  tool_calls jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_id_created_at_idx on public.chat_messages (thread_id, created_at);

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value) values
  ('fee_rules', jsonb_build_object(
    'note', 'Editable defaults. Check each platform''s current fees and update these in Settings.',
    'platforms', jsonb_build_object(
      'ebay',           jsonb_build_object('percent', 13.6, 'fixed_cents', 40),
      'mercari',        jsonb_build_object('percent', 10,   'fixed_cents', 50),
      'fb_marketplace', jsonb_build_object('percent', 10,   'fixed_cents', 0),
      'shopify',        jsonb_build_object('percent', 0,    'fixed_cents', 0),
      'event',          jsonb_build_object('percent', 0,    'fixed_cents', 0),
      'in_person',      jsonb_build_object('percent', 0,    'fixed_cents', 0),
      'other',          jsonb_build_object('percent', 0,    'fixed_cents', 0)
    )
  )),
  ('default_fee_percent', '13'),
  ('stale_days', '60'),
  ('target_margin_percent', '40'),
  ('last_export_at', 'null');

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  function_name text not null,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);
create index ai_usage_created_at_idx on public.ai_usage (created_at);

-- =============================================================================
-- Grants (explicit, since new tables aren't auto-exposed) and RLS
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on
  public.lots, public.item_templates, public.template_images, public.items,
  public.item_acquisitions, public.item_images, public.sales, public.expenses,
  public.item_events, public.chat_threads, public.chat_messages, public.app_settings
  to authenticated;
grant select on public.profiles, public.ai_usage to authenticated;
revoke all on public.allowed_emails from authenticated;
grant usage on sequence public.item_sku_seq to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Helpers called from triggers run as the caller, so the caller needs EXECUTE.
grant execute on function
  public.render_volume_title(text, text, int),
  public.sync_item_from_acquisitions(uuid),
  public.sync_item_sale_status(uuid)
  to authenticated, service_role;
revoke execute on function
  public.render_volume_title(text, text, int),
  public.sync_item_from_acquisitions(uuid),
  public.sync_item_sale_status(uuid)
  from public, anon;

alter table public.allowed_emails enable row level security;
alter table public.profiles enable row level security;
alter table public.lots enable row level security;
alter table public.item_templates enable row level security;
alter table public.template_images enable row level security;
alter table public.items enable row level security;
alter table public.item_acquisitions enable row level security;
alter table public.item_images enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.item_events enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.app_settings enable row level security;
alter table public.ai_usage enable row level security;

-- allowed_emails: RLS on with no policies = no client access at all.

-- profiles: read your own row; admins read everyone. No client writes (role can't be changed).
create policy "read own profile, admins read all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

-- Business tables: admins only, for everything.
create policy "admins full access" on public.lots
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.item_templates
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.template_images
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.items
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.item_acquisitions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.item_images
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.sales
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.expenses
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.item_events
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins full access" on public.app_settings
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Chat: admin AND owner of the thread.
create policy "admins own threads" on public.chat_threads
  for all to authenticated
  using ((select public.is_admin()) and user_id = (select auth.uid()))
  with check ((select public.is_admin()) and user_id = (select auth.uid()));
create policy "admins own thread messages" on public.chat_messages
  for all to authenticated
  using (
    (select public.is_admin())
    and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid()))
  )
  with check (
    (select public.is_admin())
    and exists (select 1 from public.chat_threads t where t.id = thread_id and t.user_id = (select auth.uid()))
  );

-- AI usage: admins read only (written server-side by Edge Functions).
create policy "admins read ai usage" on public.ai_usage
  for select to authenticated using ((select public.is_admin()));

-- =============================================================================
-- Storage: private buckets, admins only
--   item-images/items/{item_id}/{uuid}.webp
--   item-images/templates/{template_id}/{uuid}.webp
--   receipts/{expense_id}/{uuid}.webp
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('item-images', 'item-images', false, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('receipts', 'receipts', false, 10485760, array['image/webp', 'image/jpeg', 'image/png', 'application/pdf']);

create policy "admins read kura files" on storage.objects
  for select to authenticated
  using (bucket_id in ('item-images', 'receipts') and (select public.is_admin()));
create policy "admins upload kura files" on storage.objects
  for insert to authenticated
  with check (
    (select public.is_admin())
    and (
      (bucket_id = 'item-images' and (storage.foldername(name))[1] in ('items', 'templates'))
      or bucket_id = 'receipts'
    )
  );
create policy "admins update kura files" on storage.objects
  for update to authenticated
  using (bucket_id in ('item-images', 'receipts') and (select public.is_admin()))
  with check (bucket_id in ('item-images', 'receipts') and (select public.is_admin()));
create policy "admins delete kura files" on storage.objects
  for delete to authenticated
  using (bucket_id in ('item-images', 'receipts') and (select public.is_admin()));
