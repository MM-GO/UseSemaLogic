// WP23a T3/T4 - fetching one statute fragment.
//
// BGB's snapshot is 11.4 MB, and T4 asks for a determinate progress indication
// "where the Content-Length allows it". Obsidian's requestUrl buffers the whole
// body and reports nothing while it does, so the only way to count bytes as
// they arrive is the renderer's own fetch with a stream reader.
//
// The renderer is subject to CORS, so that fetch only works where the server
// answers the preflight. Every failure path here returns `undefined` rather
// than throwing: the caller falls back to requestUrl, which is what the rest of
// this plugin uses and what always works.

export type LawStreamResponse = {
  status: number
  text: string
  // Lower-cased response header names.
  headers: Record<string, string>
}

export type LawStreamProgress = (loaded: number, total: number) => void

// Set once a fetch has been refused, so a server without CORS headers is not
// asked for a preflight before every single statute.
let streamingRefused = false

export function lawStreamingRefused(): boolean {
  return streamingRefused
}

export function resetLawStreaming(): void {
  streamingRefused = false
}

function collectHeaders(headers: Headers): Record<string, string> {
  const collected: Record<string, string> = {}
  headers.forEach((value, key) => { collected[key.toLowerCase()] = value })
  return collected
}

export async function fetchLawDocumentStreaming(
  url: string,
  requestHeaders: Record<string, string>,
  onProgress: LawStreamProgress
): Promise<LawStreamResponse | undefined> {
  if (streamingRefused || typeof fetch != "function") { return undefined }
  let response: Response
  try {
    response = await fetch(url, { method: "GET", headers: requestHeaders })
  } catch (e) {
    // CORS, an unreachable host, or a platform without renderer fetch. The
    // caller cannot tell these apart from here either, and requestUrl reports
    // the real error properly.
    streamingRefused = true
    return undefined
  }
  const headers = collectHeaders(response.headers)
  // 304 carries no body; a manually conditional request gets it passed through.
  if (response.status == 304) {
    return { status: 304, text: "", headers }
  }
  const total = Number.parseInt(headers["content-length"] ?? "", 10)
  const body = response.body
  if (body == undefined || typeof body.getReader != "function") {
    // No stream to read - still a usable response, just without progress.
    try {
      return { status: response.status, text: await response.text(), headers }
    } catch (e) {
      return undefined
    }
  }
  const reader = body.getReader()
  // Streaming decode: assembling the chunks into one buffer first would hold
  // 11 MB twice for no gain.
  const decoder = new TextDecoder("utf-8")
  let text = ""
  let loaded = 0
  onProgress(0, Number.isFinite(total) ? total : 0)
  try {
    for (; ;) {
      const chunk = await reader.read()
      if (chunk.done) { break }
      const value = chunk.value
      if (value == undefined) { continue }
      loaded += value.byteLength
      text += decoder.decode(value, { stream: true })
      onProgress(loaded, Number.isFinite(total) ? total : 0)
    }
  } catch (e) {
    // A body that breaks mid-stream leaves a truncated document; the caller
    // must not render it, so this reports "no streaming" and the fallback
    // fetches the statute properly.
    try { await reader.cancel() } catch (_ignored) { /* the stream is already gone */ }
    return undefined
  }
  text += decoder.decode()
  return { status: response.status, text, headers }
}

// requestUrl lower-cases most header names but does not promise to, so every
// read of a response header goes through this.
export function lawHeaderValue(headers: Record<string, string> | undefined, name: string): string {
  if (headers == undefined) { return "" }
  const wanted = name.toLowerCase()
  const direct = headers[wanted]
  if (direct != undefined) { return direct }
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() == wanted)
  return key != undefined ? headers[key] : ""
}
