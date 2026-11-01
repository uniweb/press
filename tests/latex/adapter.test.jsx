import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import JSZip from 'jszip'
import { htmlToIR } from '../../src/ir/parser.js'
import { buildBundle, compileLatex } from '../../src/adapters/latex.js'
import {
    TextRun,
    Paragraph,
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
    markRawLatex,
    RAW_BEGIN,
    RAW_END,
} from '../../src/latex/index.js'

/**
 * End-to-end helper: render JSX → HTML → IR → bundle.
 * Returns the bundle's content.tex output for inspection.
 */
function renderToContentTex(element) {
    const html = ReactDOMServer.renderToStaticMarkup(element)
    const ir = htmlToIR(html)
    const bundle = buildBundle({ sections: [ir], metadata: null })
    return bundle['content.tex']
}

describe('latex adapter: IR → LaTeX source', () => {
    it('emits a heading at the right book-class level', () => {
        const ch = renderToContentTex(<Heading level={1} data="A" />)
        expect(ch).toContain('\\chapter{A}')
        const sec = renderToContentTex(<Heading level={2} data="B" />)
        expect(sec).toContain('\\section{B}')
        const sub = renderToContentTex(<Heading level={3} data="C" />)
        expect(sub).toContain('\\subsection{C}')
        const subsub = renderToContentTex(<Heading level={4} data="D" />)
        expect(subsub).toContain('\\subsubsection{D}')
    })

    it('keeps the space between two marks, and prints inline code as code', () => {
        const src = renderToContentTex(
            <Paragraph data={'<strong>bold</strong> <em>italic</em> and <code>uniweb dev</code> <strong>now</strong>'} />,
        )
        expect(src).toContain('\\textbf{bold} \\emph{italic} and \\texttt{uniweb dev} \\textbf{now}')
    })

    it('emits a paragraph as plain text', () => {
        const src = renderToContentTex(<Paragraph>Hello world.</Paragraph>)
        expect(src).toContain('Hello world.')
    })

    it('wraps bold / italic inline marks (parseStyledString path)', () => {
        const src = renderToContentTex(
            <Paragraph data="See <strong>bold</strong> and <em>italic</em>." />,
        )
        expect(src).toContain('\\textbf{bold}')
        expect(src).toContain('\\emph{italic}')
    })

    it('wraps inline code via TextRun code', () => {
        // parseStyledString does not recognize <code> tags; foundations
        // that want \\texttt for inline code use <TextRun code>{...}.
        // The IR walker honours the data-code="true" attribute it emits.
        const src = renderToContentTex(
            <Paragraph>
                Use <TextRun code>{'fn()'}</TextRun> to call.
            </Paragraph>,
        )
        expect(src).toContain('\\texttt{fn()}')
    })

    it('emits links via \\href', () => {
        const src = renderToContentTex(
            <Paragraph data='See <a href="https://example.com">the docs</a>.' />,
        )
        expect(src).toContain('\\href{https://example.com}')
        expect(src).toContain('the docs')
    })

    it('emits a chapter-opener call into the foundation preamble', () => {
        const src = renderToContentTex(
            <ChapterOpener number={3} title="The Ecosystem" subtitle="A brief survey" />,
        )
        expect(src).toContain('\\chapteropener{3}{The Ecosystem}{A brief survey}')
    })

    it('emits a code block as verbatim', () => {
        const src = renderToContentTex(
            <CodeBlock language="jsx">{'const x = 1'}</CodeBlock>,
        )
        expect(src).toContain('\\begin{verbatim}')
        expect(src).toContain('const x = 1')
        expect(src).toContain('\\end{verbatim}')
    })

    it('emits bullet list items via itemize', () => {
        const src = renderToContentTex(
            <BulletList items={['one', 'two']} />,
        )
        expect(src).toContain('\\begin{itemize}')
        expect(src).toContain('\\item one')
        expect(src).toContain('\\item two')
        expect(src).toContain('\\end{itemize}')
    })

    it('emits numbered list items via enumerate', () => {
        const src = renderToContentTex(<NumberedList items={['a', 'b']} />)
        expect(src).toContain('\\begin{enumerate}')
        expect(src).toContain('\\item a')
        expect(src).toContain('\\item b')
        expect(src).toContain('\\end{enumerate}')
    })

    it('emits blockquote via \\begin{quotation}', () => {
        const src = renderToContentTex(
            <BlockQuote>
                <Paragraph>Quoted text.</Paragraph>
            </BlockQuote>,
        )
        expect(src).toContain('\\begin{quotation}')
        expect(src).toContain('Quoted text.')
        expect(src).toContain('\\end{quotation}')
    })

    it('emits image via \\includegraphics, wrapped in figure when caption is set', () => {
        const withoutCaption = renderToContentTex(<Image src="/photo.jpg" />)
        expect(withoutCaption).toContain('\\includegraphics{/photo.jpg}')
        expect(withoutCaption).not.toContain('\\begin{figure}')

        const withCaption = renderToContentTex(
            <Image src="/photo.jpg" caption="A photo" width="400" />,
        )
        expect(withCaption).toContain('\\begin{figure}')
        expect(withCaption).toContain('\\includegraphics[width=400pt]{/photo.jpg}')
        expect(withCaption).toContain('\\caption{A photo}')
        expect(withCaption).toContain('\\end{figure}')
    })

    it('fetches inline body images via loadAsset and rewrites the path to assets/<hash>.<ext>', async () => {
        const ir = htmlToIR(
            ReactDOMServer.renderToStaticMarkup(<Image src="mitosis.png" />),
        )
        // Minimal valid PNG header so detectMime picks image/png.
        const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
        const loadAsset = async (src) => (src === 'mitosis.png' ? pngBytes : null)

        const blob = await compileLatex(
            { sections: [ir], metadata: null },
            { mode: 'sources', loadAsset },
        )
        const zip = await JSZip.loadAsync(blob)

        const assetPaths = Object.keys(zip.files).filter(
            (p) => p.startsWith('assets/') && !zip.files[p].dir,
        )
        expect(assetPaths).toHaveLength(1)
        expect(assetPaths[0]).toMatch(/^assets\/[0-9a-f]+\.png$/)

        const contentTex = await zip.file('content.tex').async('string')
        expect(contentTex).toContain(`\\includegraphics{${assetPaths[0]}}`)
        expect(contentTex).not.toContain('\\includegraphics{mitosis.png}')
    })

    it('leaves the image path untouched when no bytes can be loaded', async () => {
        const ir = htmlToIR(
            ReactDOMServer.renderToStaticMarkup(<Image src="mitosis.png" />),
        )
        const blob = await compileLatex({ sections: [ir], metadata: null }, { mode: 'sources' })
        const zip = await JSZip.loadAsync(blob)

        expect(
            Object.keys(zip.files).filter((p) => p.startsWith('assets/') && !zip.files[p].dir),
        ).toHaveLength(0)
        const contentTex = await zip.file('content.tex').async('string')
        expect(contentTex).toContain('\\includegraphics{mitosis.png}')
    })

    it('emits table via tabular', () => {
        const src = renderToContentTex(
            <Table
                headers={['H1', 'H2']}
                rows={[['a', 'b'], ['c', 'd']]}
                columns={2}
            />,
        )
        expect(src).toContain('\\begin{tabular}{ll}')
        expect(src).toContain('H1 & H2 \\\\')
        expect(src).toContain('a & b \\\\')
        expect(src).toContain('c & d \\\\')
        expect(src).toContain('\\end{tabular}')
    })

    it('emits asterism as a preamble call', () => {
        const src = renderToContentTex(<Asterism />)
        expect(src).toContain('\\sectionbreak')
    })

    it('emits raw latex verbatim', () => {
        const src = renderToContentTex(<Raw>{'\\printbibliography'}</Raw>)
        expect(src).toContain('\\printbibliography')
    })

    it('passes raw-latex sentinels through unescaped', () => {
        // Foundation use case: substituting \cite{key} into a paragraph's
        // text. Without sentinels, escapeLatexInline would mangle the
        // backslash and braces.
        const sentinelled = `Building on theory ${markRawLatex('\\cite{coase1960}')} and ${markRawLatex('\\cite[132]{squirrel2024}')}.`
        const src = renderToContentTex(<Paragraph data={sentinelled} />)
        expect(src).toContain('\\cite{coase1960}')
        expect(src).toContain('\\cite[132]{squirrel2024}')
        // Sentinel chars themselves must not survive into output.
        expect(src).not.toContain(RAW_BEGIN)
        expect(src).not.toContain(RAW_END)
    })

    it('still escapes regular characters around raw-latex sections', () => {
        const sentinelled = `100% & growing — see ${markRawLatex('\\cite{x}')}.`
        const src = renderToContentTex(<Paragraph data={sentinelled} />)
        expect(src).toContain('100\\%')
        expect(src).toContain('\\&')
        expect(src).toContain('\\cite{x}')
    })

    it('escapes latex-special characters in prose text', () => {
        const src = renderToContentTex(
            <Paragraph>{'Cost: $100 + 5% & ~tilde with #hash and {braces}.'}</Paragraph>,
        )
        expect(src).toContain('\\$100')
        expect(src).toContain('\\%')
        expect(src).toContain('\\&')
        expect(src).toContain('\\textasciitilde{}')
        expect(src).toContain('\\#hash')
        expect(src).toContain('\\{braces\\}')
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
        const src = renderToContentTex(<Sequence data={sequence} />)
        expect(src).toContain('\\section{Intro}')
        expect(src).toContain('\\textbf{bold}')
        expect(src).toContain('\\begin{verbatim}')
        expect(src).toContain('\\item first')
    })
})

