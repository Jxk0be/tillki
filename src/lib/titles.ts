export interface ParsedTitle {
  /** The series name without the volume part, e.g. "One Piece". */
  series: string
  /** The volume number, when the title has one. */
  volume: number | null
}

/**
 * Pulls the series and volume number out of a book title as it comes back from
 * Google Books or Open Library:
 *   "One Piece, Vol. 3: Don't Get Fooled Again" -> One Piece, 3
 *   "Naruto, Volume 7"                          -> Naruto, 7
 *   "Chainsaw Man, 3"                           -> Chainsaw Man, 3
 *   "Death Note 5" / "Death Note #5"            -> Death Note, 5
 */
export function parseVolumeFromTitle(title: string): ParsedTitle {
  const text = title.replace(/\s+/g, ' ').trim()

  const patterns = [
    // "..., Vol. 3", "... Volume 3", "... Vol 3", "... v. 3", "... #3"
    /^(.*?)[\s,:;([-]*\b(?:vol(?:ume)?\.?|v\.)\s*(\d{1,4})\b/i,
    /^(.*?)[\s,:;-]*#\s*(\d{1,4})\b/,
    // "Chainsaw Man, 3" (a comma then a bare number)
    /^(.*?),\s*(\d{1,4})\b(?!\.\d)/,
    // "Death Note 5" (trailing number, optionally followed by a subtitle)
    /^(.*?\D)\s(\d{1,3})(?:\s*[:(-].*)?$/,
  ]

  for (const pattern of patterns) {
    const match = pattern.exec(text)
    const series = match?.[1]?.replace(/[\s,:;([-]+$/, '').trim()
    if (match && series) return { series, volume: Number(match[2]) }
  }

  return { series: text.replace(/\s*[:(].*$/, '').trim() || text, volume: null }
}
