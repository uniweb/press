/**
 * EPUB adapter — structural tests.
 *
 * Asserts the three envelope invariants (see src/adapters/epub.js header):
 *   1. `mimetype` is the first entry and stored uncompressed (method 0)
 *   2. Manifest ↔ spine consistency (every spine item appears in the manifest)
 *   3. Image paths in XHTML exactly match manifest paths
 *
 * Plus round-trip sanity on metadata, nav doc, NCX, and image embedding.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import JSZip from 'jszip'
import {
    compileEpub,
    buildOpf,
    buildNav,
    buildNcx,
    wrapChapterXhtml,
    serializeXhtml,
} from '../../src/adapters/epub.js'
import { parseFragment } from 'parse5'

// 1x1 transparent PNG
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

async function blobToZip(blob) {
    // jsdom's Blob doesn't implement arrayBuffer(); read via FileReader.
    const buf = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
    return JSZip.loadAsync(buf)
}

describe('compileEpub — basic envelope', () => {
    it('produces a Blob with PK magic bytes', async () => {
        const input = {
            sections: ['<h1>Intro</h1><p>Hello, world.</p>'],
            metadata: { title: 'Test Book', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'urn:isbn:1234' })
        expect(blob).toBeInstanceOf(Blob)

        // PK magic
        const buf = await new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(r.result)
            r.onerror = () => reject(r.error)
            r.readAsArrayBuffer(blob)
        })
        const bytes = new Uint8Array(buf)
        expect(bytes[0]).toBe(0x50)
        expect(bytes[1]).toBe(0x4b)
        expect(bytes[2]).toBe(0x03)
        expect(bytes[3]).toBe(0x04)
    })

    it('places mimetype as the first entry, stored uncompressed', async () => {
        const input = {
            sections: ['<h1>A</h1>'],
            metadata: { title: 'X', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const buf = await new Promise((resolve, reject) => {
            const r = new FileReader()
            r.onload = () => resolve(r.result)
            r.onerror = () => reject(r.error)
            r.readAsArrayBuffer(blob)
        })
        const bytes = new Uint8Array(buf)

        // Local file header signature at offset 0.
        // Offset 8-9: compression method (little-endian). 0 = STORE, 8 = DEFLATE.
        const compression = bytes[8] | (bytes[9] << 8)
        expect(compression).toBe(0)

        // Offset 26-27: filename length. Offset 28-29: extra field length.
        const nameLen = bytes[26] | (bytes[27] << 8)
        const extraLen = bytes[28] | (bytes[29] << 8)
        const nameStart = 30
        const name = String.fromCharCode(...bytes.slice(nameStart, nameStart + nameLen))
        expect(name).toBe('mimetype')

        // The raw mimetype bytes follow the header+name+extra. With STORE
        // compression, uncompressed size == compressed size.
        const uncompressedSize = bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24)
        const dataStart = nameStart + nameLen + extraLen
        const mimetypeBytes = bytes.slice(dataStart, dataStart + uncompressedSize)
        const mimetypeString = String.fromCharCode(...mimetypeBytes)
        expect(mimetypeString).toBe('application/epub+zip')
    })

    it('emits container.xml pointing at content.opf', async () => {
        const blob = await compileEpub(
            { sections: ['<h1>A</h1>'], metadata: { title: 'X', language: 'en' } },
            { identifier: 'x' },
        )
        const zip = await blobToZip(blob)
        const container = await zip.file('META-INF/container.xml').async('string')
        expect(container).toContain('<rootfile full-path="OEBPS/content.opf"')
        expect(container).toContain('media-type="application/oebps-package+xml"')
    })
})

describe('compileEpub — manifest/spine consistency', () => {
    it('every spine itemref points at a manifest item', async () => {
        const input = {
            sections: [
                '<h1>One</h1><p>First.</p>',
                '<h1>Two</h1><p>Second.</p>',
                '<h1>Three</h1><p>Third.</p>',
            ],
            metadata: { title: 'Test', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')

        const manifestIds = [...opf.matchAll(/<item\s+id="([^"]+)"/g)].map((m) => m[1])
        const spineIds = [...opf.matchAll(/<itemref\s+idref="([^"]+)"/g)].map((m) => m[1])
        expect(spineIds.length).toBe(3)
        for (const id of spineIds) {
            expect(manifestIds).toContain(id)
        }
    })

    it('every chapter referenced in the spine exists in the ZIP', async () => {
        const input = {
            sections: ['<h1>A</h1>', '<h1>B</h1>'],
            metadata: { title: 'Test', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')

        const chapterHrefs = [...opf.matchAll(/href="(chapters\/[^"]+)"/g)].map(
            (m) => m[1],
        )
        expect(chapterHrefs.length).toBe(2)
        for (const href of chapterHrefs) {
            expect(zip.file(`OEBPS/${href}`)).toBeTruthy()
        }
    })
})

describe('compileEpub — chapter XHTML', () => {
    it('serializes each chapter as well-formed XHTML with self-closing void tags', async () => {
        const input = {
            sections: ['<h1>Chapter</h1><p>Text with <br>a break and an <img src="data:image/png;base64,iVBORw0KGgo="> image.</p>'],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const ch = await zip.file('OEBPS/chapters/ch-01.xhtml').async('string')

        // Void elements self-close.
        expect(ch).toMatch(/<br\/>/)
        // Root <html> has both namespaces.
        expect(ch).toContain('xmlns="http://www.w3.org/1999/xhtml"')
        expect(ch).toContain('xmlns:epub="http://www.idpf.org/2007/ops"')
        // <title> is populated from the first heading.
        expect(ch).toContain('<title>Chapter</title>')
        // XML prolog is present.
        expect(ch.startsWith('<?xml')).toBe(true)
    })

    it('picks chapter title from first h1/h2/h3', async () => {
        const input = {
            sections: [
                '<p>Preamble.</p><h2>Alpha</h2><p>Body.</p>',
                '<h3>Beta</h3><p>Body.</p>',
            ],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')
        const nav = await zip.file('OEBPS/nav.xhtml').async('string')
        expect(opf).toBeTruthy()
        expect(nav).toContain('Alpha')
        expect(nav).toContain('Beta')
    })

    it('escapes ampersands and angle brackets in text', async () => {
        const input = {
            sections: ['<h1>Tom &amp; Jerry</h1><p>1 &lt; 2</p>'],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const ch = await zip.file('OEBPS/chapters/ch-01.xhtml').async('string')
        // parse5 decodes entities; re-serializer must re-escape them.
        expect(ch).toMatch(/Tom &amp; Jerry/)
        expect(ch).toMatch(/1 &lt; 2/)
    })
})

describe('compileEpub — image embedding', () => {
    let origFetch
    beforeEach(() => {
        origFetch = globalThis.fetch
        globalThis.fetch = async (url) => {
            if (String(url).includes('/broken.png')) {
                return {
                    ok: false,
                    status: 500,
                    statusText: 'Server Error',
                    headers: { get: () => '' },
                    arrayBuffer: async () => new ArrayBuffer(0),
                }
            }
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'image/png' : '') },
                arrayBuffer: async () => PNG_BYTES.buffer.slice(PNG_BYTES.byteOffset, PNG_BYTES.byteOffset + PNG_BYTES.byteLength),
            }
        }
    })
    afterEach(() => {
        globalThis.fetch = origFetch
    })

    it('fetches <img> srcs, stores bytes under OEBPS/images/, rewrites XHTML to relative path', async () => {
        const input = {
            sections: ['<h1>A</h1><img src="https://example.com/pic.png" alt="pic">'],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)

        const ch = await zip.file('OEBPS/chapters/ch-01.xhtml').async('string')
        // XHTML should point at a hashed images/ path, not the original URL.
        const rewritten = ch.match(/src="(\.\.\/images\/[^"]+)"/)
        expect(rewritten).not.toBeNull()
        const relPath = rewritten[1].replace(/^\.\.\//, '') // strip "../"
        const manifestPath = `OEBPS/${relPath}`
        expect(zip.file(manifestPath)).toBeTruthy()

        // The bytes written match the fetched PNG.
        const writtenBytes = await zip.file(manifestPath).async('uint8array')
        expect(writtenBytes.length).toBe(PNG_BYTES.length)
        for (let i = 0; i < PNG_BYTES.length; i++) {
            expect(writtenBytes[i]).toBe(PNG_BYTES[i])
        }

        // Manifest entry exists with correct media-type.
        const opf = await zip.file('OEBPS/content.opf').async('string')
        expect(opf).toContain(`href="${relPath}"`)
        expect(opf).toContain('media-type="image/png"')
    })

    it('dedupes identical image URLs across chapters', async () => {
        const input = {
            sections: [
                '<h1>A</h1><img src="https://example.com/same.png" alt="">',
                '<h1>B</h1><img src="https://example.com/same.png" alt="">',
            ],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')
        const imageManifestEntries = [...opf.matchAll(/href="(images\/[^"]+)"/g)]
        expect(imageManifestEntries.length).toBe(1)
    })

    it('leaves the <img> src in place when the fetch fails', async () => {
        const input = {
            sections: ['<h1>A</h1><img src="https://example.com/broken.png" alt="">'],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const ch = await zip.file('OEBPS/chapters/ch-01.xhtml').async('string')
        // Original URL preserved, no images/ rewrite.
        expect(ch).toContain('src="https://example.com/broken.png"')
        expect(ch).not.toMatch(/src="\.\.\/images\//)
    })
})

describe('compileEpub — nav and NCX', () => {
    it('nav.xhtml has an epub:type="toc" nav element with one link per chapter', async () => {
        const input = {
            sections: ['<h1>One</h1>', '<h1>Two</h1>', '<h1>Three</h1>'],
            metadata: { title: 'T', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const nav = await zip.file('OEBPS/nav.xhtml').async('string')
        expect(nav).toMatch(/<nav\s+epub:type="toc"/)
        const links = [...nav.matchAll(/<a\s+href="chapters\/[^"]+"/g)]
        expect(links.length).toBe(3)
    })

    it('toc.ncx declares navMap entries matching spine order', async () => {
        const input = {
            sections: ['<h1>One</h1>', '<h1>Two</h1>'],
            metadata: { title: 'Book', language: 'en' },
        }
        const blob = await compileEpub(input, { identifier: 'x' })
        const zip = await blobToZip(blob)
        const ncx = await zip.file('OEBPS/toc.ncx').async('string')
        expect(ncx).toContain('<docTitle><text>Book</text></docTitle>')
        expect(ncx).toContain('playOrder="1"')
        expect(ncx).toContain('playOrder="2"')
    })
})

describe('compileEpub — metadata', () => {
    it('merges caller meta over registered metadata (options.meta wins)', async () => {
        const input = {
            sections: ['<h1>A</h1>'],
            metadata: { title: 'From Registration', language: 'en', author: 'Alice' },
        }
        const blob = await compileEpub(input, {
            identifier: 'urn:uuid:zzz',
            meta: { title: 'Caller Override' },
        })
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')
        expect(opf).toContain('<dc:title>Caller Override</dc:title>')
        expect(opf).toContain('<dc:creator>Alice</dc:creator>')
        expect(opf).toContain('<dc:identifier id="pub-id">urn:uuid:zzz</dc:identifier>')
    })

    it('generates a UUID identifier when none is provided', async () => {
        const blob = await compileEpub(
            { sections: ['<h1>A</h1>'], metadata: { title: 'T', language: 'en' } },
            {},
        )
        const zip = await blobToZip(blob)
        const opf = await zip.file('OEBPS/content.opf').async('string')
        const match = opf.match(/<dc:identifier id="pub-id">([^<]+)<\/dc:identifier>/)
        expect(match).not.toBeNull()
        expect(match[1]).toMatch(/urn:uuid:[0-9a-f-]+/)
    })

    it('writes styles.css from options.stylesheet', async () => {
        const blob = await compileEpub(
            { sections: ['<h1>A</h1>'], metadata: { title: 'T', language: 'en' } },
            { identifier: 'x', stylesheet: '.special { color: red; }' },
        )
        const zip = await blobToZip(blob)
        const css = await zip.file('OEBPS/styles.css').async('string')
        expect(css).toBe('.special { color: red; }')
    })
})

describe('serializeXhtml — direct unit tests', () => {
    it('serializes void tags self-closing', () => {
        const tree = parseFragment('<br><hr><img src="x.png">')
        const out = serializeXhtml(tree)
        expect(out).toBe('<br/><hr/><img src="x.png"/>')
    })

    it('escapes attribute values', () => {
        const tree = parseFragment('<a href="?a&b=c">x</a>')
        const out = serializeXhtml(tree)
        expect(out).toContain('href="?a&amp;b=c"')
    })

    it('lowercases tag names', () => {
        // parse5 normalises case during parsing, so this asserts the invariant.
        const tree = parseFragment('<DIV><P>text</P></DIV>')
        const out = serializeXhtml(tree)
        expect(out).toContain('<div>')
        expect(out).toContain('<p>')
    })
})
