/**
 * Unit tests for <StandardSection>.
 *
 * Verifies graceful handling of missing content fields, the
 * content-from-block default, the content override prop, the
 * renderChildBlocks escape hatch, and format-prop forwarding.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import { DocumentContext } from '../../src/DocumentContext.js'
import { StandardSection } from '../../src/sections/StandardSection.jsx'

function renderWithStore(ui) {
    let capturedStore = null
    function StoreCapture() {
        capturedStore = React.useContext(DocumentContext)
        return null
    }
    const { container } = render(
        <DocumentProvider>
            {ui}
            <StoreCapture />
        </DocumentProvider>,
    )
    return { container, store: capturedStore }
}

describe('StandardSection', () => {
    it('reads content from block.content by default', () => {
        const block = {
            id: 'cover',
            content: {
                title: 'Annual Report',
                paragraphs: ['Prepared for 2025.'],
            },
        }
        const { container } = renderWithStore(<StandardSection block={block} />)
        expect(container.textContent).toContain('Annual Report')
        expect(container.textContent).toContain('Prepared for 2025.')
    })

    it('accepts a content override prop', () => {
        const block = {
            id: 'cover',
            content: { title: 'From block' },
        }
        const { container } = renderWithStore(
            <StandardSection block={block} content={{ title: 'Override' }} />,
        )
        expect(container.textContent).toContain('Override')
        expect(container.textContent).not.toContain('From block')
    })

    it('gracefully handles missing content fields', () => {
        const block = { id: 'empty', content: {} }
        expect(() =>
            renderWithStore(<StandardSection block={block} />),
        ).not.toThrow()
    })

    it('gracefully handles a block with no content at all', () => {
        const block = { id: 'blank' }
        expect(() =>
            renderWithStore(<StandardSection block={block} />),
        ).not.toThrow()
    })

    it('renders every supported content field', () => {
        const block = {
            id: 'full',
            content: {
                title: 'Title',
                subtitle: 'Subtitle',
                description: 'Desc',
                paragraphs: ['P1', 'P2'],
                images: [{ url: '/a.png', alt: 'a' }],
                links: [{ label: 'Home', href: 'https://example.com' }],
                lists: [[{ paragraphs: ['List item'] }]],
            },
        }
        const { container } = renderWithStore(<StandardSection block={block} />)
        const text = container.textContent
        expect(text).toContain('Title')
        expect(text).toContain('Subtitle')
        expect(text).toContain('Desc')
        expect(text).toContain('P1')
        expect(text).toContain('P2')
        expect(text).toContain('Home')
        expect(text).toContain('List item')
        expect(container.querySelector('img')).not.toBeNull()
    })

    it('invokes renderChildBlocks with the block', () => {
        const block = { id: 'parent', content: { title: 'T' } }
        const calls = []
        renderWithStore(
            <StandardSection
                block={block}
                renderChildBlocks={(b) => {
                    calls.push(b)
                    return <span data-testid="child-marker">child</span>
                }}
            />,
        )
        expect(calls).toEqual([block])
    })

    it('registers under the format prop', () => {
        const block = { id: 'cover', content: { title: 'T' } }
        const { store } = renderWithStore(
            <StandardSection block={block} format="xlsx" />,
        )
        expect(store.getOutputs('docx')).toHaveLength(0)
        expect(store.getOutputs('xlsx')).toHaveLength(1)
    })
})
