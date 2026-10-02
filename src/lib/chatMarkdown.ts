import MarkdownIt, { type StateCore, type Token } from 'markdown-it'
import DOMPurify from 'dompurify'

/** A set the chat can link to by name. */
export interface LinkableSet {
  id: string
  name: string
}

type RenderEnv = { sets: readonly LinkableSet[] }

/** Our SKU format: two-letter category prefix and five digits, e.g. MG-00042. */
export const SKU_PATTERN = /(?:MG|FG|MR|CU|OT)-\d{5}/

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** One regex for SKUs and set names (longest first), not touching other letters or digits. */
function linkRegex(sets: readonly LinkableSet[]): RegExp {
  const names = sets
    .map((s) => s.name.trim())
    .filter((n) => n.length >= 3)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
  const alternatives = [SKU_PATTERN.source, ...names].join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}-])(${alternatives})(?![\\p{L}\\p{N}])`, 'giu')
}

/** Splits plain text into text and link tokens for every SKU and known set name. */
function linkText(
  state: StateCore,
  token: Token,
  re: RegExp,
  setIds: Map<string, string>,
): Token[] {
  const out: Token[] = []
  const text = token.content
  let last = 0
  const push = (content: string) => {
    if (!content) return
    const t = new state.Token('text', '', 0)
    t.content = content
    out.push(t)
  }
  for (const match of text.matchAll(re)) {
    const found = match[1] ?? ''
    const start = match.index ?? 0
    const isSku = new RegExp(`^${SKU_PATTERN.source}$`, 'i').test(found)
    const href = isSku
      ? `/sku/${encodeURIComponent(found.toUpperCase())}`
      : setIds.has(found.toLowerCase())
        ? `/templates/${setIds.get(found.toLowerCase())}`
        : null
    if (!href) continue
    push(text.slice(last, start))
    const open = new state.Token('link_open', 'a', 1)
    open.attrs = [
      ['href', href],
      ['class', 'kura-link'],
    ]
    out.push(open)
    push(found)
    out.push(new state.Token('link_close', 'a', -1))
    last = start + found.length
  }
  if (last === 0) return [token]
  push(text.slice(last))
  return out
}

const md = MarkdownIt({ html: false, linkify: true, breaks: true })

md.core.ruler.push('kura_links', (state) => {
  const sets = (state.env as RenderEnv | undefined)?.sets ?? []
  const re = linkRegex(sets)
  const setIds = new Map(sets.map((s) => [s.name.trim().toLowerCase(), s.id]))
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue
    const children: Token[] = []
    let insideLink = 0
    for (const child of block.children) {
      if (child.type === 'link_open') insideLink++
      if (child.type === 'link_close') insideLink--
      if (child.type === 'text' && insideLink === 0)
        children.push(...linkText(state, child, re, setIds))
      else children.push(child)
    }
    block.children = children
  }
})

// Wide tables scroll inside the message instead of stretching the page.
md.renderer.rules.table_open = () => '<div class="md-table"><table>'
md.renderer.rules.table_close = () => '</table></div>'

let hooked = false
function purify(html: string): string {
  if (!hooked) {
    hooked = true
    // Outside links open in a new tab; in-app links (starting with "/") stay put.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && /^https?:/i.test(node.getAttribute('href') ?? '')) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    })
  }
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] })
}

/** Markdown to safe HTML, with SKUs linked to items and set names linked to sets. */
export function renderChatMarkdown(text: string, sets: readonly LinkableSet[] = []): string {
  const env: RenderEnv = { sets }
  return purify(md.render(text, env))
}
