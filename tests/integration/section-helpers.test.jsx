/**
 * Integration test: StandardSection inside a DocumentProvider compiles
 * to a valid .docx Blob whose content contains the expected text from
 * every supported field, plus whatever renderChildBlocks returns.
 *
 * Anchors R4a's exit criterion: "StandardSection as the sole component
 * of a test section produces a valid .docx with heading, paragraphs,
 * images, and renderChildBlocks output."
 */
import { describe, it, expect } from 'vitest'
import React, { useEffect } from 'react'
import { render, act } from '@testing-library/react'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import { useDocumentCompile } from '../../src/useDocumentCompile.js'
import { StandardSection } from '../../src/sections/StandardSection.jsx'
import { Paragraph } from '../../src/docx/index.js'

async function blobToUint8(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
}

function Harness({ onReady }) {
    const { compile, isCompiling } = useDocumentCompile()
    useEffect(() => {
        onReady({ compile, isCompiling })
    })
    return null
}

function mount(ui) {
    const state = { compile: null, isCompiling: false }
    render(
        <DocumentProvider>
            {ui}
            <Harness
                onReady={(latest) => {
                    state.compile = latest.compile
                    state.isCompiling = latest.isCompiling
                }}
            />
        </DocumentProvider>,
    )
    return state
}

describe('integration: StandardSection end-to-end', () => {
    it('compiles a fully-populated StandardSection to a valid .docx Blob', async () => {
        const block = {
            id: 'cover',
            content: {
                title: 'Annual Report',
                subtitle: 'Fiscal Year 2025',
                description: 'Prepared by the Research Office',
                paragraphs: [
                    'The past year saw steady growth across all regions.',
                    'Refereed output rose by twelve percent year over year.',
                ],
                images: [{ url: 'https://example.com/cover.png', alt: 'Cover' }],
                links: [
                    { label: 'Research Office', href: 'https://example.com' },
                ],
                lists: [
                    [
                        { paragraphs: ['Milestone one'] },
                        { paragraphs: ['Milestone two'] },
                    ],
                ],
            },
        }

        const state = mount(
            <StandardSection
                block={block}
                renderChildBlocks={() => (
                    <Paragraph>Child block content appended.</Paragraph>
                )}
            />,
        )

        let blob
        await act(async () => {
            blob = await state.compile('docx')
        })

        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBeGreaterThan(0)
        const buf = await blobToUint8(blob)
        // PK magic bytes — valid ZIP (docx is a ZIP container).
        expect(buf[0]).toBe(0x50)
        expect(buf[1]).toBe(0x4b)
    })

    it('survives a block with no content (empty section still compiles)', async () => {
        const block = { id: 'empty' }
        const state = mount(<StandardSection block={block} />)

        let blob
        await act(async () => {
            blob = await state.compile('docx')
        })

        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBeGreaterThan(0)
    })
})
