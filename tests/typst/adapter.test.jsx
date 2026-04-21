import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle, compileTypst } from '../../src/adapters/typst.js'
import {
    TextRun,
    Paragraph,
    Paragraphs,
    Heading,
    ChapterOpener,
    CodeBlock,
    BulletList,
    NumberedList,
    BlockQuote,
    Image,
    Table,
    Asterism,
    Raw,
    Sequence,
} from '../../src/typst/index.js'

/**
 * End-to-end helper: render JSX → HTML → IR → bundle.
 * Returns the bundle's content.typ output for inspection.
 */
function renderToContentTyp(element) {
    const html = ReactDOMServer.renderToStaticMarkup(element)
    const ir = htmlToIR(html)
    const bundle = buildBundle({ sections: [ir], metadata: null })
    return bundle['content.typ']
}

describe('typst adapter: IR → Typst source', () => {
    it('emits a heading at the right level', () => {
        const src = renderToContentTyp(<Heading level={2} data="My Chapter" />)
        expect(src).toContain('== My Chapter')
    })

    it('emits a paragraph as plain text', () => {
        const src = renderToContentTyp(<Paragraph>Hello world.</Paragraph>)
        expect(src).toContain('Hello world.')
    })

    it('wraps bold / italic inline marks', () => {
        const src = renderToContentTyp(
            <Paragraph data="See <strong>bold</strong> and <em>italic</em>." />,
        )
        expect(src).toContain('*bold*')
        expect(src).toContain('_italic_')
    })

    it('emits links via typst #link', () => {
        const src = renderToContentTyp(
            <Paragraph data='See <a href="https://example.com">the docs</a>.' />,
        )
        expect(src).toContain('#link("https://example.com")')
        expect(src).toContain('the docs')
    })

    it('emits a chapter-opener call into the foundation preamble', () => {
        const src = renderToContentTyp(
            <ChapterOpener number={3} title="The Ecosystem" />,
        )
        expect(src).toContain('#chapter-opener(')
        expect(src).toContain('number: "3"')
        expect(src).toContain('title: "The Ecosystem"')
    })

    it('emits a code block with language fence', () => {
        const src = renderToContentTyp(
            <CodeBlock language="jsx">{'const x = 1'}</CodeBlock>,
        )
        expect(src).toContain('```jsx')
        expect(src).toContain('const x = 1')
        expect(src).toContain('```\n')
    })

    it('emits bullet list items with `-` markers', () => {
        const src = renderToContentTyp(
            <BulletList items={['one', 'two']} />,
        )
        expect(src).toContain('- one')
        expect(src).toContain('- two')
    })

    it('emits numbered list items with `+` markers', () => {
        const src = renderToContentTyp(<NumberedList items={['a', 'b']} />)
        expect(src).toContain('+ a')
        expect(src).toContain('+ b')
    })

    it('emits blockquote via #quote', () => {
        const src = renderToContentTyp(
            <BlockQuote>
                <Paragraph>Quoted text.</Paragraph>
            </BlockQuote>,
        )
        expect(src).toContain('#quote(block: true)')
        expect(src).toContain('Quoted text.')
    })

    it('emits image via #image / #figure', () => {
        const withoutCaption = renderToContentTyp(
            <Image src="/photo.jpg" />,
        )
        expect(withoutCaption).toContain('#image("/photo.jpg")')

        const withCaption = renderToContentTyp(
            <Image src="/photo.jpg" caption="A photo" width="400" />,
        )
        expect(withCaption).toContain('#figure(')
        expect(withCaption).toContain('image("/photo.jpg", width: 400pt)')
        expect(withCaption).toContain('caption: [A photo]')
    })

    it('emits table via #table', () => {
        const src = renderToContentTyp(
            <Table
                headers={['H1', 'H2']}
                rows={[['a', 'b'], ['c', 'd']]}
                columns={2}
            />,
        )
        expect(src).toContain('#table(')
        expect(src).toContain('columns: 2')
        // header + 2 body rows × 2 cells = 6 cells
        const cellMatches = src.match(/\[.+?\]/g)
        expect(cellMatches?.length).toBeGreaterThanOrEqual(6)
    })

    it('emits asterism as a preamble call', () => {
        const src = renderToContentTyp(<Asterism />)
        expect(src).toContain('#section-break()')
    })

    it('emits raw typst verbatim', () => {
        const src = renderToContentTyp(<Raw>{'#my-custom(x: 1)'}</Raw>)
        expect(src).toContain('#my-custom(x: 1)')
    })

    it('escapes typst metacharacters in prose text', () => {
        const src = renderToContentTyp(
            <Paragraph>Price is $100; see #1; use @mention.</Paragraph>,
        )
        expect(src).toContain('\\$100')
        expect(src).toContain('\\#1')
        expect(src).toContain('\\@mention')
    })

    it('renders a full sequence of mixed elements', () => {
        const sequence = [
            { type: 'heading', level: 2, text: 'Intro' },
            { type: 'paragraph', text: 'A <strong>bold</strong> claim.' },
            { type: 'codeBlock', text: 'x = 1', attrs: { language: 'py' } },
            {
                type: 'list',
                style: 'bullet',
                children: ['first', 'second'],
            },
        ]
        const src = renderToContentTyp(<Sequence data={sequence} />)
        expect(src).toContain('== Intro')
        expect(src).toContain('*bold*')
        expect(src).toContain('```py')
        expect(src).toContain('- first')
    })
})

