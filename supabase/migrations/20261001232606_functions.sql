-- =============================================================================
-- Kura schema, part 2 of 3: functions.
--
-- Everything is SECURITY INVOKER, so RLS applies: only admins can use them.
-- Money splits are always exact: amounts are divided in proportion to weights,
-- rounded down, and the leftover cents go to the last share, so parts sum
-- exactly to the total.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Splits p_total cents across p_weights. Each share is floor(total * w / sum);
-- the leftover goes to the last share with a positive weight.
-- split_cents(1000, '{1,1,1}') = {333,333,334}
create function public.split_cents(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_n int := coalesce(array_length(p_weights, 1), 0);
  v_sum numeric := 0;
  v_last int := 0;
  v_out bigint[] := '{}';
  v_given bigint := 0;
  v_part bigint;
begin
  if v_n = 0 then
    return v_out;
  end if;
  for i in 1..v_n loop
    if p_weights[i] is null or p_weights[i] < 0 then
      raise exception 'Split weights must be zero or more.' using errcode = 'check_violation';
    end if;
    v_sum := v_sum + p_weights[i];
    if p_weights[i] > 0 then
      v_last := i;
    end if;
  end loop;
  if v_sum = 0 then
    raise exception 'There''s nothing to split the amount across.' using errcode = 'check_violation';
  end if;

  for i in 1..v_n loop
    if i = v_last then
      -- Everything not yet given out. Shares after this one have zero weight.
      v_part := p_total - v_given;
    elsif p_weights[i] = 0 then
      v_part := 0;
    else
      v_part := floor(p_total * p_weights[i]::numeric / v_sum);
    end if;
    v_out := v_out || v_part;
    v_given := v_given + v_part;
  end loop;
  return v_out;
end;
$$;

-- Records p_quantity copies costing p_total_cents in all. Unit costs are whole
-- cents, so when the total doesn't divide evenly some copies cost one cent more
-- (stored as a second acquisition row). The rows always sum to p_total_cents.
create function public.insert_acquisition_total(
  p_item_id uuid,
  p_quantity int,
  p_total_cents bigint,
  p_lot_id uuid,
  p_purchase_source text,
  p_purchased_at date
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_unit int;
  v_rem int;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1.' using errcode = 'check_violation';
  end if;
  if p_total_cents < 0 then
    raise exception 'Cost can''t be negative.' using errcode = 'check_violation';
  end if;

  v_unit := (p_total_cents / p_quantity)::int;
  v_rem := (p_total_cents - v_unit::bigint * p_quantity)::int;

  if p_quantity - v_rem > 0 then
    insert into public.item_acquisitions (item_id, lot_id, quantity, unit_cost_cents, purchase_source, purchased_at)
    values (p_item_id, p_lot_id, p_quantity - v_rem, v_unit, p_purchase_source, coalesce(p_purchased_at, current_date));
  end if;
  if v_rem > 0 then
    insert into public.item_acquisitions (item_id, lot_id, quantity, unit_cost_cents, purchase_source, purchased_at)
    values (p_item_id, p_lot_id, v_rem, v_unit + 1, p_purchase_source, coalesce(p_purchased_at, current_date));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Items and copies
-- -----------------------------------------------------------------------------

-- Inserts an item and its first acquisition in one transaction (the one-off form).
-- p_item: item columns (name, category, condition, list_price_cents, ...).
-- p_acquisition: { quantity (default 1), unit_cost_cents (default 0), lot_id,
--                  purchase_source, purchased_at (default today) }.
create function public.create_item(p_item jsonb, p_acquisition jsonb default '{}')
returns public.items
language plpgsql
set search_path = ''
as $$
declare
  r public.items := jsonb_populate_record(null::public.items, p_item);
  v_acq jsonb := coalesce(p_acquisition, '{}'::jsonb);
  v_item public.items;
begin
  insert into public.items (
    sku, name, name_is_custom, description, category, template_id, series, volume_number,
    isbn, condition, list_price_cents, status, storage_location, tags
  )
  values (
    r.sku, r.name, coalesce(r.name_is_custom, false), r.description, r.category, r.template_id, r.series,
    r.volume_number, r.isbn, r.condition, r.list_price_cents, coalesce(r.status, 'in_stock'),
    r.storage_location, coalesce(r.tags, '{}')
  )
  returning * into v_item;

  insert into public.item_acquisitions (item_id, lot_id, quantity, unit_cost_cents, purchase_source, purchased_at)
  values (
    v_item.id,
    (v_acq ->> 'lot_id')::uuid,
    coalesce((v_acq ->> 'quantity')::int, 1),
    coalesce((v_acq ->> 'unit_cost_cents')::int, 0),
    v_acq ->> 'purchase_source',
    coalesce((v_acq ->> 'purchased_at')::date, current_date)
  );

  select * into v_item from public.items where id = v_item.id;
  return v_item;
end;
$$;

-- Adds copies to an existing item.
create function public.add_copies(
  p_item_id uuid,
  p_quantity int,
  p_unit_cost_cents int,
  p_lot_id uuid default null,
  p_purchase_source text default null,
  p_purchased_at date default current_date
)
returns public.items
language plpgsql
set search_path = ''
as $$
declare
  v_item public.items;
begin
  insert into public.item_acquisitions (item_id, lot_id, quantity, unit_cost_cents, purchase_source, purchased_at)
  values (p_item_id, p_lot_id, p_quantity, p_unit_cost_cents, p_purchase_source, coalesce(p_purchased_at, current_date));

  select * into v_item from public.items where id = p_item_id;
  return v_item;
end;
$$;

-- Adds volumes to a set in one transaction. For each volume:
--  * an existing (non-archived) row gets a new acquisition ('merged'): quantity
--    goes up and cost re-averages; condition, asking price and status are kept
--    unless p_overrides says otherwise (a sold row comes back to in_stock);
--  * otherwise a row is created ('created') with the set's category.
-- p_cost_mode 'per_volume': p_cost_cents is the cost of each copy.
-- p_cost_mode 'split_total': p_cost_cents is the total, split evenly across copies
--   (volumes with their own cost_cents override are taken out first).
-- p_overrides: { "<volume>": { condition, cost_cents, list_price_cents, quantity, isbn } }
--   isbn only fills an empty isbn, never overwrites.
create function public.add_template_volumes(
  p_template_id uuid,
  p_volumes int[],
  p_condition public.item_condition default null,
  p_cost_mode text default 'per_volume',
  p_cost_cents int default 0,
  p_list_price_cents int default null,
  p_lot_id uuid default null,
  p_purchase_source text default null,
  p_purchased_at date default current_date,
  p_status public.item_status default 'in_stock',
  p_storage_location text default null,
  p_overrides jsonb default '{}'
)
returns table (item_id uuid, volume_number int, action text, new_quantity int)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_t public.item_templates;
  v_overrides jsonb := coalesce(p_overrides, '{}'::jsonb);
  v_vols int[];
  v_n int;
  v_ov jsonb;
  v_qty int[];
  v_own_cost int[];
  v_row_total bigint[];
  v_weights bigint[] := '{}';
  v_split bigint[];
  v_remaining bigint;
  v_item public.items;
  v_action text;
begin
  if p_cost_mode not in ('per_volume', 'split_total') then
    raise exception 'Cost mode must be per_volume or split_total.' using errcode = 'invalid_parameter_value';
  end if;
  if p_cost_cents is not null and p_cost_cents < 0 then
    raise exception 'Cost can''t be negative.' using errcode = 'check_violation';
  end if;

  select * into v_t from public.item_templates t
  where t.id = p_template_id and t.archived_at is null
  for update;
  if not found then
    raise exception 'Set not found.' using errcode = 'no_data_found';
  end if;

  select array_agg(distinct v order by v) into v_vols
  from unnest(p_volumes) as v where v is not null;
  if v_vols is null then
    raise exception 'Pick at least one volume.' using errcode = 'invalid_parameter_value';
  end if;
  v_n := array_length(v_vols, 1);
  if v_vols[1] < 1 then
    raise exception 'Volume numbers start at 1.' using errcode = 'check_violation';
  end if;
  if v_t.total_volumes is not null and v_vols[v_n] > v_t.total_volumes then
    raise exception 'Volume % is above this set''s total of % volumes.', v_vols[v_n], v_t.total_volumes
      using errcode = 'check_violation';
  end if;

  -- Copies and own costs per volume.
  v_qty := array_fill(1, array[v_n]);
  v_own_cost := array_fill(null::int, array[v_n]);
  for i in 1..v_n loop
    v_ov := v_overrides -> v_vols[i]::text;
    if v_ov is not null then
      if v_ov ? 'quantity' then
        v_qty[i] := (v_ov ->> 'quantity')::int;
        if v_qty[i] is null or v_qty[i] < 1 then
          raise exception 'Quantity for volume % must be at least 1.', v_vols[i] using errcode = 'check_violation';
        end if;
      end if;
      if v_ov ? 'cost_cents' then
        v_own_cost[i] := (v_ov ->> 'cost_cents')::int;
      end if;
    end if;
  end loop;

  -- Total cost per volume row.
  v_row_total := array_fill(0::bigint, array[v_n]);
  if p_cost_mode = 'per_volume' then
    for i in 1..v_n loop
      v_row_total[i] := v_qty[i]::bigint * coalesce(v_own_cost[i], p_cost_cents, v_t.default_cost_cents, 0);
    end loop;
  else
    v_remaining := coalesce(p_cost_cents, 0);
    for i in 1..v_n loop
      if v_own_cost[i] is not null then
        v_row_total[i] := v_qty[i]::bigint * v_own_cost[i];
        v_remaining := v_remaining - v_row_total[i];
        v_weights := v_weights || 0::bigint;
      else
        v_weights := v_weights || v_qty[i]::bigint;
      end if;
    end loop;
    if v_remaining < 0 then
      raise exception 'The per-volume costs add up to more than the total.' using errcode = 'check_violation';
    end if;
    if (select sum(w) from unnest(v_weights) as w) > 0 then
      v_split := public.split_cents(v_remaining, v_weights);
      for i in 1..v_n loop
        if v_own_cost[i] is null then
          v_row_total[i] := v_split[i];
        end if;
      end loop;
    elsif v_remaining > 0 then
      raise exception 'Every volume has its own cost, so there''s nothing left to split the total across.'
        using errcode = 'check_violation';
    end if;
  end if;

  for i in 1..v_n loop
    v_ov := coalesce(v_overrides -> v_vols[i]::text, '{}'::jsonb);

    select * into v_item from public.items it
    where it.template_id = p_template_id and it.volume_number = v_vols[i] and it.archived_at is null
    for update;

    if found then
      v_action := 'merged';
      if v_ov ?| array['condition', 'list_price_cents', 'isbn'] then
        update public.items it set
          condition = case when v_ov ? 'condition'
            then (v_ov ->> 'condition')::public.item_condition else it.condition end,
          list_price_cents = case when v_ov ? 'list_price_cents'
            then (v_ov ->> 'list_price_cents')::int else it.list_price_cents end,
          isbn = coalesce(nullif(it.isbn, ''), nullif(v_ov ->> 'isbn', ''))
        where it.id = v_item.id;
      end if;
    else
      v_action := 'created';
      insert into public.items (
        name, category, template_id, volume_number, condition, list_price_cents,
        status, storage_location, tags, isbn
      )
      values (
        null, -- rendered from the set's title pattern by items_before_write
        v_t.category, p_template_id, v_vols[i],
        coalesce((v_ov ->> 'condition')::public.item_condition, p_condition, v_t.default_condition),
        coalesce((v_ov ->> 'list_price_cents')::int, p_list_price_cents, v_t.default_list_price_cents),
        coalesce(p_status, 'in_stock'), p_storage_location, v_t.tags, nullif(v_ov ->> 'isbn', '')
      )
      returning * into v_item;
    end if;

    perform public.insert_acquisition_total(
      v_item.id, v_qty[i], v_row_total[i], p_lot_id, p_purchase_source, p_purchased_at
    );

    item_id := v_item.id;
    volume_number := v_vols[i];
    action := v_action;
    select it.quantity into new_quantity from public.items it where it.id = v_item.id;
    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Lots
-- -----------------------------------------------------------------------------

-- Rewrites unit costs on the lot's acquisitions so they sum exactly to the lot
-- total, which re-averages each affected item's cost.
-- p_mode 'even': every copy costs the same. 'by_list_price': in proportion to asking price.
-- p_dry_run: return the per-item preview without changing anything.
create function public.allocate_lot_cost(
  p_lot_id uuid,
  p_mode text default 'even',
  p_dry_run boolean default false
)
returns table (item_id uuid, item_name text, quantity int, total_cents int, unit_cost_cents int)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_total int;
  v_acq_ids uuid[];
  v_item_ids uuid[];
  v_qty int[];
  v_weights bigint[];
  v_alloc bigint[];
  v_unit int;
  v_rem int;
  v_row public.item_acquisitions;
begin
  if p_mode not in ('even', 'by_list_price') then
    raise exception 'Split mode must be even or by_list_price.' using errcode = 'invalid_parameter_value';
  end if;

  select l.total_cost_cents into v_total from public.lots l where l.id = p_lot_id for update;
  if not found then
    raise exception 'Lot not found.' using errcode = 'no_data_found';
  end if;

  select
    array_agg(a.id order by i.template_id nulls last, i.volume_number, i.name, a.created_at, a.id),
    array_agg(a.item_id order by i.template_id nulls last, i.volume_number, i.name, a.created_at, a.id),
    array_agg(a.quantity order by i.template_id nulls last, i.volume_number, i.name, a.created_at, a.id),
    array_agg(
      case when p_mode = 'even' then a.quantity::bigint
           else a.quantity::bigint * coalesce(i.list_price_cents, 0) end
      order by i.template_id nulls last, i.volume_number, i.name, a.created_at, a.id)
  into v_acq_ids, v_item_ids, v_qty, v_weights
  from public.item_acquisitions a
  join public.items i on i.id = a.item_id
  where a.lot_id = p_lot_id;

  if v_acq_ids is null then
    raise exception 'This lot has no items yet.' using errcode = 'no_data_found';
  end if;
  if p_mode = 'by_list_price' and (select sum(w) from unnest(v_weights) as w) = 0 then
    raise exception 'None of these items has an asking price yet, so split evenly instead.'
      using errcode = 'check_violation';
  end if;

  v_alloc := public.split_cents(v_total, v_weights);

  if not p_dry_run then
    for i in 1..array_length(v_acq_ids, 1) loop
      v_unit := (v_alloc[i] / v_qty[i])::int;
      v_rem := (v_alloc[i] - v_unit::bigint * v_qty[i])::int;
      if v_rem > 0 then
        -- Some copies cost one cent more: split them into their own row.
        -- Insert first so the item never briefly has fewer copies than were sold.
        select * into v_row from public.item_acquisitions a where a.id = v_acq_ids[i];
        insert into public.item_acquisitions
          (item_id, lot_id, quantity, unit_cost_cents, purchase_source, purchased_at, created_by)
        values
          (v_row.item_id, v_row.lot_id, v_rem, v_unit + 1, v_row.purchase_source, v_row.purchased_at, v_row.created_by);
        update public.item_acquisitions a
        set quantity = v_qty[i] - v_rem, unit_cost_cents = v_unit
        where a.id = v_acq_ids[i];
      else
        update public.item_acquisitions a set unit_cost_cents = v_unit where a.id = v_acq_ids[i];
      end if;
    end loop;
  end if;

  return query
    select x.item_id, it.name, sum(x.q)::int, sum(x.amount)::int, round(sum(x.amount)::numeric / sum(x.q))::int
    from unnest(v_item_ids, v_qty, v_alloc) as x(item_id, q, amount)
    join public.items it on it.id = x.item_id
    group by x.item_id, it.name, it.template_id, it.volume_number
    order by it.template_id nulls last, it.volume_number, it.name;
end;
$$;

-- -----------------------------------------------------------------------------
-- Volumes of a set
-- -----------------------------------------------------------------------------

-- Sorts, dedupes and collapses runs: {1,2,21,22,...,32} -> '1-2, 21-32'.
-- Mirrors formatVolumeRanges in src/lib/volumes.ts.
create function public.format_volume_ranges(p_volumes int[])
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(string_agg(
    case when lo = hi then lo::text else lo::text || '-' || hi::text end,
    ', ' order by lo), '')
  from (
    select min(v) as lo, max(v) as hi
    from (
      select v, v - row_number() over (order by v) as grp
      from (select distinct v from unnest(p_volumes) as v where v is not null) d
    ) g
    group by grp
  ) runs;
$$;

-- One row per volume number from 1 to the set's total (or, when the total is
-- unknown, the highest volume we've ever had).
-- state: 'owned' (copies left), 'sold', 'kept', 'written_off', or 'missing'.
create function public.template_volume_status(p_template_id uuid)
returns table (volume_number int, state text, status public.item_status, quantity int, units_left int)
language sql
stable
set search_path = ''
as $$
  with vols as (
    select i.volume_number, i.status, i.quantity,
      coalesce((select sum(s.quantity) from public.sales s where s.item_id = i.id), 0)::int as sold
    from public.items i
    where i.template_id = p_template_id and i.archived_at is null
  ),
  numbers as (
    select generate_series(1, coalesce(
      (select t.total_volumes from public.item_templates t where t.id = p_template_id),
      (select max(i.volume_number) from public.items i where i.template_id = p_template_id),
      0)) as n
  )
  select
    numbers.n,
    case
      when vols.quantity - vols.sold > 0 then 'owned'
      when vols.sold > 0 then 'sold'
      when vols.status in ('kept', 'written_off') then vols.status::text
      else 'missing'
    end,
    vols.status,
    coalesce(vols.quantity, 0),
    coalesce(vols.quantity - vols.sold, 0)
  from numbers
  left join vols on vols.volume_number = numbers.n
  order by numbers.n;
$$;

-- Sets ranked by how well their name matches q (used by the ISBN scanner, where
-- q is a book title like "One Piece, Vol. 3").
create function public.search_templates(q text)
returns table (id uuid, name text, category public.item_category, total_volumes int, score real)
language sql
stable
set search_path = ''
as $$
  select t.id, t.name, t.category, t.total_volumes,
    greatest(extensions.similarity(t.name, q), extensions.word_similarity(t.name, q)) as score
  from public.item_templates t
  where t.archived_at is null
    and coalesce(trim(q), '') <> ''
    and (
      greatest(extensions.similarity(t.name, q), extensions.word_similarity(t.name, q)) >= 0.3
      or q ilike '%' || t.name || '%'
      or t.name ilike '%' || q || '%'
    )
  order by score desc, t.name
  limit 10;
$$;

-- -----------------------------------------------------------------------------
-- Sales
-- -----------------------------------------------------------------------------

-- Records several items sold together as one bundle. One sales row per item,
-- sharing a new bundle_id; every money field is split across the rows so they
-- sum exactly to the totals. Rejects quantities above units left.
-- p_items: [{ "item_id": "...", "quantity": 1 }, ...]
-- p_alloc_mode 'even' (by copies) or 'by_list_price'.
create function public.record_bundle_sale(
  p_items jsonb,
  p_platform public.sales_platform,
  p_total_price_cents int,
  p_shipping_charged_cents int default 0,
  p_shipping_cost_cents int default 0,
  p_platform_fee_cents int default 0,
  p_sold_at timestamptz default now(),
  p_alloc_mode text default 'even',
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_bundle_id uuid := gen_random_uuid();
  v_ids uuid[];
  v_qty int[];
  v_weights bigint[];
  v_price bigint[];
  v_ship_charged bigint[];
  v_ship_cost bigint[];
  v_fee bigint[];
  v_n int;
begin
  if p_alloc_mode not in ('even', 'by_list_price') then
    raise exception 'Split mode must be even or by_list_price.' using errcode = 'invalid_parameter_value';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Pick the items in this bundle.' using errcode = 'invalid_parameter_value';
  end if;

  select
    array_agg(x.item_id order by x.ord),
    array_agg(x.qty order by x.ord),
    array_agg(case when p_alloc_mode = 'even' then x.qty::bigint
                   else x.qty::bigint * coalesce(i.list_price_cents, 0) end order by x.ord)
  into v_ids, v_qty, v_weights
  from (
    select (e.value ->> 'item_id')::uuid as item_id,
           coalesce((e.value ->> 'quantity')::int, 1) as qty,
           e.ord
    from jsonb_array_elements(p_items) with ordinality as e(value, ord)
  ) x
  left join public.items i on i.id = x.item_id;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    raise exception 'Pick the items in this bundle.' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(distinct id) from unnest(v_ids) as id) <> v_n then
    raise exception 'Each item can only appear once in a bundle.' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from unnest(v_qty) as q where q < 1) then
    raise exception 'Quantities must be at least 1.' using errcode = 'check_violation';
  end if;
  if p_alloc_mode = 'by_list_price' and (select sum(w) from unnest(v_weights) as w) = 0 then
    raise exception 'None of these items has an asking price yet, so split evenly instead.'
      using errcode = 'check_violation';
  end if;

  v_price := public.split_cents(p_total_price_cents, v_weights);
  v_ship_charged := public.split_cents(coalesce(p_shipping_charged_cents, 0), v_weights);
  v_ship_cost := public.split_cents(coalesce(p_shipping_cost_cents, 0), v_weights);
  v_fee := public.split_cents(coalesce(p_platform_fee_cents, 0), v_weights);

  for i in 1..v_n loop
    -- sales_check_units_left rejects quantities above what's left.
    insert into public.sales (
      item_id, bundle_id, quantity, sold_at, platform, sale_price_cents,
      shipping_charged_cents, shipping_cost_cents, platform_fee_cents, notes
    )
    values (
      v_ids[i], v_bundle_id, v_qty[i], coalesce(p_sold_at, now()), p_platform, v_price[i],
      v_ship_charged[i], v_ship_cost[i], v_fee[i], p_notes
    );
  end loop;

  return v_bundle_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants: signed-in users may call these (RLS limits them to admins); helpers
-- called from inside them need EXECUTE too because they run as the caller.
-- -----------------------------------------------------------------------------
revoke execute on function
  public.split_cents(bigint, bigint[]),
  public.insert_acquisition_total(uuid, int, bigint, uuid, text, date),
  public.create_item(jsonb, jsonb),
  public.add_copies(uuid, int, int, uuid, text, date),
  public.add_template_volumes(uuid, int[], public.item_condition, text, int, int, uuid, text, date, public.item_status, text, jsonb),
  public.allocate_lot_cost(uuid, text, boolean),
  public.format_volume_ranges(int[]),
  public.template_volume_status(uuid),
  public.search_templates(text),
  public.record_bundle_sale(jsonb, public.sales_platform, int, int, int, int, timestamptz, text, text)
from public, anon;

grant execute on function
  public.split_cents(bigint, bigint[]),
  public.insert_acquisition_total(uuid, int, bigint, uuid, text, date),
  public.create_item(jsonb, jsonb),
  public.add_copies(uuid, int, int, uuid, text, date),
  public.add_template_volumes(uuid, int[], public.item_condition, text, int, int, uuid, text, date, public.item_status, text, jsonb),
  public.allocate_lot_cost(uuid, text, boolean),
  public.format_volume_ranges(int[]),
  public.template_volume_status(uuid),
  public.search_templates(text),
  public.record_bundle_sale(jsonb, public.sales_platform, int, int, int, int, timestamptz, text, text)
to authenticated, service_role;
