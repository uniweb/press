import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import DocumentProvider, { createStore } from '../../src/DocumentProvider.jsx'
import { compileOutputs } from '../../src/ir/compile.js'

// Paged.js's adapter descriptor declares `consumes: 'html'`, so foundations
// register under 'html' (not 'pagedjs'). The pipeline resolves that through
// getAdapterDescriptor — callers still name the output format ('pagedjs')
// when invoking compileOutputs / compileSubtree.
function registerHtml(store, block, fragment, options) {
    store.register(block, 'html', fragment, options)
}

describe('compileOutputs(store, "pagedjs") — reads the "html" input shape', () => {
    it('collects body fragments as HTML strings in insertion order', () => {
        const store = createStore()
        const blockA = {}
        const blockB = {}
        registerHtml(store, blockA, <h1>Chapter A</h1>, {})
        registerHtml(store, blockB, <h1>Chapter B</h1>, {})

        const compiled = compileOutputs(store, 'pagedjs')
        expect(compiled.sections).toHaveLength(2)
        expect(compiled.sections[0]).toContain('Chapter A')
        expect(compiled.sections[1]).toContain('Chapter B')
    })

    it('captures metadata role verbatim and skips header/footer roles', () => {
        const store = createStore()
        const block = {}
        const metaBlock = {}
        registerHtml(store, block, <p>Body</p>, { role: 'body' })
        registerHtml(store, {}, <span>header</span>, { role: 'header' })
        registerHtml(store, {}, <span>footer</span>, { role: 'footer' })
        registerHtml(
            store,
            metaBlock,
            { title: 'Hello', author: 'World' },
            { role: 'metadata' },
        )

        const compiled = compileOutputs(store, 'pagedjs')
        expect(compiled.sections).toHaveLength(1)
        expect(compiled.sections[0]).toContain('Body')
        expect(compiled.metadata).toEqual({ title: 'Hello', author: 'World' })
    })

    it('does NOT read typst fragments when compiling pagedjs', () => {
        // Alias seam invariant: registrations for one input shape do not
        // leak into adapters that declare a different `consumes` key.
        const store = createStore()
        store.register({}, 'typst', <h1>Typst only</h1>, {})
        store.register({}, 'html', <h1>Html only</h1>, {})

        const compiled = compileOutputs(store, 'pagedjs')
        expect(compiled.sections).toHaveLength(1)
        expect(compiled.sections[0]).toContain('Html only')
        expect(compiled.sections[0]).not.toContain('Typst only')
    })

    it('re-wraps fragments through store.wrapWithProviders (basePath)', () => {
        const store = createStore()
        function Section() {
            store.register({}, 'html', <p>Hi</p>, {})
            return null
        }
        renderToStaticMarkup(
            createElement(
                DocumentProvider,
                { store, basePath: '/site' },
                createElement(Section),
            ),
        )

        const compiled = compileOutputs(store, 'pagedjs')
        expect(compiled.sections).toHaveLength(1)
        expect(compiled.sections[0]).toContain('Hi')
    })
})
