/**
 * Integration test: Full pipeline from React components to .docx buffer.
 *
 * Exercises: builder components → renderToStaticMarkup → htmlToIR →
 * buildDocument → Packer.toBuffer → verify valid docx ZIP.
 *
 * This is the phase 1 exit criterion: a foundation author can build
 * section components with the builder API, and the resulting JSX produces
 * a real, valid .docx file.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render } from '@testing-library/react'
import { Packer } from 'docx'

import { htmlToIR } from '../../src/ir/parser.js'
import { buildDocument } from '../../src/adapters/docx.js'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import { useDocumentOutput } from '../../src/useDocumentOutput.js'
import { DocumentContext } from '../../src/DocumentContext.js'
import { Paragraph, TextRun, H1, H2 } from '../../src/docx/index.js'

// ============================================================================
// Sample foundation section components — these simulate what a real
// foundation would author.
// ============================================================================

function CoverSection({ block }) {
    const markup = (
        <>
            <H1>{block.content.title}</H1>
            <Paragraph data-spacing-after="200">{block.content.subtitle}</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function FundingTable({ block }) {
    const rows = block.content.data || []

    const markup = (
        <>
            <H2>Research Funding</H2>
            <Paragraph as="div" data-type="table">
                {/* Header row */}
                <Paragraph as="div" data-type="tableRow">
                    <Paragraph
                        as="div"
                        data-type="tableCell"
                        data-width-size="40"
                        data-width-type="pct"
                        data-borders-bottom-style="single"
                        data-borders-bottom-size="2"
                        data-borders-bottom-color="333333"
                    >
                        <Paragraph>
                            <TextRun bold>Source</TextRun>
                        </Paragraph>
                    </Paragraph>
                    <Paragraph
                        as="div"
                        data-type="tableCell"
                        data-width-size="30"
                        data-width-type="pct"
                        data-borders-bottom-style="single"
                        data-borders-bottom-size="2"
                        data-borders-bottom-color="333333"
                    >
                        <Paragraph>
                            <TextRun bold>Program</TextRun>
                        </Paragraph>
                    </Paragraph>
                    <Paragraph
                        as="div"
                        data-type="tableCell"
                        data-width-size="30"
                        data-width-type="pct"
                        data-borders-bottom-style="single"
                        data-borders-bottom-size="2"
                        data-borders-bottom-color="333333"
                    >
                        <Paragraph>
                            <TextRun bold>Amount</TextRun>
                        </Paragraph>
                    </Paragraph>
                </Paragraph>
                {/* Data rows */}
                {rows.map((row, i) => (
                    <Paragraph as="div" data-type="tableRow" key={i}>
                        <Paragraph
                            as="div"
                            data-type="tableCell"
                            data-width-size="40"
                            data-width-type="pct"
                        >
                            <Paragraph>{row.source}</Paragraph>
                        </Paragraph>
                        <Paragraph
                            as="div"
                            data-type="tableCell"
                            data-width-size="30"
                            data-width-type="pct"
                        >
                            <Paragraph>{row.program}</Paragraph>
                        </Paragraph>
                        <Paragraph
                            as="div"
                            data-type="tableCell"
                            data-width-size="30"
                            data-width-type="pct"
                        >
                            <Paragraph>{row.amount}</Paragraph>
                        </Paragraph>
                    </Paragraph>
                ))}
            </Paragraph>
        </>
    )

    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

// ============================================================================
// Test data — simulates what the CMS would provide
// ============================================================================

const coverBlock = {
    id: 'cover',
    content: {
        title: 'Annual Research Report 2025',
        subtitle: 'Faculty of Engineering, University of New Brunswick',
    },
}

const fundingBlock = {
    id: 'funding',
    content: {
        data: [
            { source: 'NSERC', program: 'Discovery Grant', amount: '$150,000' },
            { source: 'CIHR', program: 'Project Grant', amount: '$75,000' },
            { source: 'CFI', program: 'Innovation Fund', amount: '$200,000' },
        ],
    },
}

// ============================================================================
// Integration tests
// ============================================================================

