/**
 * Tests for the orchestrator compile step.
 *
 * Verifies that compileOutputs correctly:
 * - Converts JSX fragments to IR for docx
 * - Classifies by role (header/footer/body)
 * - Passes xlsx fragments through as-is
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import { Packer } from 'docx'

import DocumentProvider from '../../src/react/DocumentProvider.jsx'
import { useDocumentOutput } from '../../src/react/useDocumentOutput.js'
import { DocumentContext } from '../../src/react/DocumentContext.js'
import { Paragraph, TextRun, H1, H2 } from '../../src/react/components/index.js'
import { compileOutputs } from '../../src/orchestrator/compile.js'
import { buildDocument } from '../../src/docx/index.js'

/**
 * Helper: render components in a DocumentProvider and return the store.
 */
function renderAndGetStore(ui) {
    let store = null
    function Capture() {
        store = React.useContext(DocumentContext)
        return null
    }
    render(
        <DocumentProvider>
            <Capture />
            {ui}
        </DocumentProvider>,
    )
    return store
}

// --- Sample section components ---

function TitleSection({ block }) {
    const markup = <H1>{block.content.title}</H1>
    useDocumentOutput(block, 'docx', markup)
    return markup
}

function BodySection({ block }) {
    const markup = (
        <>
            <H2>Summary</H2>
            <Paragraph>{block.content.text}</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return markup
}

function HeaderSection({ block }) {
    const markup = <Paragraph>{block.content.text}</Paragraph>
    useDocumentOutput(block, 'docx', markup, { role: 'header' })
    return null
}

function FooterSection({ block }) {
    const markup = <Paragraph>{block.content.text}</Paragraph>
    useDocumentOutput(block, 'docx', markup, { role: 'footer' })
    return null
}

function XlsxSection({ block }) {
    useDocumentOutput(block, 'xlsx', {
        title: 'Metrics',
        headers: ['Year', 'Count'],
        data: [[2024, 42], [2025, 57]],
    })
    return <div>Chart preview</div>
}

// --- Test data ---

const titleBlock = { id: 't', content: { title: 'Report Title' } }
const bodyBlock = { id: 'b', content: { text: 'Some findings here.' } }
const headerBlock = { id: 'h', content: { text: 'University of X' } }
const footerBlock = { id: 'f', content: { text: 'Page footer' } }
const xlsxBlock = { id: 'x', content: {} }

// --- Tests ---

describe('compileOutputs for docx', () => {
    it('compiles body sections into IR arrays', () => {
        const store = renderAndGetStore(
            <>
                <TitleSection block={titleBlock} />
                <BodySection block={bodyBlock} />
            </>,
        )

        const result = compileOutputs(store, 'docx')

        expect(result.sections).toHaveLength(2)
        expect(result.header).toBeNull()
        expect(result.footer).toBeNull()

        // First section is the title
        expect(result.sections[0][0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_1',
        })

        // Second section has H2 + paragraph
        expect(result.sections[1][0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_2',
        })
        expect(result.sections[1][1]).toMatchObject({
            type: 'paragraph',
        })
    })

    it('separates header and footer from body by role', () => {
        const store = renderAndGetStore(
            <>
                <HeaderSection block={headerBlock} />
                <TitleSection block={titleBlock} />
                <FooterSection block={footerBlock} />
            </>,
        )

        const result = compileOutputs(store, 'docx')

        expect(result.sections).toHaveLength(1) // only the body
        expect(result.header).not.toBeNull()
        expect(result.header[0]).toMatchObject({ type: 'paragraph' })
        expect(result.footer).not.toBeNull()
        expect(result.footer[0]).toMatchObject({ type: 'paragraph' })
    })

    it('compiles to a valid docx buffer via buildDocument', async () => {
        const store = renderAndGetStore(
            <>
                <HeaderSection block={headerBlock} />
                <TitleSection block={titleBlock} />
                <BodySection block={bodyBlock} />
                <FooterSection block={footerBlock} />
            </>,
        )

        const compiled = compileOutputs(store, 'docx')
        const doc = buildDocument(compiled)
        const buffer = await Packer.toBuffer(doc)

        expect(buffer[0]).toBe(0x50)
        expect(buffer[1]).toBe(0x4b)
        expect(buffer.length).toBeGreaterThan(4000)
    })
})

describe('compileOutputs for xlsx', () => {
    it('passes xlsx fragments through as-is (no IR conversion)', () => {
        const store = renderAndGetStore(<XlsxSection block={xlsxBlock} />)

        const result = compileOutputs(store, 'xlsx')

        expect(result.sections).toHaveLength(1)
        expect(result.sections[0]).toEqual({
            title: 'Metrics',
            headers: ['Year', 'Count'],
            data: [[2024, 42], [2025, 57]],
        })
    })

    it('returns empty sections when no xlsx outputs registered', () => {
        const store = renderAndGetStore(<TitleSection block={titleBlock} />)
        const result = compileOutputs(store, 'xlsx')
        expect(result.sections).toEqual([])
    })
})

describe('format isolation', () => {
    it('docx and xlsx outputs are independent per block', () => {
        const dualBlock = { id: 'dual', content: { title: 'Dual' } }

        function DualSection({ block }) {
            const markup = <H1>{block.content.title}</H1>
            useDocumentOutput(block, 'docx', markup)
            useDocumentOutput(block, 'xlsx', {
                title: 'Sheet1',
                headers: ['A'],
                data: [[1]],
            })
            return markup
        }

        const store = renderAndGetStore(<DualSection block={dualBlock} />)

        const docx = compileOutputs(store, 'docx')
        const xlsx = compileOutputs(store, 'xlsx')

        expect(docx.sections).toHaveLength(1)
        expect(docx.sections[0][0].heading).toBe('HEADING_1')

        expect(xlsx.sections).toHaveLength(1)
        expect(xlsx.sections[0].title).toBe('Sheet1')
    })
})
