import { describe, it, expect } from 'vitest'
import {
    compilePagedjs,
    emitDocument,
    DEFAULT_POLYFILL_URL,
    DEFAULT_STYLESHEET,
} from '../../src/adapters/pagedjs.js'

// jsdom's Blob doesn't implement .arrayBuffer() / .text(). FileReader does.
function blobToText(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob, 'utf-8')
    })
}

describe('pagedjs adapter: emitDocument', () => {
    it('emits a full HTML5 document with doctype and lang', () => {
        const doc = emitDocument({ body: '<p>hi</p>' })
        expect(doc.startsWith('<!doctype html>')).toBe(true)
        expect(doc).toContain('<html lang="en">')
    })

    it('embeds the Paged.js polyfill script with defer', () => {
        const doc = emitDocument({ body: '' })
        expect(doc).toContain(
            `<script src="${DEFAULT_POLYFILL_URL}" defer>`,
        )
    })

    it('embeds the default stylesheet when no stylesheet option is given', () => {
        const doc = emitDocument({ body: '' })
        expect(doc).toContain('<style>' + DEFAULT_STYLESHEET)
    })

    it('embeds a foundation-supplied stylesheet verbatim', () => {
        const custom = '/* FOUNDATION STYLESHEET MARKER */'
        const doc = emitDocument({ body: '', stylesheet: custom })
        expect(doc).toContain(custom)
        expect(doc).not.toContain(DEFAULT_STYLESHEET)
    })

    it('allows overriding the polyfill URL', () => {
        const doc = emitDocument({
            body: '',
            polyfillUrl: 'https://example.test/paged.js',
        })
        expect(doc).toContain(
            '<script src="https://example.test/paged.js" defer>',
        )
    })

    it('uses metadata.title as the <title> and metadata.language as lang', () => {
        const doc = emitDocument({
            body: '',
            meta: { title: 'My Book', language: 'es' },
        })
        expect(doc).toContain('<title>My Book</title>')
        expect(doc).toContain('<html lang="es">')
    })

    it('escapes special characters in title and lang', () => {
        const doc = emitDocument({
            body: '',
            meta: { title: 'A & B <C>', language: 'en"us' },
        })
        expect(doc).toContain('<title>A &amp; B &lt;C&gt;</title>')
        expect(doc).toContain('lang="en&quot;us"')
    })

    it('emits <meta> tags for author, description, and subject', () => {
        const doc = emitDocument({
            body: '',
            meta: {
                author: 'Jane Doe',
                description: 'A short description.',
                subject: 'Typography',
            },
        })
        expect(doc).toContain('<meta name="author" content="Jane Doe" />')
        expect(doc).toContain(
            '<meta name="description" content="A short description." />',
        )
        expect(doc).toContain('<meta name="subject" content="Typography" />')
    })

    it('emits a hidden metadata block with inline spans per field', () => {
        const doc = emitDocument({
            body: '',
            meta: { title: 'X', author: 'Y', isbn: '978-0-00-000000-0' },
        })
        expect(doc).toContain('<div data-pagedjs-metadata hidden>')
        expect(doc).toContain('<span data-field="title">X</span>')
        expect(doc).toContain('<span data-field="author">Y</span>')
        expect(doc).toContain(
            '<span data-field="isbn">978-0-00-000000-0</span>',
        )
    })

    it('does not emit an empty metadata block when meta is empty', () => {
        const doc = emitDocument({ body: '<p>hi</p>', meta: {} })
        expect(doc).not.toContain('<div data-pagedjs-metadata')
    })

    it('concatenates section HTML inside <body>', () => {
        const doc = emitDocument({ body: '<h1>One</h1>\n<h1>Two</h1>' })
        expect(doc).toContain('<h1>One</h1>')
        expect(doc).toContain('<h1>Two</h1>')
        expect(doc.indexOf('<h1>One</h1>')).toBeLessThan(
            doc.indexOf('<h1>Two</h1>'),
        )
    })
})

