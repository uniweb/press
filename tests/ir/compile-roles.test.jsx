import { describe, it, expect } from 'vitest'
import React from 'react'
import { compileOutputs } from '../../src/ir/compile.js'

/**
 * Minimal fake store that mirrors the DocumentProvider store's interface
 * well enough for compileOutputs to walk it.
 */
function makeStore(outputs) {
    return {
        getOutputs: () => outputs,
        wrapWithProviders: (x) => x,
    }
}

describe('compileOutputs: role grouping (HTML-based formats)', () => {
    it('puts body fragments into sections', () => {
        const store = makeStore([
            { fragment: <p data-type="paragraph">A</p>, options: { role: 'body' } },
            { fragment: <p data-type="paragraph">B</p>, options: {} }, // default = body
        ])
        const compiled = compileOutputs(store, 'docx')
        expect(compiled.sections).toHaveLength(2)
        expect(compiled.header).toBeNull()
        expect(compiled.footer).toBeNull()
        expect(compiled.metadata).toBeNull()
    })

    it('captures header and footer as single IR entries (last wins)', () => {
        const store = makeStore([
            { fragment: <p data-type="paragraph">h1</p>, options: { role: 'header' } },
            { fragment: <p data-type="paragraph">h2</p>, options: { role: 'header' } },
            { fragment: <p data-type="paragraph">ftr</p>, options: { role: 'footer' } },
        ])
        const compiled = compileOutputs(store, 'docx')
        // last header wins
        expect(compiled.header[0].children[0].content).toBe('h2')
        expect(compiled.footer[0].children[0].content).toBe('ftr')
    })

    it('captures metadata as a plain object (no IR walk)', () => {
        const meta = {
            title: 'The Uniweb Framework',
            author: 'Diego Macrini',
            isbn: '978-1-23456-789-0',
        }
        const store = makeStore([
            { fragment: <p data-type="paragraph">body</p>, options: { role: 'body' } },
            { fragment: meta, options: { role: 'metadata' } },
        ])
        const compiled = compileOutputs(store, 'typst')
        expect(compiled.metadata).toEqual(meta)
        expect(compiled.sections).toHaveLength(1)
    })

    it('last metadata registration wins', () => {
        const store = makeStore([
            { fragment: { title: 'first' }, options: { role: 'metadata' } },
            { fragment: { title: 'second' }, options: { role: 'metadata' } },
        ])
        const compiled = compileOutputs(store, 'typst')
        expect(compiled.metadata).toEqual({ title: 'second' })
    })

    it('metadata is null when no metadata fragment is registered', () => {
        const store = makeStore([
            { fragment: <p data-type="paragraph">body</p>, options: {} },
        ])
        const compiled = compileOutputs(store, 'docx')
        expect(compiled.metadata).toBeNull()
    })
})

describe('compileOutputs: applyTo:first plumbing', () => {
    it('emits headerFirstPageOnly:true when the header was registered with applyTo:first', () => {
        const store = makeStore([
            {
                fragment: <p data-type="paragraph">cover header</p>,
                options: { role: 'header', applyTo: 'first' },
            },
        ])
        const compiled = compileOutputs(store, 'docx')
        expect(compiled.headerFirstPageOnly).toBe(true)
        expect(compiled.footerFirstPageOnly).toBe(false)
    })

    it('emits footerFirstPageOnly:true when the footer was registered with applyTo:first', () => {
        const store = makeStore([
            {
                fragment: <p data-type="paragraph">cover footer</p>,
                options: { role: 'footer', applyTo: 'first' },
            },
        ])
        const compiled = compileOutputs(store, 'docx')
        expect(compiled.headerFirstPageOnly).toBe(false)
        expect(compiled.footerFirstPageOnly).toBe(true)
    })

    it('defaults both flags to false when applyTo is absent or not "first"', () => {
        const store = makeStore([
            { fragment: <p data-type="paragraph">h</p>, options: { role: 'header' } },
            {
                fragment: <p data-type="paragraph">f</p>,
                options: { role: 'footer', applyTo: 'all' },
            },
        ])
        const compiled = compileOutputs(store, 'docx')
        expect(compiled.headerFirstPageOnly).toBe(false)
        expect(compiled.footerFirstPageOnly).toBe(false)
    })
})
