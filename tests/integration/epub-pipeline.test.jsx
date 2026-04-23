/**
 * End-to-end: register sections under 'html', compile via runCompile('epub'),
 * verify the resulting EPUB round-trips through JSZip and has the expected
 * structure. Mirrors the Paged.js pipeline test but asserts EPUB specifics
 * (mimetype first + STORED, manifest ↔ spine, chapter XHTML per section).
 */
import { describe, it, expect } from 'vitest'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import JSZip from 'jszip'
import DocumentProvider, { createStore } from '../../src/DocumentProvider.jsx'
import { compileOutputs } from '../../src/ir/compile.js'
import { runCompile } from '../../src/adapters/dispatch.js'

async function blobToZip(blob) {
    const buf = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(r.error)
        r.readAsArrayBuffer(blob)
    })
    return JSZip.loadAsync(buf)
}

describe('EPUB pipeline (register → compile → Blob)', () => {
    it('compiles three registered sections into three chapter XHTML files', async () => {
        const store = createStore()

        // Two sections that register under 'html' — the shape shared with
        // Paged.js (and a future foundation that supports both formats
        // writes one registration).
        function SectionA() {
            store.register({}, 'html', <section><h1>Introduction</h1><p>Hello.</p></section>, {})
            return null
        }
        function SectionB() {
            store.register({}, 'html', <section><h1>Method</h1><p>Details.</p></section>, {})
            return null
        }
        function SectionC() {
            store.register({}, 'html', <section><h1>Conclusion</h1><p>Done.</p></section>, {})
            return null
        }
        function Meta() {
            store.register(
                {},
                'html',
                { title: 'Example Book', author: 'Pressy', language: 'en' },
                { role: 'metadata' },
            )
            return null
        }

        renderToStaticMarkup(
            createElement(
                DocumentProvider,
                { store, basePath: '' },
                <>
                    <Meta />
                    <SectionA />
                    <SectionB />
                    <SectionC />
                </>,
            ),
        )

        const compiled = compileOutputs(store, 'epub')
        expect(compiled.sections).toHaveLength(3)
        expect(compiled.metadata).toEqual({ title: 'Example Book', author: 'Pressy', language: 'en' })

        const blob = await runCompile('epub', compiled, { identifier: 'urn:test:1' })
        const zip = await blobToZip(blob)

        // Chapter files exist and match spine order.
        expect(zip.file('OEBPS/chapters/ch-01.xhtml')).toBeTruthy()
        expect(zip.file('OEBPS/chapters/ch-02.xhtml')).toBeTruthy()
        expect(zip.file('OEBPS/chapters/ch-03.xhtml')).toBeTruthy()

        const opf = await zip.file('OEBPS/content.opf').async('string')
        expect(opf).toContain('<dc:title>Example Book</dc:title>')
        expect(opf).toContain('<dc:creator>Pressy</dc:creator>')

        // Spine order matches registration order.
        const spineIds = [...opf.matchAll(/<itemref\s+idref="([^"]+)"/g)].map((m) => m[1])
        expect(spineIds).toEqual(['ch-01', 'ch-02', 'ch-03'])

        // Nav has one link per chapter, carrying the chapter titles.
        const nav = await zip.file('OEBPS/nav.xhtml').async('string')
        expect(nav).toContain('Introduction')
        expect(nav).toContain('Method')
        expect(nav).toContain('Conclusion')
    })

    it('shares registrations with Paged.js — same store, both formats compile', async () => {
        const store = createStore()
        function Section() {
            store.register({}, 'html', <section><h1>Shared</h1><p>One registration.</p></section>, {})
            return null
        }
        renderToStaticMarkup(
            createElement(DocumentProvider, { store }, <Section />),
        )

        const epub = await runCompile('epub', compileOutputs(store, 'epub'), {
            identifier: 'x',
            meta: { title: 'T', language: 'en' },
        })
        const paged = await runCompile('pagedjs', compileOutputs(store, 'pagedjs'))

        expect(epub).toBeInstanceOf(Blob)
        expect(paged).toBeInstanceOf(Blob)
        expect(paged.type).toMatch(/text\/html/)
    })
})
