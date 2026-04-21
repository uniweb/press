/**
 * Tests for the whole-subtree aggregation primitive.
 *
 * compileRegistrations lets callers aggregate Press registrations across
 * any React subtree, including off-screen trees they've never mounted
 * in the live DOM (the whole-book Download case).
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { compileRegistrations, compileSubtree } from '../../src/compileRegistrations.js'
import { createStore, DocumentProvider } from '../../src/index.js'
import { useDocumentOutput } from '../../src/useDocumentOutput.js'
import { renderToStaticMarkup } from 'react-dom/server'

function FakeSection({ block, label }) {
    useDocumentOutput(
        block,
        'typst',
        <p data-type="paragraph" data-label={label}>{label}</p>,
    )
    return <article>{label}</article>
}

describe('createStore', () => {
    it('produces a store with the expected shape', () => {
        const store = createStore()
        expect(typeof store.register).toBe('function')
        expect(typeof store.getOutputs).toBe('function')
        expect(typeof store.clear).toBe('function')
        expect(typeof store.wrapWithProviders).toBe('function')
    })

    it('captures registrations in insertion order', () => {
        const store = createStore()
        const b1 = {}
        const b2 = {}
        store.register(b1, 'typst', 'one')
        store.register(b2, 'typst', 'two')
        const outputs = store.getOutputs('typst')
        expect(outputs.map((o) => o.fragment)).toEqual(['one', 'two'])
    })

    it('is idempotent — re-registering overwrites', () => {
        const store = createStore()
        const b = {}
        store.register(b, 'typst', 'first')
        store.register(b, 'typst', 'second')
        const outputs = store.getOutputs('typst')
        expect(outputs).toHaveLength(1)
        expect(outputs[0].fragment).toBe('second')
    })
})

describe('DocumentProvider with external store', () => {
    it('uses the external store instead of creating one', () => {
        const store = createStore()
        const b1 = { id: 'b1' }

        renderToStaticMarkup(
            <DocumentProvider store={store}>
                <FakeSection block={b1} label="alpha" />
            </DocumentProvider>,
        )

        const outputs = store.getOutputs('typst')
        expect(outputs).toHaveLength(1)
        expect(outputs[0].block).toBe(b1)
    })

    it('still creates an internal store when none is provided', () => {
        // No crash when no external store is provided (live-page case).
        const html = renderToStaticMarkup(
            <DocumentProvider>
                <FakeSection block={{}} label="x" />
            </DocumentProvider>,
        )
        expect(html).toContain('<article>')
    })
})

describe('compileRegistrations', () => {
    it('aggregates multiple sections from a flat subtree', () => {
        const blocks = [{ id: 1 }, { id: 2 }, { id: 3 }]
        const tree = (
            <>
                {blocks.map((b, i) => (
                    <FakeSection key={i} block={b} label={`S${i + 1}`} />
                ))}
            </>
        )

        const compiled = compileRegistrations(tree, 'typst')
        expect(compiled.sections).toHaveLength(3)
        // Order is registration order.
        const labels = compiled.sections.map((ir) => ir[0]?.label)
        expect(labels).toEqual(['S1', 'S2', 'S3'])
    })

    it('aggregates registrations from deeply nested subtrees', () => {
        // Simulates pages containing blocks — registration happens at the
        // leaves, collected by the provider regardless of nesting depth.
        function Page({ blocks, pageLabel }) {
            return (
                <div data-page={pageLabel}>
                    {blocks.map((b, i) => (
                        <FakeSection
                            key={i}
                            block={b}
                            label={`${pageLabel}-${i}`}
                        />
                    ))}
                </div>
            )
        }

        const pages = [
            { label: 'p1', blocks: [{}, {}] },
            { label: 'p2', blocks: [{}] },
            { label: 'p3', blocks: [{}, {}, {}] },
        ]

        const tree = pages.map((p, i) => (
            <Page key={i} pageLabel={p.label} blocks={p.blocks} />
        ))

        const compiled = compileRegistrations(tree, 'typst')
        expect(compiled.sections).toHaveLength(6) // 2 + 1 + 3
        const labels = compiled.sections.map((ir) => ir[0]?.label)
        expect(labels).toEqual(['p1-0', 'p1-1', 'p2-0', 'p3-0', 'p3-1', 'p3-2'])
    })

    it('forwards basePath to the provider', () => {
        // basePath should be visible to builders that read BasePathContext.
        // We verify indirectly: the provider re-wraps fragments during
        // compile, so a basePath set here doesn't cause a crash and flows
        // through to wrapWithProviders.
        const tree = <FakeSection block={{}} label="x" />
        expect(() =>
            compileRegistrations(tree, 'typst', { basePath: '/my-book' }),
        ).not.toThrow()
    })

    it('returns an empty sections array when nothing registered', () => {
        const tree = <div>just html, no sections</div>
        const compiled = compileRegistrations(tree, 'typst')
        expect(compiled.sections).toEqual([])
    })

    it('compileSubtree aggregates + dispatches the adapter end-to-end', async () => {
        const blocks = [{ id: 1 }, { id: 2 }]
        const tree = (
            <>
                {blocks.map((b, i) => (
                    <FakeSection key={i} block={b} label={`S${i + 1}`} />
                ))}
            </>
        )
        const blob = await compileSubtree(tree, 'typst', {
            adapterOptions: { mode: 'sources', meta: { title: 'A' } },
        })
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/zip')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('respects format dispatch — docx vs typst collect separate stores', () => {
        function DualSection({ block }) {
            useDocumentOutput(block, 'typst', <p data-type="paragraph">T</p>)
            useDocumentOutput(block, 'docx', <p data-type="paragraph">D</p>)
            return null
        }
        const b = {}
        const tree = <DualSection block={b} />

        const typst = compileRegistrations(tree, 'typst')
        const docx = compileRegistrations(tree, 'docx')
        expect(typst.sections).toHaveLength(1)
        expect(docx.sections).toHaveLength(1)
        // The aggregation is independent per format: neither sees the
        // other format's fragment.
        expect(typst.sections[0][0].children[0].content).toBe('T')
        expect(docx.sections[0][0].children[0].content).toBe('D')
    })
})
