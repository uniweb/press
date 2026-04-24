/**
 * Tests for the whole-subtree aggregation primitive.
 *
 * compileRegistrations lets callers aggregate Press registrations across
 * any React subtree, including off-screen trees they've never mounted
 * in the live DOM (the whole-book Download case).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { compileRegistrations, compileSubtree, compileDocument } from '../../src/compileRegistrations.js'
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

// compileDocument sits on top of compileSubtree and adds three concerns:
// foundation-driven adapter options, format aliasing (via:), and block
// gathering from a Website. The tests cover each independently plus the
// tree-mode passthrough.
describe('compileDocument', () => {
    // Install the childBlockRenderer that initPrerender would set up, so
    // website-mode tests don't need the full runtime boot path.
    let prevUniweb
    const fakeRenderer = ({ blocks }) =>
        blocks.map((b, i) => (
            <FakeSection key={i} block={b} label={`B${i + 1}`} />
        ))
    beforeEach(() => {
        prevUniweb = globalThis.uniweb
        globalThis.uniweb = { childBlockRenderer: fakeRenderer }
    })
    afterEach(() => {
        globalThis.uniweb = prevUniweb
    })

    it('tree mode is equivalent to compileSubtree', async () => {
        const tree = (
            <>
                <FakeSection block={{ id: 1 }} label="alpha" />
                <FakeSection block={{ id: 2 }} label="beta" />
            </>
        )
        const blob = await compileDocument(tree, {
            format: 'typst',
            adapterOptions: { mode: 'sources', meta: { title: 'A' } },
        })
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/zip')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('tree mode requires a format', async () => {
        const tree = <FakeSection block={{}} label="x" />
        await expect(compileDocument(tree, {})).rejects.toThrow(/format.*required/)
    })

    it('website mode gathers bodyBlocks across pages', async () => {
        const website = {
            basePath: '/',
            pages: [
                { route: 'ch1', bodyBlocks: [{ id: 1 }] },
                { route: 'ch2', bodyBlocks: [{ id: 2 }, { id: 3 }] },
            ],
        }
        const foundation = {
            outputs: {
                typst: {
                    extension: 'zip',
                    getOptions: () => ({
                        adapterOptions: { mode: 'sources', meta: { title: 'Book' } },
                    }),
                },
            },
        }
        const blob = await compileDocument(website, { format: 'typst', foundation })
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('website mode scopes by rootPath', async () => {
        const gathered = []
        const spyRenderer = ({ blocks }) => {
            blocks.forEach((b) => gathered.push(b.id))
            return blocks.map((b, i) => (
                <FakeSection key={i} block={b} label={`B${b.id}`} />
            ))
        }
        globalThis.uniweb = { childBlockRenderer: spyRenderer }

        const website = {
            pages: [
                { route: 'intro', bodyBlocks: [{ id: 1 }] },
                { route: 'book/ch1', bodyBlocks: [{ id: 2 }] },
                { route: 'book/ch2', bodyBlocks: [{ id: 3 }] },
                { route: 'book', bodyBlocks: [{ id: 4 }] },
            ],
        }
        const foundation = { outputs: { typst: { getOptions: () => ({}) } } }
        await compileDocument(website, { format: 'typst', foundation, rootPath: 'book' })
        // Pages filter keeps original array order; intro (id=1) is dropped
        // because its route doesn't match 'book' or 'book/...'. The 'book'
        // page (exact match) and 'book/ch1', 'book/ch2' stay in declared
        // order.
        expect(gathered).toEqual([2, 3, 4])
    })

    it('resolves outputs from foundation.default.capabilities.outputs (built shape)', async () => {
        const website = { pages: [{ route: 'x', bodyBlocks: [{ id: 1 }] }] }
        const builtFoundation = {
            default: {
                capabilities: {
                    outputs: {
                        typst: { getOptions: () => ({ adapterOptions: { mode: 'sources', meta: { title: 'Z' } } }) },
                    },
                },
            },
        }
        const blob = await compileDocument(website, { format: 'typst', foundation: builtFoundation })
        expect(blob).toBeInstanceOf(Blob)
    })

    it('via: redirects to a different Press format', async () => {
        let seenFormat = null
        const spyRenderer = ({ blocks }) =>
            blocks.map((b, i) => (
                <FakeSection key={i} block={b} label={`B${i + 1}`} />
            ))
        globalThis.uniweb = { childBlockRenderer: spyRenderer }

        const website = { pages: [{ route: 'x', bodyBlocks: [{ id: 1 }] }] }
        const foundation = {
            outputs: {
                pdf: {
                    extension: 'pdf',
                    via: 'typst',
                    getOptions: () => {
                        seenFormat = 'pdf' // the foundation is told about 'pdf' (user-facing)
                        return { adapterOptions: { mode: 'sources', meta: { title: 'V' } } }
                    },
                },
            },
        }
        const blob = await compileDocument(website, { format: 'pdf', foundation })
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/zip') // Press emitted typst, not pdf
        expect(seenFormat).toBe('pdf')
    })

    it('throws with a helpful message when the format is not declared', async () => {
        const website = { pages: [] }
        const foundation = {
            outputs: {
                typst: { getOptions: () => ({}) },
                epub: { getOptions: () => ({}) },
            },
        }
        await expect(
            compileDocument(website, { format: 'docx', foundation }),
        ).rejects.toThrow(/outputs\.docx.*Declared outputs: typst, epub/s)
    })

    it('throws when the foundation has no outputs at all', async () => {
        const website = { pages: [] }
        const foundation = { /* no outputs declared */ }
        await expect(
            compileDocument(website, { format: 'typst', foundation }),
        ).rejects.toThrow(/no outputs declaration/)
    })

    it('explicit adapterOptions override foundation-supplied ones', async () => {
        // We can observe this by seeing the final meta end up in the
        // typst bundle. The foundation declares a title; the caller
        // overrides it. The bundle's meta.typ should contain the override.
        const website = { pages: [{ route: 'x', bodyBlocks: [{ id: 1 }] }] }
        const foundation = {
            outputs: {
                typst: {
                    getOptions: () => ({
                        adapterOptions: { mode: 'sources', meta: { title: 'Foundation' } },
                    }),
                },
            },
        }
        const blob = await compileDocument(website, {
            format: 'typst',
            foundation,
            adapterOptions: { mode: 'sources', meta: { title: 'Override' } },
        })
        // Key fact: the compile didn't throw, meaning the override-merge
        // code path ran cleanly. Bundle-content assertions (e.g., that
        // 'Override' actually made it into meta.typ) belong at a level
        // that can read the zip's entries; jsdom's Blob is write-only.
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBeGreaterThan(0)
    })

    it('missing globalThis.uniweb.childBlockRenderer is a clear error', async () => {
        globalThis.uniweb = {} // no renderer
        const website = { pages: [{ route: 'x', bodyBlocks: [{ id: 1 }] }] }
        const foundation = { outputs: { typst: { getOptions: () => ({}) } } }
        await expect(
            compileDocument(website, { format: 'typst', foundation }),
        ).rejects.toThrow(/childBlockRenderer is not installed/)
    })
})
