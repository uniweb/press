import { describe, it, expect } from 'vitest'
import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { htmlToIR } from '../../src/ir/parser.js'
import { Paragraph, TextRun, H1, H2, H3, H4, Section } from '../../src/react/components/index.js'

/**
 * Helper: render a component to static HTML, then parse to IR.
 * This tests the full pipeline: JSX → HTML → IR (the exact flow that
 * the docx adapter will consume).
 */
function renderToIR(element) {
    const html = ReactDOMServer.renderToStaticMarkup(element)
    return { html, ir: htmlToIR(html) }
}

describe('TextRun', () => {
    it('renders a span with data-type="text"', () => {
        const { ir } = renderToIR(<TextRun>Hello</TextRun>)
        expect(ir[0]).toMatchObject({ type: 'text', content: 'Hello' })
    })

    it('renders bold attribute', () => {
        const { ir } = renderToIR(<TextRun bold>Bold text</TextRun>)
        expect(ir[0]).toMatchObject({ type: 'text', bold: 'true' })
    })

    it('renders italic attribute', () => {
        const { ir } = renderToIR(<TextRun italics>Italic text</TextRun>)
        expect(ir[0]).toMatchObject({ type: 'text', italics: 'true' })
    })

    it('renders underline attribute', () => {
        const { ir } = renderToIR(<TextRun underline>Underlined</TextRun>)
        expect(ir[0]).toMatchObject({ type: 'text', underline: {} })
    })

    it('renders multiple marks together', () => {
        const { ir } = renderToIR(
            <TextRun bold italics underline>
                All marks
            </TextRun>,
        )
        expect(ir[0]).toMatchObject({
            type: 'text',
            bold: 'true',
            italics: 'true',
            underline: {},
        })
    })

    it('passes through extra data-* attributes', () => {
        const { ir } = renderToIR(
            <TextRun data-positionaltab-alignment="right">Tabbed</TextRun>,
        )
        expect(ir[0]).toMatchObject({
            type: 'text',
            positionalTab: { alignment: 'right' },
        })
    })
})

describe('Paragraph', () => {
    it('renders a p with data-type="paragraph"', () => {
        const { ir } = renderToIR(<Paragraph>Hello</Paragraph>)
        expect(ir[0]).toMatchObject({
            type: 'paragraph',
            children: [{ type: 'text', content: 'Hello' }],
        })
    })

    it('supports the "as" prop for alternate tags', () => {
        const { html } = renderToIR(<Paragraph as="div">In a div</Paragraph>)
        expect(html).toContain('<div')
    })

    it('passes through data-spacing-* attributes', () => {
        const { ir } = renderToIR(
            <Paragraph data-spacing-before="200" data-spacing-after="100">
                Spaced
            </Paragraph>,
        )
        expect(ir[0]).toMatchObject({
            type: 'paragraph',
            spacing: { before: '200', after: '100' },
        })
    })

    it('passes through data-bullet-level attribute', () => {
        const { ir } = renderToIR(
            <Paragraph data-bullet-level="0">Bullet item</Paragraph>,
        )
        expect(ir[0]).toMatchObject({
            type: 'paragraph',
            bullet: { level: '0' },
        })
    })
})

describe('Headings', () => {
    it('H1 renders with data-heading="HEADING_1"', () => {
        const { ir } = renderToIR(<H1>Title</H1>)
        expect(ir[0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_1',
        })
    })

    it('H2 renders with data-heading="HEADING_2"', () => {
        const { ir } = renderToIR(<H2>Subtitle</H2>)
        expect(ir[0]).toMatchObject({ heading: 'HEADING_2' })
    })

    it('H3 renders with data-heading="HEADING_3"', () => {
        const { ir } = renderToIR(<H3>Section</H3>)
        expect(ir[0]).toMatchObject({ heading: 'HEADING_3' })
    })

    it('H4 renders with data-heading="HEADING_4"', () => {
        const { ir } = renderToIR(<H4>Subsection</H4>)
        expect(ir[0]).toMatchObject({ heading: 'HEADING_4' })
    })

    it('passes through extra data-* attributes', () => {
        const { ir } = renderToIR(
            <H1 data-spacing-after="200">Title</H1>,
        )
        expect(ir[0]).toMatchObject({
            heading: 'HEADING_1',
            spacing: { after: '200' },
        })
    })
})

describe('Section', () => {
    it('renders a <section> wrapper (no data-type — transparent to IR)', () => {
        const { html, ir } = renderToIR(
            <Section>
                <Paragraph>Content</Paragraph>
            </Section>,
        )
        expect(html).toContain('<section')
        // Section becomes a bare <section> in IR (no data-type), wrapping
        // the paragraph child.
        expect(ir[0].type).toBe('section')
        expect(ir[0].children[0].type).toBe('paragraph')
    })

    it('applies default max-width classes', () => {
        const { html } = renderToIR(<Section>x</Section>)
        expect(html).toContain('mx-auto')
        expect(html).toContain('max-w-4xl')
    })

    it('appends custom className', () => {
        const { html } = renderToIR(<Section className="py-8">x</Section>)
        expect(html).toContain('py-8')
        expect(html).toContain('mx-auto')
    })
})

describe('full pipeline: components → IR → docx adapter', () => {
    it('a complete report section renders to valid IR for the docx adapter', () => {
        const { ir } = renderToIR(
            <>
                <H1>Annual Research Funding</H1>
                <Paragraph data-spacing-after="100">
                    Summary of grants awarded in 2025.
                </Paragraph>
                <Paragraph as="div" data-type="table">
                    <Paragraph as="div" data-type="tableRow">
                        <Paragraph
                            as="div"
                            data-type="tableCell"
                            data-width-size="50"
                            data-width-type="pct"
                        >
                            <Paragraph>
                                <TextRun bold>Source</TextRun>
                            </Paragraph>
                        </Paragraph>
                        <Paragraph
                            as="div"
                            data-type="tableCell"
                            data-width-size="50"
                            data-width-type="pct"
                        >
                            <Paragraph>
                                <TextRun bold>Amount</TextRun>
                            </Paragraph>
                        </Paragraph>
                    </Paragraph>
                </Paragraph>
            </>,
        )

        // Heading
        expect(ir[0]).toMatchObject({ type: 'paragraph', heading: 'HEADING_1' })
        // Summary
        expect(ir[1]).toMatchObject({
            type: 'paragraph',
            spacing: { after: '100' },
        })
        // Table
        expect(ir[2].type).toBe('table')
        expect(ir[2].children[0].type).toBe('tableRow')
        expect(ir[2].children[0].children).toHaveLength(2)
        expect(ir[2].children[0].children[0].type).toBe('tableCell')
    })
})
