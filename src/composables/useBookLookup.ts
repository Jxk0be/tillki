import { parseVolumeFromTitle } from '@/lib/titles'

export interface BookInfo {
  /** Full title as listed, e.g. "One Piece, Vol. 3". */
  title: string
  series: string
  volume: number | null
  description: string | null
  publisher: string | null
  source: 'Google Books' | 'Open Library'
}

interface GoogleBooksResponse {
  items?: {
    volumeInfo?: {
      title?: string
      subtitle?: string
      description?: string
      publisher?: string
    }
  }[]
}

type OpenLibraryResponse = Record<
  string,
  {
    title?: string
    subtitle?: string
    publishers?: { name?: string }[]
    notes?: string | { value?: string }
  }
>

function fromTitle(title: string, subtitle?: string) {
  // Google often puts "Vol. 3" in the subtitle; try the title first, then both.
  const first = parseVolumeFromTitle(title)
  if (first.volume !== null || !subtitle) return { full: title, ...first }
  const combined = `${title}, ${subtitle}`
  return { full: combined, ...parseVolumeFromTitle(combined) }
}

async function googleBooks(isbn: string, signal: AbortSignal): Promise<BookInfo | null> {
  // Without a key, Google Books shares a small daily quota across everyone and
  // often answers 429; Open Library is the fallback either way.
  const key = import.meta.env.VITE_GOOGLE_BOOKS_API_KEY
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}${key ? `&key=${encodeURIComponent(key)}` : ''}`
  const res = await fetch(url, { signal })
  if (!res.ok) return null
  const info = ((await res.json()) as GoogleBooksResponse).items?.[0]?.volumeInfo
  if (!info?.title) return null
  const parsed = fromTitle(info.title, info.subtitle)
  return {
    title: parsed.full,
    series: parsed.series,
    volume: parsed.volume,
    description: info.description ?? null,
    publisher: info.publisher ?? null,
    source: 'Google Books',
  }
}

async function openLibrary(isbn: string, signal: AbortSignal): Promise<BookInfo | null> {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`,
    { signal },
  )
  if (!res.ok) return null
  const book = ((await res.json()) as OpenLibraryResponse)[`ISBN:${isbn}`]
  if (!book?.title) return null
  const parsed = fromTitle(book.title, book.subtitle)
  const notes = typeof book.notes === 'string' ? book.notes : (book.notes?.value ?? null)
  return {
    title: parsed.full,
    series: parsed.series,
    volume: parsed.volume,
    description: notes,
    publisher: book.publishers?.[0]?.name ?? null,
    source: 'Open Library',
  }
}

/** Looks a book up by ISBN-13: Google Books first, then Open Library. Null if neither knows it. */
export async function lookupIsbn(isbn: string): Promise<BookInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    try {
      const google = await googleBooks(isbn, controller.signal)
      if (google) return google
    } catch {
      // fall through to Open Library
    }
    try {
      return await openLibrary(isbn, controller.signal)
    } catch {
      return null
    }
  } finally {
    clearTimeout(timer)
  }
}
