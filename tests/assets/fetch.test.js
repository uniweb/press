import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetchAsset, fetchAssets, detectMime, hashContent } from '../../src/assets/fetch.js'

// A 1x1 transparent PNG — same bytes used by the docx tests.
const PNG_BYTES = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x62, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
])

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
const BMP_BYTES = new Uint8Array([0x42, 0x4d, 0, 0, 0, 0])

function makeFetch(responses) {
    return async (url) => {
        const entry = responses[url]
        if (!entry) {
            return {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: { get: () => '' },
                arrayBuffer: async () => new ArrayBuffer(0),
            }
        }
        if (entry.throw) throw entry.throw
        const headerMap = new Map(Object.entries(entry.headers || {}))
        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: { get: (k) => headerMap.get(k.toLowerCase()) || headerMap.get(k) || '' },
            arrayBuffer: async () => entry.bytes.buffer.slice(entry.bytes.byteOffset, entry.bytes.byteOffset + entry.bytes.byteLength),
        }
    }
}

describe('fetchAsset', () => {
    it('returns bytes, mime, hash, and ext for a PNG URL', async () => {
        const fetchImpl = makeFetch({
            'https://example.com/a.png': { bytes: PNG_BYTES, headers: { 'content-type': 'image/png' } },
        })
        const result = await fetchAsset('https://example.com/a.png', { fetch: fetchImpl })
        expect(result.bytes).toBeInstanceOf(Uint8Array)
        expect(result.bytes.length).toBe(PNG_BYTES.length)
        expect(result.mime).toBe('image/png')
        expect(result.ext).toBe('png')
        expect(result.hash).toMatch(/^[0-9a-f]+$/)
        expect(result.hash.length).toBeGreaterThanOrEqual(8)
    })

    it('falls back to magic-byte detection when Content-Type is missing', async () => {
        const fetchImpl = makeFetch({
            'https://example.com/mystery': { bytes: JPEG_BYTES },
        })
        const result = await fetchAsset('https://example.com/mystery', { fetch: fetchImpl })
        expect(result.mime).toBe('image/jpeg')
        expect(result.ext).toBe('jpg')
    })

    it('throws on non-OK HTTP status', async () => {
        const fetchImpl = makeFetch({})
        await expect(fetchAsset('https://example.com/missing.png', { fetch: fetchImpl })).rejects.toThrow(/404/)
    })

    it('produces a stable hash for the same input bytes', async () => {
        const fetchImpl = makeFetch({
            'https://example.com/a.png': { bytes: PNG_BYTES, headers: { 'content-type': 'image/png' } },
            'https://example.com/b.png': { bytes: PNG_BYTES, headers: { 'content-type': 'image/png' } },
        })
        const a = await fetchAsset('https://example.com/a.png', { fetch: fetchImpl })
        const b = await fetchAsset('https://example.com/b.png', { fetch: fetchImpl })
        expect(a.hash).toBe(b.hash)
    })
})

describe('fetchAssets', () => {
    it('deduplicates URLs and preserves per-URL results', async () => {
        const fetchImpl = makeFetch({
            'https://example.com/a.png': { bytes: PNG_BYTES, headers: { 'content-type': 'image/png' } },
            'https://example.com/b.jpg': { bytes: JPEG_BYTES, headers: { 'content-type': 'image/jpeg' } },
        })
        const result = await fetchAssets(
            ['https://example.com/a.png', 'https://example.com/b.jpg', 'https://example.com/a.png'],
            { fetch: fetchImpl },
        )
        expect(result.size).toBe(2)
        expect(result.get('https://example.com/a.png').mime).toBe('image/png')
        expect(result.get('https://example.com/b.jpg').mime).toBe('image/jpeg')
    })

    it('records per-URL errors without aborting the batch', async () => {
        const fetchImpl = makeFetch({
            'https://example.com/a.png': { bytes: PNG_BYTES, headers: { 'content-type': 'image/png' } },
            // missing.png → 404
        })
        const result = await fetchAssets(
            ['https://example.com/a.png', 'https://example.com/missing.png'],
            { fetch: fetchImpl },
        )
        expect(result.get('https://example.com/a.png').bytes).toBeInstanceOf(Uint8Array)
        expect(result.get('https://example.com/missing.png').error).toBeInstanceOf(Error)
    })
})

describe('detectMime', () => {
    it('recognises PNG / JPEG / GIF / BMP magic bytes', () => {
        expect(detectMime('', PNG_BYTES)).toBe('image/png')
        expect(detectMime('', JPEG_BYTES)).toBe('image/jpeg')
        expect(detectMime('', GIF_BYTES)).toBe('image/gif')
        expect(detectMime('', BMP_BYTES)).toBe('image/bmp')
    })

    it('recognises SVG from leading markup', () => {
        const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
        expect(detectMime('', svg)).toBe('image/svg+xml')
    })

    it('falls back to extension when bytes are inconclusive', () => {
        const noise = new Uint8Array([0, 0, 0, 0])
        expect(detectMime('https://example.com/a.webp', noise)).toBe('image/webp')
    })

    it('returns empty string when neither bytes nor extension help', () => {
        expect(detectMime('no-ext', new Uint8Array([0, 0, 0]))).toBe('')
    })
})

describe('hashContent', () => {
    it('produces a hex string', async () => {
        const h = await hashContent(PNG_BYTES)
        expect(h).toMatch(/^[0-9a-f]+$/)
        expect(h.length).toBeGreaterThanOrEqual(8)
    })

    it('is deterministic', async () => {
        const a = await hashContent(PNG_BYTES)
        const b = await hashContent(PNG_BYTES)
        expect(a).toBe(b)
    })

    it('differs for different bytes', async () => {
        const a = await hashContent(PNG_BYTES)
        const b = await hashContent(JPEG_BYTES)
        expect(a).not.toBe(b)
    })
})