describe('typst adapter: buildBundle', () => {
    it('emits the five bundle files', () => {
        const bundle = buildBundle({ sections: [], metadata: null })
        expect(Object.keys(bundle).sort()).toEqual([
            'content.typ',
            'main.typ',
            'meta.typ',
            'preamble.typ',
            'template.typ',
        ])
    })

    it('main.typ imports template and meta', () => {
        const { 'main.typ': main } = buildBundle({ sections: [] })
        expect(main).toContain('#import "template.typ": template')
        expect(main).toContain('#import "meta.typ"')
        expect(main).toContain('#include "content.typ"')
    })

    it('meta.typ emits known metadata fields as a dict', () => {
        const { 'meta.typ': meta } = buildBundle({
            sections: [],
            metadata: {
                title: 'The Uniweb Framework',
                author: 'Diego Macrini',
                isbn: '978-1-23456-789-0',
                tocDepth: 3,
            },
        })
        expect(meta).toContain('#let meta = (')
        expect(meta).toContain('title: "The Uniweb Framework"')
        expect(meta).toContain('author: "Diego Macrini"')
        expect(meta).toContain('isbn: "978-1-23456-789-0"')
        expect(meta).toContain('toc_depth: 3')
    })

    it('meta.typ escapes backslashes and quotes in strings', () => {
        const { 'meta.typ': meta } = buildBundle({
            sections: [],
            metadata: { title: 'He said "hi" \\ there' },
        })
        expect(meta).toContain('\\\\')
        expect(meta).toContain('\\"hi\\"')
    })

    it('meta.typ converts camelCase keys to snake_case identifiers', () => {
        const { 'meta.typ': meta } = buildBundle({
            sections: [],
            metadata: { coverImage: '/c.jpg', tocDepth: 2 },
        })
        expect(meta).toContain('cover_image:')
        expect(meta).toContain('toc_depth: 2')
    })

    it('options.meta overrides metadata role', () => {
        const { 'meta.typ': meta } = buildBundle(
            { sections: [], metadata: { title: 'from role' } },
            { meta: { title: 'from options' } },
        )
        expect(meta).toContain('title: "from options"')
        expect(meta).not.toContain('from role')
    })

    it('foundation preamble and template override defaults', () => {
        const bundle = buildBundle(
            { sections: [] },
            {
                preamble: '// FOUNDATION PREAMBLE MARKER',
                template: '// FOUNDATION TEMPLATE MARKER',
            },
        )
        expect(bundle['preamble.typ']).toContain('FOUNDATION PREAMBLE MARKER')
        expect(bundle['template.typ']).toContain('FOUNDATION TEMPLATE MARKER')
    })

    it('content.typ splits sections with comment markers', () => {
        const p1 = htmlToIR(
            ReactDOMServer.renderToStaticMarkup(
                <Paragraph>First section</Paragraph>,
            ),
        )
        const p2 = htmlToIR(
            ReactDOMServer.renderToStaticMarkup(
                <Paragraph>Second section</Paragraph>,
            ),
        )
        const { 'content.typ': content } = buildBundle({
            sections: [p1, p2],
        })
        expect(content).toContain('// --- section 1 ---')
        expect(content).toContain('// --- section 2 ---')
        expect(content).toContain('First section')
        expect(content).toContain('Second section')
    })
})

describe('typst adapter: compileTypst (sources mode)', () => {
    it('returns a zip Blob', async () => {
        const blob = await compileTypst(
            { sections: [], metadata: { title: 'Test' } },
            { mode: 'sources' },
        )
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/zip')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('rejects unimplemented wasm mode with a helpful message', async () => {
        await expect(
            compileTypst({ sections: [] }, { mode: 'wasm' }),
        ).rejects.toThrow(/not yet implemented/i)
    })

    it('rejects unknown modes with a list of valid ones', async () => {
        await expect(
            compileTypst({ sections: [] }, { mode: 'bogus' }),
        ).rejects.toThrow(/unknown mode "bogus"/i)
    })

    it('server mode POSTs a multipart bundle to the endpoint', async () => {
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
            const blob = await compileTypst(
                { sections: [], metadata: { title: 'T' } },
                { mode: 'server', endpoint: 'https://example.test/compile' },
            )
            // jsdom Blob vs undici Blob: instanceof is unreliable — duck-type instead.
            expect(typeof blob.size).toBe('number')
            expect(blob.size).toBeGreaterThan(0)
            expect(blob.type).toBe('application/pdf')
            expect(captured.url).toBe('https://example.test/compile')
            expect(captured.init.method).toBe('POST')
            expect(captured.init.body).toBeInstanceOf(FormData)
            const formKeys = [...captured.init.body.keys()].sort()
            expect(formKeys).toEqual([
                'content.typ',
                'main.typ',
                'meta.typ',
                'preamble.typ',
                'template.typ',
            ])
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('server mode propagates non-200 responses as errors', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () =>
            new Response('typst crashed', { status: 500, statusText: 'Server Error' })
        try {
            await expect(
                compileTypst({ sections: [] }, { mode: 'server', endpoint: '/x' }),
            ).rejects.toThrow(/500.*Server Error.*typst crashed/s)
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('server mode reports network failures with a helpful message', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () => {
            throw new Error('ECONNREFUSED')
        }
        try {
            await expect(
                compileTypst({ sections: [] }, { mode: 'server', endpoint: '/x' }),
            ).rejects.toThrow(/Is the dev server.*ECONNREFUSED/s)
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