describe('latex adapter: buildBundle', () => {
    it('emits the five bundle files', () => {
        const bundle = buildBundle({ sections: [], metadata: null })
        expect(Object.keys(bundle).sort()).toEqual([
            'content.tex',
            'main.tex',
            'meta.tex',
            'preamble.tex',
            'template.tex',
        ])
    })

    it('main.tex \\inputs template, preamble, meta, and content', () => {
        const { 'main.tex': main } = buildBundle({ sections: [] })
        expect(main).toContain('\\input{template}')
        expect(main).toContain('\\input{preamble}')
        expect(main).toContain('\\input{meta}')
        expect(main).toContain('\\begin{document}')
        expect(main).toContain('\\input{content}')
        expect(main).toContain('\\end{document}')
    })

    it('meta.tex emits known metadata fields as namespaced macros', () => {
        const { 'meta.tex': meta } = buildBundle({
            sections: [],
            metadata: {
                title: 'On Door-Closing',
                author: 'A. Squirrel',
                isbn: '978-1-23456-789-0',
                tocDepth: 3,
            },
        })
        expect(meta).toContain('\\makeatletter')
        expect(meta).toContain('\\def\\unimeta@title{On Door-Closing}')
        expect(meta).toContain('\\def\\unimeta@author{A. Squirrel}')
        expect(meta).toContain('\\def\\unimeta@isbn{978-1-23456-789-0}')
        expect(meta).toContain('\\def\\unimeta@tocdepth{3}')
        expect(meta).toContain('\\makeatother')
    })

    it('meta.tex escapes latex-special characters in metadata strings', () => {
        const { 'meta.tex': meta } = buildBundle({
            sections: [],
            metadata: { title: 'Cost & 5% — see #1' },
        })
        expect(meta).toContain('\\&')
        expect(meta).toContain('\\%')
        expect(meta).toContain('\\#1')
    })

    it('options.meta overrides metadata role', () => {
        const { 'meta.tex': meta } = buildBundle(
            { sections: [], metadata: { title: 'from role' } },
            { meta: { title: 'from options' } },
        )
        expect(meta).toContain('\\def\\unimeta@title{from options}')
        expect(meta).not.toContain('from role')
    })

    it('foundation preamble and template override defaults', () => {
        const bundle = buildBundle(
            { sections: [] },
            {
                preamble: '% FOUNDATION PREAMBLE MARKER',
                template: '% FOUNDATION TEMPLATE MARKER',
            },
        )
        expect(bundle['preamble.tex']).toContain('FOUNDATION PREAMBLE MARKER')
        expect(bundle['template.tex']).toContain('FOUNDATION TEMPLATE MARKER')
    })

    it('content.tex splits sections with comment markers', () => {
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
        const { 'content.tex': content } = buildBundle({
            sections: [p1, p2],
        })
        expect(content).toContain('% --- section 1 ---')
        expect(content).toContain('% --- section 2 ---')
        expect(content).toContain('First section')
        expect(content).toContain('Second section')
    })

    it('passes through extra assets (e.g. refs.bib)', () => {
        const bundle = buildBundle(
            { sections: [] },
            {
                assets: {
                    'refs.bib': '@book{darwin1859, ...}',
                    'images/fig.png': new Uint8Array([1, 2, 3]),
                },
            },
        )
        expect(bundle['refs.bib']).toContain('@book{darwin1859')
        expect(bundle['images/fig.png']).toBeInstanceOf(Uint8Array)
    })
})