describe('full pipeline integration', () => {
    it('renders section components, registers outputs, and compiles to a valid .docx buffer', async () => {
        let store = null

        function StoreCapture() {
            store = React.useContext(DocumentContext)
            return null
        }

        // Step 1: Render the "page" — this is what would happen in the CMS
        // preview. The DocumentProvider wraps the page. Section components
        // call useDocumentOutput during render to register their JSX.
        render(
            <DocumentProvider>
                <StoreCapture />
                <CoverSection block={coverBlock} />
                <FundingTable block={fundingBlock} />
            </DocumentProvider>,
        )

        // Step 2: Collect registered outputs (simulating the walker)
        const outputs = store.getOutputs('docx')
        expect(outputs).toHaveLength(2)
        expect(outputs[0].block).toBe(coverBlock)
        expect(outputs[1].block).toBe(fundingBlock)

        // Step 3: For each registered fragment (JSX), static-render to HTML,
        // then parse to IR. This is what compileOutputs() in src/ir/compile.js
        // does for docx; the test does it inline to keep the pipeline explicit.
        const irSections = outputs.map(({ fragment }) => {
            const html = renderToStaticMarkup(fragment)
            return htmlToIR(html)
        })

        // Step 4: Build the docx Document and pack to buffer
        const doc = await buildDocument({ sections: irSections })
        const buffer = await Packer.toBuffer(doc)

        // Step 5: Verify the output
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.length).toBeGreaterThan(0)

        // Valid ZIP signature
        expect(buffer[0]).toBe(0x50)
        expect(buffer[1]).toBe(0x4b)

        // The buffer is big enough to contain real content — a trivial
        // empty docx is ~4KB; with our content it should be larger.
        expect(buffer.length).toBeGreaterThan(4000)
    })

    it('produces IR with correct structure from the section components', () => {
        let store = null

        function StoreCapture() {
            store = React.useContext(DocumentContext)
            return null
        }

        render(
            <DocumentProvider>
                <StoreCapture />
                <CoverSection block={coverBlock} />
                <FundingTable block={fundingBlock} />
            </DocumentProvider>,
        )

        const outputs = store.getOutputs('docx')

        // Cover section IR
        const coverHtml = renderToStaticMarkup(outputs[0].fragment)
        const coverIR = htmlToIR(coverHtml)

        expect(coverIR[0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_1',
        })
        expect(coverIR[1]).toMatchObject({
            type: 'paragraph',
            spacing: { after: '200' },
        })

        // Funding section IR
        const fundingHtml = renderToStaticMarkup(outputs[1].fragment)
        const fundingIR = htmlToIR(fundingHtml)

        // H2 heading
        expect(fundingIR[0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_2',
        })

        // Table
        const table = fundingIR[1]
        expect(table.type).toBe('table')
        // 1 header row + 3 data rows
        expect(table.children).toHaveLength(4)
        // First row: header cells with bold text
        const headerRow = table.children[0]
        expect(headerRow.type).toBe('tableRow')
        expect(headerRow.children).toHaveLength(3)
        expect(headerRow.children[0]).toMatchObject({
            type: 'tableCell',
            width: { size: '40', type: 'pct' },
            borders: { bottom: { style: 'single', size: '2', color: '333333' } },
        })

        // Data row content
        const firstDataRow = table.children[1]
        expect(firstDataRow.children[0].children[0].children[0]).toMatchObject({
            type: 'text',
            content: 'NSERC',
        })
    })

    it('correctly handles the docx options object for header/footer', async () => {
        let store = null

        function StoreCapture() {
            store = React.useContext(DocumentContext)
            return null
        }

        function HeaderSection({ block }) {
            const markup = <Paragraph>Report Header</Paragraph>
            useDocumentOutput(block, 'docx', markup, {
                role: 'header',
                applyTo: 'all',
            })
            return null
        }

        const headerBlock = { id: 'header' }

        render(
            <DocumentProvider>
                <StoreCapture />
                <HeaderSection block={headerBlock} />
                <CoverSection block={coverBlock} />
            </DocumentProvider>,
        )

        const outputs = store.getOutputs('docx')
        expect(outputs).toHaveLength(2)

        // First output is the header (role='header')
        expect(outputs[0].options.role).toBe('header')
        expect(outputs[0].options.applyTo).toBe('all')

        // Second is the body (default role)
        expect(outputs[1].options).toEqual({})

        // Separate header and body for the docx adapter
        const headerOutputs = outputs.filter((o) => o.options.role === 'header')
        const bodyOutputs = outputs.filter((o) => !o.options.role || o.options.role === 'body')

        const headerIR = headerOutputs.flatMap(({ fragment }) =>
            htmlToIR(renderToStaticMarkup(fragment)),
        )
        const bodySections = bodyOutputs.map(({ fragment }) =>
            htmlToIR(renderToStaticMarkup(fragment)),
        )

        const doc = await buildDocument({
            sections: bodySections,
            header: headerIR,
        })
        const buffer = await Packer.toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(4000)
        expect(buffer[0]).toBe(0x50)
    })
})
