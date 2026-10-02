import { computed, reactive, ref, shallowRef } from 'vue'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { supabase } from '@/lib/supabase'
import {
  defaultFilters,
  itemFiltersActive,
  searchPattern,
  searchTagFilter,
  tagArrayLiteral,
  type InventoryFilters,
  type KindFilter,
} from '@/lib/inventoryQuery'
import { buildVolumeStatus, type VolumeStatusRow } from '@/lib/volumes'
import {
  toInventoryItem,
  toInventorySet,
  type InventoryItem,
  type InventorySet,
  type ItemStatus,
} from '@/types/inventory'

const PAGE_SIZE = 30
/** PostgREST returns at most 1000 rows per request; bigger reads are fetched in chunks. */
const CHUNK = 1000
/** Statuses that count as stock on the shelf. */
const STOCK_STATUSES: readonly ItemStatus[] = ['in_stock', 'listed', 'reserved']

export interface InventorySummary {
  unitsInStock: number
  costBasisCents: number
  askingCents: number
  estProfitCents: number
}

export interface MatchCount {
  matching: number
  total: number
}

export interface ActionResult {
  ok: boolean
  message?: string
}

/** v_items filtered by the current filters. `kind` overrides the kind filter. */
function itemsQuery<Columns extends string>(
  columns: Columns,
  f: InventoryFilters,
  kind: KindFilter,
) {
  let query = supabase.from('v_items').select(columns)
  if (!f.archived) query = query.is('archived_at', null)
  if (kind === 'set') query = query.not('template_id', 'is', null)
  if (kind === 'one_off') query = query.is('template_id', null)
  if (f.set) query = query.eq('template_id', f.set)
  if (f.category) query = query.eq('category', f.category)
  if (f.status.length) query = query.in('status', f.status)
  if (f.condition) query = query.eq('condition', f.condition)
  if (f.noPhotos) query = query.is('cover_path', null)
  if (f.tag) query = query.filter('tags', 'cs', tagArrayLiteral(f.tag))
  if (f.age) {
    query = query.gte('days_in_stock', f.age.min)
    if (f.age.max !== null) query = query.lte('days_in_stock', f.age.max)
  }
  const pattern = searchPattern(f.q)
  if (pattern) {
    const tag = searchTagFilter(f.q)
    query = query.or(
      [
        ...['name', 'series', 'template_name', 'sku', 'isbn'].map((c) => `${c}.ilike.${pattern}`),
        ...(tag ? [tag] : []),
      ].join(','),
    )
  }
  return query
}

