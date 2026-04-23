/**
 * Asset fetching for format adapters — internal.
 *
 * Adapters that embed binary assets (images today; fonts, audio in the
 * future) share this helper rather than each inlining a `fetch()` call.
 * Extracted when the second adapter (EPUB) needed asset bytes — principle
 * 6 in docs/architecture/principles.md. The shape is deliberately minimal:
 * docx embeds one image at a time, EPUB collects many URLs and writes them
 * into the ZIP keyed by hash, and both paths flow through the same API.
 *
 * Internal: not in package.json exports. Reach it via adapter imports.
 *
 * Two entry points:
 *   fetchAsset(url, options)  — one URL, returns { bytes, mime, hash, ext }.
 *                               Throws on network/HTTP failure; callers that
 *                               want soft failure wrap in try/catch.
 *   fetchAssets(urls, options) — many URLs, Promise.allSettled so one
 *                                failure doesn't kill the batch. Returns
 *                                Map<url, { bytes, mime, hash, ext } | { error }>.
 */

/**
 * Fetch a single asset URL and return normalized bytes + metadata.
 *
 * @param {string} url
 * @param {Object} [options]
 * @param {typeof fetch} [options.fetch] - override for tests / node-fetch.
 * @returns {Promise<{ bytes: Uint8Array, mime: string, hash: string, ext: string }>}
 */
export async function fetchAsset(url, options = {}) {
    const fetchImpl = options.fetch || globalThis.fetch
    if (typeof fetchImpl !== 'function') {
        throw new Error(
            'fetchAsset: no fetch() available. Pass options.fetch or run in an environment that provides globalThis.fetch.',
        )
    }
    const res = await fetchImpl(url)
    if (!res.ok) {
        throw new Error(`fetchAsset: HTTP ${res.status} ${res.statusText || ''} for ${url}`.trim())
    }
    const buf = await res.arrayBuffer()
    const bytes = new Uint8Array(buf)
    const headerMime = typeof res.headers?.get === 'function'
        ? (res.headers.get('content-type') || '').split(';')[0].trim()
        : ''
    const mime = headerMime || detectMime(url, bytes)
    const ext = extForMime(mime) || extFromUrl(url) || 'bin'
    const hash = await hashContent(bytes)
    return { bytes, mime, hash, ext }
}

/**
 * Fetch many URLs at once. Deduplicates by URL. Uses Promise.allSettled
 * so a single failure doesn't abort the rest — failed entries carry an
 * `error` field instead of bytes.
 *
 * @param {Iterable<string>} urls
 * @param {Object} [options] - forwarded to fetchAsset.
 * @returns {Promise<Map<string, { bytes: Uint8Array, mime: string, hash: string, ext: string } | { error: Error }>>}
 */
export async function fetchAssets(urls, options = {}) {
    const unique = Array.from(new Set(urls))
    const results = await Promise.allSettled(
        unique.map((url) => fetchAsset(url, options)),
    )
    const out = new Map()
    unique.forEach((url, i) => {
        const r = results[i]
        if (r.status === 'fulfilled') {
            out.set(url, r.value)
        } else {
            out.set(url, { error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) })
        }
    })
    return out
}

/**
 * Detect the MIME type of a byte buffer by magic bytes. Falls back to
 * extension sniffing on the URL. Returns an empty string when neither
 * path yields an answer.
 */
export function detectMime(url, bytes) {
    if (bytes && bytes.length >= 4) {
        if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
        if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
        if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
        if (bytes[0] === 0x42 && bytes[1] === 0x4d) return 'image/bmp'
        // SVG detection: "<?xml" or "<svg" after trimming BOM/whitespace.
        const head = String.fromCharCode(...bytes.slice(0, Math.min(256, bytes.length))).trimStart()
        if (head.startsWith('<?xml') || head.startsWith('<svg')) return 'image/svg+xml'
    }
    const ext = extFromUrl(url)
    return ext ? mimeForExt(ext) : ''
}

/**
 * SHA-256 hex digest of a byte buffer. Uses SubtleCrypto when available
 * (browsers, modern Node), falls back to a short FNV-1a hash otherwise —
 * good enough for de-duplicating asset filenames inside one compile.
 */
export async function hashContent(bytes) {
    const subtle = globalThis.crypto?.subtle
    if (subtle && typeof subtle.digest === 'function') {
        const buf = await subtle.digest('SHA-256', bytes)
        return bytesToHex(new Uint8Array(buf)).slice(0, 16)
    }
    // FNV-1a fallback.
    let h = 0x811c9dc5
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i]
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
    }
    return h.toString(16).padStart(8, '0')
}

function bytesToHex(bytes) {
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
    return s
}

function extFromUrl(url) {
    if (!url) return ''
    const path = String(url).split(/[?#]/)[0]
    const m = path.match(/\.([a-zA-Z0-9]+)$/)
    return m ? m[1].toLowerCase() : ''
}

const EXT_MIME = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    webp: 'image/webp',
}

const MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
}

function mimeForExt(ext) {
    return EXT_MIME[ext] || ''
}

function extForMime(mime) {
    return MIME_EXT[mime] || ''
}
