/** Digits only (keeps a trailing X for ISBN-10). */
function clean(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase()
}

function isValidIsbn13(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false
  const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return sum % 10 === 0
}

function isValidIsbn10(digits: string): boolean {
  if (!/^\d{9}[\dX]$/.test(digits)) return false
  const sum = [...digits].reduce((acc, d, i) => acc + (d === 'X' ? 10 : Number(d)) * (10 - i), 0)
  return sum % 11 === 0
}

function isbn10To13(digits: string): string {
  const core = `978${digits.slice(0, 9)}`
  const sum = [...core].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0)
  return `${core}${(10 - (sum % 10)) % 10}`
}

/**
 * Normalizes a scanned or typed ISBN to a valid book ISBN-13 (978/979), or
 * null. Accepts hyphens and spaces, and converts valid ISBN-10s.
 */
export function normalizeIsbn(input: string): string | null {
  const digits = clean(input)
  if (digits.length === 10 && isValidIsbn10(digits)) return isbn10To13(digits)
  if (digits.length === 13 && /^97[89]/.test(digits) && isValidIsbn13(digits)) return digits
  return null
}