export const useInventoryStore = defineStore('inventory', () => {
  const filters = ref<InventoryFilters>({ ...defaultFilters })

  // The paged list: every item in Items view, one-offs in Sets view.
  const items = ref<InventoryItem[]>([])
  const hasMore = ref(false)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref<string | null>(null)
  const summary = ref<InventorySummary | null>(null)

  // Sets view.
  const sets = ref<InventorySet[]>([])
  const matchCounts = shallowRef(new Map<string, MatchCount>())
  const children = reactive(new Map<string, InventoryItem[]>())
  const childrenLoading = reactive(new Set<string>())
  const strips = reactive(new Map<string, VolumeStatusRow[]>())
  const expanded = reactive(new Set<string>())

  /** Every (non-archived) set, for the Set filter. */
  const setOptions = ref<{ id: string; name: string }[]>([])

  async function loadSetOptions() {
    const { data } = await supabase
      .from('item_templates')
      .select('id, name')
      .is('archived_at', null)
      .order('name')
    setOptions.value = data ?? []
  }

  /** Every tag in use on non-archived items, for the Tag filter. */
  const tagOptions = ref<string[]>([])

  async function loadTagOptions() {
    const tags = new Set<string>()
    for (let from = 0; ; from += CHUNK) {
      const { data, error: err } = await supabase
        .from('items')
        .select('tags')
        .is('archived_at', null)
        .not('tags', 'eq', '{}')
        .order('id')
        .range(from, from + CHUNK - 1)
      if (err) return
      for (const r of data ?? []) r.tags.forEach((t) => tags.add(t))
      if (!data || data.length < CHUNK) break
    }
    tagOptions.value = [...tags].sort((a, b) => a.localeCompare(b))
  }

  /** Bumped on every reload so late responses from older filters are ignored. */
  let generation = 0

  const isSetsView = computed(() => filters.value.view === 'sets')
  const filtering = computed(() => itemFiltersActive(filters.value))

  /** Kind for the paged list: in Sets view it shows the one-offs section. */
  const listKind = computed<KindFilter>(() =>
    isSetsView.value ? (filters.value.kind === 'set' ? 'set' : 'one_off') : filters.value.kind,
  )
  const showOneOffs = computed(() => !isSetsView.value || filters.value.kind !== 'set')
  const showSets = computed(() => isSetsView.value && filters.value.kind !== 'one_off')

  /** Sets visible in Sets view: with filters on, only those with matching volumes. */
  const visibleSets = computed(() =>
    filtering.value
      ? sets.value.filter((s) => (matchCounts.value.get(s.id)?.matching ?? 0) > 0)
      : sets.value,
  )

  async function fetchPage(from: number, gen: number) {
    const f = filters.value
    let query = itemsQuery('*', f, listKind.value).order(f.sort, {
      ascending: f.dir === 'asc',
      nullsFirst: false,
    })
    // Ties (e.g. 30 volumes added in the same moment) fall back to set and volume order.
    if (f.sort !== 'template_name')
      query = query.order('template_name', { ascending: true, nullsFirst: false })
    query = query.order('volume_number', { ascending: true, nullsFirst: false })
    const { data, error: err } = await query.order('id').range(from, from + PAGE_SIZE - 1)
    if (gen !== generation) return null
    if (err) throw err
    return (data ?? []).map(toInventoryItem)
  }

  /** Light rows for every match: totals for the summary strip and per-set match counts. */
  async function fetchMatchIndex(gen: number) {
    const rows: {
      template_id: string | null
      units_left: number | null
      cost_cents: number | null
      list_price_cents: number | null
      est_profit_cents: number | null
      status: ItemStatus | null
    }[] = []
    for (let from = 0; ; from += CHUNK) {
      const { data, error: err } = await itemsQuery(
        'template_id, units_left, cost_cents, list_price_cents, est_profit_cents, status',
        filters.value,
        filters.value.kind,
      )
        .order('id')
        .range(from, from + CHUNK - 1)
      if (gen !== generation) return null
      if (err) throw err
      rows.push(...(data ?? []))
      if (!data || data.length < CHUNK) break
    }
    return rows
  }

  /** Number of (non-archived) volume rows per set, ignoring filters. */
  async function fetchSetRowTotals(gen: number) {
    const totals = new Map<string, number>()
    for (let from = 0; ; from += CHUNK) {
      const { data, error: err } = await supabase
        .from('items')
        .select('template_id')
        .not('template_id', 'is', null)
        .is('archived_at', null)
        .order('id')
        .range(from, from + CHUNK - 1)
      if (gen !== generation) return null
      if (err) throw err
      for (const r of data ?? []) {
        if (r.template_id) totals.set(r.template_id, (totals.get(r.template_id) ?? 0) + 1)
      }
      if (!data || data.length < CHUNK) break
    }
    return totals
  }

  async function fetchSets(gen: number) {
    const f = filters.value
    let query = supabase.from('v_templates').select('*').is('archived_at', null)
    if (f.set) query = query.eq('id', f.set)
    if (f.category) query = query.eq('category', f.category)
    switch (f.groupSort) {
      case 'missing':
        query = query.order('missing_count', { ascending: false })
        break
      case 'completion':
        query = query.order('completion_percent', { ascending: false, nullsFirst: false })
        break
      case 'value':
        query = query.order('list_value_cents', { ascending: false })
        break
      case 'recent':
        query = query.order('last_added_at', { ascending: false, nullsFirst: false })
        break
    }
    const { data, error: err } = await query.order('name')
    if (gen !== generation) return null
    if (err) throw err
    return (data ?? []).map(toInventorySet)
  }

  /** Reloads everything for the current filters. */
  async function load() {
    const gen = ++generation
    loading.value = true
    error.value = null
    children.clear()
    childrenLoading.clear()
    // Strips can be stale after changes made elsewhere (e.g. copies added on an
    // item's page). Drop the closed ones now; open ones are refreshed below
    // so they don't flicker.
    for (const id of strips.keys()) if (!expanded.has(id)) strips.delete(id)
    try {
      const [page, index, setRows, totals] = await Promise.all([
        showOneOffs.value ? fetchPage(0, gen) : Promise.resolve([]),
        fetchMatchIndex(gen),
        showSets.value ? fetchSets(gen) : Promise.resolve([]),
        showSets.value && filtering.value ? fetchSetRowTotals(gen) : Promise.resolve(new Map()),
      ])
      if (
        gen !== generation ||
        page === null ||
        index === null ||
        setRows === null ||
        totals === null
      )
        return

      items.value = page
      hasMore.value = page.length === PAGE_SIZE
      sets.value = setRows

      const s: InventorySummary = {
        unitsInStock: 0,
        costBasisCents: 0,
        askingCents: 0,
        estProfitCents: 0,
      }
      const counts = new Map<string, MatchCount>()
      for (const r of index) {
        const left = r.units_left ?? 0
        if (left > 0 && r.status && STOCK_STATUSES.includes(r.status)) {
          s.unitsInStock += left
          s.costBasisCents += left * (r.cost_cents ?? 0)
          s.askingCents += left * (r.list_price_cents ?? 0)
          s.estProfitCents += left * (r.est_profit_cents ?? 0)
        }
        if (r.template_id) {
          const c = counts.get(r.template_id) ?? {
            matching: 0,
            total: totals.get(r.template_id) ?? 0,
          }
          c.matching += 1
          counts.set(r.template_id, c)
        }
      }
      summary.value = s
      matchCounts.value = counts

      // Open the set we were sent to, or the few sets a search narrowed down to.
      if (filters.value.expand) expanded.add(filters.value.expand)
      if (showSets.value && filters.value.q.trim()) {
        const matched = setRows.filter((x) => counts.has(x.id))
        if (matched.length <= 3) matched.forEach((x) => expanded.add(x.id))
      }
      const totalsById = new Map(setRows.map((x) => [x.id, x.total_volumes]))
      await Promise.all(
        [...expanded].flatMap((id) => [
          ensureChildren(id),
          ensureStrip(id, totalsById.get(id) ?? null, true),
        ]),
      )
    } catch (e) {
      if (gen === generation) error.value = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      if (gen === generation) loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value || loadingMore.value) return
    const gen = generation
    loadingMore.value = true
    try {
      const page = await fetchPage(items.value.length, gen)
      if (page === null) return
      items.value.push(...page)
      hasMore.value = page.length === PAGE_SIZE
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      loadingMore.value = false
    }
  }

  /** A set's volumes matching the filters, loaded the first time it's expanded. */
  async function ensureChildren(templateId: string) {
    if (children.has(templateId) || childrenLoading.has(templateId)) return
    const gen = generation
    childrenLoading.add(templateId)
    try {
      const { data, error: err } = await itemsQuery('*', filters.value, 'set')
        .eq('template_id', templateId)
        .order('volume_number')
        .range(0, CHUNK - 1)
      if (gen !== generation) return
      if (err) throw err
      children.set(templateId, (data ?? []).map(toInventoryItem))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Something went wrong.'
    } finally {
      childrenLoading.delete(templateId)
    }
  }

  /** Every volume of a set (ignoring filters) for its volume strip. */
  async function ensureStrip(templateId: string, totalVolumes: number | null, force = false) {
    if (strips.has(templateId) && !force) return
    const { data, error: err } = await supabase
      .from('v_items')
      .select('id, volume_number, status, quantity, units_left, units_sold')
      .eq('template_id', templateId)
      .is('archived_at', null)
      .order('volume_number')
    if (err) return
    strips.set(
      templateId,
      buildVolumeStatus(
        (data ?? []).map((r) => ({
          id: r.id ?? '',
          volume_number: r.volume_number ?? 0,
          status: r.status ?? 'in_stock',
          quantity: r.quantity ?? 0,
          units_left: r.units_left ?? 0,
          units_sold: r.units_sold ?? 0,
        })),
        totalVolumes,
      ),
    )
  }

  async function toggleExpanded(templateId: string) {
    if (expanded.has(templateId)) {
      expanded.delete(templateId)
      return
    }
    expanded.add(templateId)
    const set = sets.value.find((s) => s.id === templateId)
    await Promise.all([
      ensureChildren(templateId),
      ensureStrip(templateId, set?.total_volumes ?? null),
    ])
  }

  async function expandAll() {
    visibleSets.value.forEach((s) => expanded.add(s.id))
    await Promise.all(
      visibleSets.value.flatMap((s) => [ensureChildren(s.id), ensureStrip(s.id, s.total_volumes)]),
    )
  }

  function collapseAll() {
    expanded.clear()
  }

  /** Every loaded copy of an item (it can appear in the list and under its set). */
  function loadedRows(id: string): InventoryItem[] {
    const rows = items.value.filter((r) => r.id === id)
    for (const list of children.values()) rows.push(...list.filter((r) => r.id === id))
    return rows
  }

  /** Changes status right away on screen, and puts it back if the save fails. */
  async function setStatus(ids: string[], status: ItemStatus): Promise<ActionResult> {
    const rows = ids.flatMap(loadedRows)
    const previous = rows.map((r) => r.status)
    rows.forEach((r) => (r.status = status))

    const { error: err } = await supabase.from('items').update({ status }).in('id', ids)
    if (err) {
      rows.forEach((r, i) => (r.status = previous[i] ?? r.status))
      return { ok: false, message: err.message }
    }
    new Set(rows.map((r) => r.template_id).filter((t): t is string => t !== null)).forEach((t) => {
      const total = rows.find((r) => r.template_id === t)?.total_volumes ?? null
      void ensureStrip(t, total, true)
    })
    return { ok: true }
  }

  /** Archives (or with undo=true, un-archives) items, removing them from the list right away. */
  async function setArchived(ids: string[], archived: boolean): Promise<ActionResult> {
    const archivedAt = archived ? new Date().toISOString() : null
    const removed = !filters.value.archived && archived
    const snapshot = items.value.slice()
    const childSnapshot = new Map([...children].map(([k, v]) => [k, v.slice()]))
    if (removed) {
      items.value = items.value.filter((r) => !ids.includes(r.id))
      for (const [k, v] of children)
        children.set(
          k,
          v.filter((r) => !ids.includes(r.id)),
        )
    }

    const { error: err } = await supabase
      .from('items')
      .update({ archived_at: archivedAt })
      .in('id', ids)
    if (err) {
      items.value = snapshot
      childSnapshot.forEach((v, k) => children.set(k, v))
      return { ok: false, message: err.message }
    }
    return { ok: true }
  }

  /** Adds tags to items (keeping the tags they already have). */
  async function addTags(ids: string[], tags: string[]): Promise<ActionResult> {
    const { data, error: readErr } = await supabase.from('items').select('id, tags').in('id', ids)
    if (readErr) return { ok: false, message: readErr.message }
    // Items that end up with the same tag list are saved in one request.
    const groups = new Map<string, { tags: string[]; ids: string[] }>()
    for (const row of data ?? []) {
      const next = [...new Set([...row.tags, ...tags])]
      if (next.length === row.tags.length) continue
      const key = JSON.stringify(next)
      const group = groups.get(key) ?? { tags: next, ids: [] }
      group.ids.push(row.id)
      groups.set(key, group)
    }
    const results = await Promise.all(
      [...groups.values()].map((g) =>
        supabase.from('items').update({ tags: g.tags }).in('id', g.ids),
      ),
    )
    const failed = results.find((r) => r.error)?.error
    if (failed) return { ok: false, message: failed.message }
    for (const g of groups.values())
      for (const id of g.ids) loadedRows(id).forEach((r) => (r.tags = g.tags))
    void loadTagOptions()
    return { ok: true }
  }

  return {
    filters,
    items,
    hasMore,
    loading,
    loadingMore,
    error,
    summary,
    sets,
    setOptions,
    loadSetOptions,
    tagOptions,
    loadTagOptions,
    addTags,
    visibleSets,
    matchCounts,
    children,
    childrenLoading,
    strips,
    expanded,
    isSetsView,
    filtering,
    showOneOffs,
    showSets,
    load,
    loadMore,
    ensureChildren,
    ensureStrip,
    toggleExpanded,
    expandAll,
    collapseAll,
    setStatus,
    setArchived,
  }
})

// Swap in edits to this store during development instead of keeping the old one.
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useInventoryStore, import.meta.hot))