describe('pagedjs adapter: compilePagedjs (html mode)', () => {
    it('returns a text/html Blob', async () => {
        const blob = await compilePagedjs(
            { sections: [], metadata: null },
            { mode: 'html' },
        )
        expect(typeof blob.size).toBe('number')
        expect(blob.size).toBeGreaterThan(0)
        expect(blob.type).toMatch(/^text\/html/)
    })

    it('defaults to html mode', async () => {
        const blob = await compilePagedjs({ sections: [] })
        expect(blob.type).toMatch(/^text\/html/)
    })

    it('embeds provided sections in order inside the body', async () => {
        const blob = await compilePagedjs(
            {
                sections: ['<h1>Chapter 1</h1>', '<h1>Chapter 2</h1>'],
                metadata: null,
            },
            { mode: 'html' },
        )
        const text = await blobToText(blob)
        expect(text).toContain('<h1>Chapter 1</h1>')
        expect(text).toContain('<h1>Chapter 2</h1>')
        expect(text.indexOf('<h1>Chapter 1</h1>')).toBeLessThan(
            text.indexOf('<h1>Chapter 2</h1>'),
        )
    })

    it('merges metadata role with options.meta (options wins)', async () => {
        const blob = await compilePagedjs(
            { sections: [], metadata: { title: 'From role', author: 'A' } },
            { mode: 'html', meta: { title: 'From options' } },
        )
        const text = await blobToText(blob)
        expect(text).toContain('<title>From options</title>')
        expect(text).toContain('<span data-field="author">A</span>')
        expect(text).not.toContain('From role')
    })

    it('uses a foundation-supplied stylesheet when provided', async () => {
        const blob = await compilePagedjs(
            { sections: [], metadata: null },
            { mode: 'html', stylesheet: '/* FOUNDATION MARKER */' },
        )
        const text = await blobToText(blob)
        expect(text).toContain('/* FOUNDATION MARKER */')
    })

    it('includes the Paged.js polyfill script tag', async () => {
        const blob = await compilePagedjs(
            { sections: [] },
            { mode: 'html' },
        )
        const text = await blobToText(blob)
        expect(text).toContain(
            `<script src="${DEFAULT_POLYFILL_URL}" defer>`,
        )
    })

    it('rejects unknown modes with a helpful message', async () => {
        await expect(
            compilePagedjs({ sections: [] }, { mode: 'bogus' }),
        ).rejects.toThrow(/unknown mode "bogus"/i)
    })
})

describe('pagedjs adapter: compilePagedjs (server mode)', () => {
    it('POSTs a multipart/form-data body with a document.html field', async () => {
        const originalFetch = globalThis.fetch
        let captured = null
        globalThis.fetch = async (url, init) => {
            captured = { url, init }
            return new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            })
        }
        try {
            const blob = await compilePagedjs(
                { sections: ['<p>x</p>'], metadata: { title: 'T' } },
                { mode: 'server', endpoint: 'https://example.test/compile' },
            )
            expect(typeof blob.size).toBe('number')
            expect(blob.size).toBeGreaterThan(0)
            expect(blob.type).toBe('application/pdf')
            expect(captured.url).toBe('https://example.test/compile')
            expect(captured.init.method).toBe('POST')
            expect(captured.init.body).toBeInstanceOf(FormData)
            const formKeys = [...captured.init.body.keys()]
            expect(formKeys).toEqual(['document.html'])
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('uses /__press/pagedjs/compile as the default endpoint', async () => {
        const originalFetch = globalThis.fetch
        let capturedUrl = null
        globalThis.fetch = async (url) => {
            capturedUrl = url
            return new Response(new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]), {
                status: 200,
                headers: { 'content-type': 'application/pdf' },
            })
        }
        try {
            await compilePagedjs({ sections: [] }, { mode: 'server' })
            expect(capturedUrl).toBe('/__press/pagedjs/compile')
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('propagates non-200 responses as errors', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () =>
            new Response('chromium crashed', {
                status: 500,
                statusText: 'Server Error',
            })
        try {
            await expect(
                compilePagedjs(
                    { sections: [] },
                    { mode: 'server', endpoint: '/x' },
                ),
            ).rejects.toThrow(/500.*Server Error.*chromium crashed/s)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('reports network failures with a helpful message', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () => {
            throw new Error('ECONNREFUSED')
        }
        try {
            await expect(
                compilePagedjs(
                    { sections: [] },
                    { mode: 'server', endpoint: '/x' },
                ),
            ).rejects.toThrow(/Is the dev server.*ECONNREFUSED/s)
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
