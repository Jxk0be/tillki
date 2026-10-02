/** One server-sent event: its name and its JSON-decoded data. */
export interface SseEvent {
  event: string
  data: unknown
}

/** Parses one "event: x\ndata: {...}" block. Comments and blank data are skipped. */
export function parseSseBlock(block: string): SseEvent | null {
  let event = 'message'
  const data: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
  }
  if (data.length === 0) return null
  const raw = data.join('\n')
  try {
    return { event, data: JSON.parse(raw) as unknown }
  } catch {
    return { event, data: raw }
  }
}

/**
 * Reads a text/event-stream body (from a fetch POST, which EventSource can't do)
 * and yields events as they arrive, however the chunks happen to be split.
 */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let end = buffer.search(/\r?\n\r?\n/)
      while (end !== -1) {
        const block = buffer.slice(0, end)
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '')
        const parsed = parseSseBlock(block)
        if (parsed) yield parsed
        end = buffer.search(/\r?\n\r?\n/)
      }
      if (done) break
    }
    const last = parseSseBlock(buffer)
    if (last) yield last
  } finally {
    reader.releaseLock()
  }
}
