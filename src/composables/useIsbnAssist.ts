import { supabase } from '@/lib/supabase'
import { lookupIsbn, type BookInfo } from './useBookLookup'

export interface ExistingIsbnItem {
  id: string
  name: string
  unitsLeft: number
  costCents: number
}

export interface MatchedSet {
  id: string
  name: string
  totalVolumes: number | null
}

export type IsbnAnalysis =
  /** We already have this book: never make a second row. */
  | { kind: 'existing'; isbn: string; item: ExistingIsbnItem }
  /** The book is a volume of one of our sets. */
  | { kind: 'set_match'; isbn: string; book: BookInfo; set: MatchedSet; volume: number }
  /** Found the book, no matching set. */
  | { kind: 'book'; isbn: string; book: BookInfo }
  /** Nobody knows this ISBN. */
  | { kind: 'not_found'; isbn: string }

/**
 * What to offer after a scan: an existing copy, a matching set, or the book's
 * details to prefill a one-off.
 */
export async function analyzeIsbn(isbn: string): Promise<IsbnAnalysis> {
  const { data: existing } = await supabase
    .from('v_items')
    .select('id, name, units_left, cost_cents')
    .eq('isbn', isbn)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()
  if (existing?.id) {
    return {
      kind: 'existing',
      isbn,
      item: {
        id: existing.id,
        name: existing.name ?? '',
        unitsLeft: existing.units_left ?? 0,
        costCents: existing.cost_cents ?? 0,
      },
    }
  }

  const book = await lookupIsbn(isbn)
  if (!book) return { kind: 'not_found', isbn }

  if (book.volume !== null && book.series) {
    const { data: sets } = await supabase.rpc('search_templates', { q: book.series })
    const best = sets?.[0]
    if (best && best.score >= 0.4) {
      return {
        kind: 'set_match',
        isbn,
        book,
        set: { id: best.id, name: best.name, totalVolumes: best.total_volumes },
        volume: book.volume,
      }
    }
  }
  return { kind: 'book', isbn, book }
}