describe('latex adapter: compileLatex (sources mode)', () => {
    it('returns a zip Blob', async () => {
        const blob = await compileLatex(
            { sections: [], metadata: { title: 'Test' } },
            { mode: 'sources' },
        )
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('application/zip')
        expect(blob.size).toBeGreaterThan(0)
    })

    it('rejects unknown modes with a list of valid ones', async () => {
        await expect(
            compileLatex({ sections: [] }, { mode: 'bogus' }),
        ).rejects.toThrow(/unknown mode "bogus"/i)
    })

    it('server mode POSTs a multipart bundle to the endpoint', async () => {
        const originalFetch = globalThis.fetch
        let captured = null
        globalThis.fetch = async (url, init) => {
            captured = { url, init }
            return new Response(
                new Blob([new Uint8Array([0x25, 0x50, 0x44, 0x46])]),
                {
                    status: 200,
                    headers: { 'content-type': 'application/pdf' },
                },
            )
        }
        try {
            const blob = await compileLatex(
                { sections: [], metadata: { title: 'T' } },
                {
                    mode: 'server',
                    endpoint: 'https://example.test/compile',
                },
            )
            expect(typeof blob.size).toBe('number')
            expect(blob.size).toBeGreaterThan(0)
            expect(blob.type).toBe('application/pdf')
            expect(captured.url).toBe('https://example.test/compile')
            expect(captured.init.method).toBe('POST')
            expect(captured.init.body).toBeInstanceOf(FormData)
            const formKeys = [...captured.init.body.keys()].sort()
            expect(formKeys).toEqual([
                'content.tex',
                'main.tex',
                'meta.tex',
                'preamble.tex',
                'template.tex',
            ])
        } finally {
            globalThis.fetch = originalFetch
        }
    })

    it('server mode propagates non-200 responses as errors', async () => {
        const originalFetch = globalThis.fetch
        globalThis.fetch = async () =>
            new Response('latexmk crashed', {
                status: 500,
                statusText: 'Server Error',
            })
        try {
            await expect(
                compileLatex(
                    { sections: [] },
                    { mode: 'server', endpoint: '/x' },
                ),
            ).rejects.toThrow(/500.*Server Error.*latexmk crashed/s)
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
                compileLatex(
                    { sections: [] },
                    { mode: 'server', endpoint: '/x' },
                ),
            ).rejects.toThrow(/Is the dev server.*ECONNREFUSED/s)
        } finally {
            globalThis.fetch = originalFetch
        }
    })
})
