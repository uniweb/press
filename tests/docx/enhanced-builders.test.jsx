/**
 * Tests for the enhanced /docx builders: Image (bare), Caption, Figure,
 * Table/Tr/Td, BulletList, NumberedList.
 *
 * The pattern mirrors components.test.jsx — render each builder to
 * static HTML, parse to IR, assert the IR shape that the docx adapter
 * sees. A handful of cases feed the adapter end-to-end to confirm the
 * Blob produced is a valid docx envelope (PK magic bytes).
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import {
    Image,
    Caption,
    Figure,
    Table,
    Tr,
    Td,
    BulletList,
    NumberedList,
    Paragraph,
    TextRun,
} from '../../src/docx/index.js'

function renderToIR(element) {
    const html = ReactDOMServer.renderToStaticMarkup(element)
    return { html, ir: htmlToIR(html) }
}

describe('Image (bare)', () => {
    it('emits a top-level image IR node', () => {
        const { ir } = renderToIR(
            <Image data={{ url: '/cover.png', alt: 'cover' }} width={600} height={400} />,
        )
        expect(ir).toHaveLength(1)
        expect(ir[0]).toMatchObject({
            type: 'image',
            src: '/cover.png',
            transformation: { width: '600', height: '400' },
            altText: { description: 'cover' },
        })
    })

    it('accepts a string URL as data', () => {
        const { ir } = renderToIR(<Image data="/finch.png" />)
        expect(ir[0]).toMatchObject({ type: 'image', src: '/finch.png' })
    })

    it('renders nothing when data is missing', () => {
        const { ir } = renderToIR(<Image />)
        expect(ir).toHaveLength(0)
    })
})

describe('Image basePath resolution', () => {
    it('prefixes site-absolute URLs with the provider basePath', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/templates/monograph">
                <Image data="/images/finch.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({
            type: 'image',
            src: '/templates/monograph/images/finch.png',
        })
    })

    it('leaves external URLs untouched', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/docs">
                <Image data="https://cdn.example.com/logo.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({ src: 'https://cdn.example.com/logo.png' })
    })

    it('leaves protocol-relative URLs untouched', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/docs">
                <Image data="//cdn.example.com/logo.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({ src: '//cdn.example.com/logo.png' })
    })

    it('leaves relative URLs untouched', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/docs">
                <Image data="./local.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({ src: './local.png' })
    })

    it('does not double-prefix URLs already under basePath', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/docs">
                <Image data="/docs/images/finch.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({ src: '/docs/images/finch.png' })
    })

    it('renders absolute URLs verbatim when no basePath is provided', () => {
        const { ir } = renderToIR(
            <DocumentProvider>
                <Image data="/images/finch.png" />
            </DocumentProvider>,
        )
        expect(ir[0]).toMatchObject({ src: '/images/finch.png' })
    })

    it('propagates basePath through <Figure>', () => {
        const { ir } = renderToIR(
            <DocumentProvider basePath="/templates/monograph">
                <Figure src="/images/finch.png" alt="finch" caption="A finch." />
            </DocumentProvider>,
        )
        const image = ir.find((n) => n.type === 'image')
        expect(image).toMatchObject({ src: '/templates/monograph/images/finch.png' })
    })
})

describe('basePath survives the compile pipeline', () => {
    // Regression: the bug where `useDocumentOutput` captured a fragment
    // during a page render wrapped in DocumentProvider, but
    // `compileOutputs` re-rendered the fragment via renderToStaticMarkup
    // with no context — so <Image> fell back to BasePathContext's default
    // ('') and emitted un-prefixed URLs. The docx adapter's `fetch()`
    // then 404'd on every image under a subdirectory deployment.
    it('compileOutputs re-provides BasePathContext to registered fragments', async () => {
        const { render } = await import('@testing-library/react')
        const { DocumentContext } = await import('../../src/DocumentContext.js')
        const { useDocumentOutput } = await import('../../src/useDocumentOutput.js')
        const { compileOutputs } = await import('../../src/ir/compile.js')

        function ImageSection({ block }) {
            // Fragment captured here inherits BasePathContext only as
            // React data — the element tree, not rendered output. The
            // compile pipeline must re-provide context when it renders.
            const fragment = <Figure src="/images/finch.png" alt="finch" />
            useDocumentOutput(block, 'docx', fragment)
            return null
        }

        let store = null
        function StoreCapture() {
            store = React.useContext(DocumentContext)
            return null
        }
        const block = {}

        render(
            <DocumentProvider basePath="/templates/monograph">
                <StoreCapture />
                <ImageSection block={block} />
            </DocumentProvider>,
        )

        const { sections } = compileOutputs(store, 'docx')
        const image = sections[0].find((n) => n.type === 'image')
        expect(image.src).toBe('/templates/monograph/images/finch.png')
    })
})

describe('Caption', () => {
    it('emits a paragraph IR node with style="caption"', () => {
        const { ir } = renderToIR(<Caption>Figure 1. A Galapagos finch.</Caption>)
        expect(ir[0]).toMatchObject({ type: 'paragraph', style: 'caption' })
        expect(ir[0].children[0]).toMatchObject({
            type: 'text',
            content: 'Figure 1. A Galapagos finch.',
        })
    })

    it('accepts data prop with inline marks', () => {
        const { ir } = renderToIR(
            <Caption data="Genus <em>Geospiza</em>, ground finch." />,
        )
        expect(ir[0].style).toBe('caption')
        // parseStyledString produces one plain text run and one italic run.
        const texts = ir[0].children.filter((c) => c.type === 'text')
        expect(texts.some((t) => t.italics === 'true')).toBe(true)
    })
})

describe('Figure', () => {
    it('emits image + caption as sibling section-level IR nodes (contentWrapper dissolves)', () => {
        const { ir } = renderToIR(
            <Figure
                src="/galapagos.png"
                alt="Galapagos aerial"
                width={600}
                height={400}
                caption="Figure 2. Aerial view of the islands."
            />,
        )
        // contentWrapper flattens so image and caption are siblings.
        expect(ir).toHaveLength(2)
        expect(ir[0]).toMatchObject({ type: 'image', src: '/galapagos.png' })
        expect(ir[1]).toMatchObject({ type: 'paragraph', style: 'caption' })
    })

    it('renders just an image when caption is omitted', () => {
        const { ir } = renderToIR(<Figure src="/x.png" alt="x" />)
        expect(ir).toHaveLength(1)
        expect(ir[0].type).toBe('image')
    })

    it('accepts custom children in place of the default image+caption', () => {
        const { ir } = renderToIR(
            <Figure>
                <Image data="/a.png" />
                <Caption>custom</Caption>
            </Figure>,
        )
        expect(ir).toHaveLength(2)
        expect(ir[0].type).toBe('image')
        expect(ir[1].style).toBe('caption')
    })
})

describe('Table / Tr / Td', () => {
    it('emits table/tableRow/tableCell IR with widths from context', () => {
        const { ir } = renderToIR(
            <Table widths={[20, 60, 20]}>
                <Tr header>
                    <Td>Year</Td>
                    <Td>Location</Td>
                    <Td>Count</Td>
                </Tr>
                <Tr>
                    <Td>1835</Td>
                    <Td>Española</Td>
                    <Td>12</Td>
                </Tr>
            </Table>,
        )
        const table = ir[0]
        expect(table.type).toBe('table')
        expect(table.children).toHaveLength(2)

        const headerRow = table.children[0]
        expect(headerRow.type).toBe('tableRow')
        expect(headerRow.children[0]).toMatchObject({
            type: 'tableCell',
            width: { size: '20', type: 'pct' },
            borders: { bottom: { style: 'single', size: '6', color: 'cccccc' } },
        })
        expect(headerRow.children[1].width.size).toBe('60')
        expect(headerRow.children[2].width.size).toBe('20')

        // Header cells wrap strings with a bold TextRun.
        const firstHeaderCell = headerRow.children[0]
        expect(firstHeaderCell.children[0].children[0]).toMatchObject({
            type: 'text',
            bold: 'true',
            content: 'Year',
        })

        // Data row cell text is not bold.
        const firstDataCell = table.children[1].children[0]
        expect(firstDataCell.children[0].children[0]).toMatchObject({
            type: 'text',
            content: '1835',
        })
        expect(firstDataCell.children[0].children[0].bold).toBeUndefined()
    })

    it('allows explicit per-cell width to override Table.widths', () => {
        const { ir } = renderToIR(
            <Table widths={[30, 70]}>
                <Tr>
                    <Td width={50}>a</Td>
                    <Td>b</Td>
                </Tr>
            </Table>,
        )
        const cells = ir[0].children[0].children
        expect(cells[0].width.size).toBe('50')
        expect(cells[1].width.size).toBe('70')
    })

    it('passes complex children through without wrapping them in a Paragraph', () => {
        const { ir } = renderToIR(
            <Table widths={[100]}>
                <Tr>
                    <Td>
                        <Paragraph>
                            <TextRun bold>Bold</TextRun> plain
                        </Paragraph>
                    </Td>
                </Tr>
            </Table>,
        )
        const cell = ir[0].children[0].children[0]
        expect(cell.children).toHaveLength(1)
        expect(cell.children[0].type).toBe('paragraph')
    })

    it('allows borderBottom="none" to disable the row separator', () => {
        const { ir } = renderToIR(
            <Table widths={[100]}>
                <Tr>
                    <Td borderBottom="none">x</Td>
                </Tr>
            </Table>,
        )
        const cell = ir[0].children[0].children[0]
        expect(cell.borders.bottom.style).toBe('none')
    })
})

describe('BulletList', () => {
    it('emits one paragraph per item with bullet level', () => {
        const { ir } = renderToIR(
            <BulletList items={['finch', 'tortoise', 'mockingbird']} />,
        )
        expect(ir).toHaveLength(3)
        for (const node of ir) {
            expect(node.type).toBe('paragraph')
            expect(node.bullet).toEqual({ level: '0' })
        }
    })

    it('accepts level prop for nesting', () => {
        const { ir } = renderToIR(<BulletList items={['a', 'b']} level={2} />)
        expect(ir[0].bullet.level).toBe('2')
    })

    it('renders nothing for an empty list', () => {
        const { ir } = renderToIR(<BulletList items={[]} />)
        expect(ir).toHaveLength(0)
    })
})

describe('NumberedList', () => {
    it('emits paragraphs with numbering reference + level', () => {
        const { ir } = renderToIR(<NumberedList items={['first', 'second']} />)
        expect(ir).toHaveLength(2)
        for (const node of ir) {
            expect(node.type).toBe('paragraph')
            expect(node.numbering).toMatchObject({
                reference: 'decimal-numbering',
                level: '0',
            })
        }
    })

    it('accepts a custom numbering reference', () => {
        const { ir } = renderToIR(
            <NumberedList items={['a']} reference="chapter-numbering" level={1} />,
        )
        expect(ir[0].numbering).toMatchObject({
            reference: 'chapter-numbering',
            level: '1',
        })
    })
})
