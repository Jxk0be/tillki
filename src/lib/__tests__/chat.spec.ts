import { describe, expect, it } from 'vitest'
import { renderChatMarkdown } from '../chatMarkdown'
import { parseSseBlock, readSse, type SseEvent } from '../sse'

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c))
      controller.close()
    },
  })
}

async function collect(chunks: string[]): Promise<SseEvent[]> {
  const out: SseEvent[] = []
  for await (const e of readSse(streamOf(chunks))) out.push(e)
  return out
}

describe('readSse', () => {
  it('parses events split across chunks at awkward places', async () => {
    const events = await collect([
      'event: tool\ndata: {"name":"get_sets","label":"Checking sets"}\n\nevent: del',
      'ta\ndata: {"text":"Hel"}\n',
      '\nevent: delta\r\ndata: {"text":"lo"}\r\n\r\n',
      'event: done\ndata: {"threadId":"t1"}',
    ])
    expect(events).toEqual([
      { event: 'tool', data: { name: 'get_sets', label: 'Checking sets' } },
      { event: 'delta', data: { text: 'Hel' } },
      { event: 'delta', data: { text: 'lo' } },
      { event: 'done', data: { threadId: 't1' } },
    ])
  })

  it('keeps multi-byte characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('event: delta\ndata: {"text":"Jan 1 – Oct 1"}\n\n')
    const cut = bytes.indexOf(0xe2) + 1 // in the middle of the en dash
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    const out: SseEvent[] = []
    for await (const e of readSse(stream)) out.push(e)
    expect(out).toEqual([{ event: 'delta', data: { text: 'Jan 1 – Oct 1' } }])
  })

  it('ignores comments and keeps non-JSON data as text', () => {
    expect(parseSseBlock(': keep-alive')).toBeNull()
    expect(parseSseBlock('data: hello')).toEqual({ event: 'message', data: 'hello' })
  })
})

describe('renderChatMarkdown', () => {
  const sets = [
    { id: 'set-1', name: 'One Piece' },
    { id: 'set-2', name: 'Shaman King' },
  ]

  it('links SKUs to items and set names to sets', () => {
    const html = renderChatMarkdown('Sell **MG-00042** and the rest of shaman king.', sets)
    expect(html).toContain('<a href="/sku/MG-00042" class="kura-link">MG-00042</a>')
    expect(html).toContain('<a href="/templates/set-2" class="kura-link">shaman king</a>')
  })

  it("doesn't link inside words, other links, or code", () => {
    const html = renderChatMarkdown(
      'XMG-00042, [One Piece](https://example.com) and `MG-00001`',
      sets,
    )
    expect(html).not.toContain('/sku/')
    expect(html).not.toContain('/templates/')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('strips HTML and scripts', () => {
    const html = renderChatMarkdown('<img src=x onerror=alert(1)> <script>alert(1)</script> hi')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('hi')
    const link = renderChatMarkdown('[click](javascript:alert(1))')
    expect(link).not.toMatch(/href="javascript/i)
  })

  it('wraps tables so they scroll inside the bubble', () => {
    const html = renderChatMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')
    expect(html).toMatch(/^<div class="md-table"><table>/)
  })
})
