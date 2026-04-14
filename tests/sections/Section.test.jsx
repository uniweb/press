/**
 * Unit tests for the generic <Section> register-and-render helper.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { render } from '@testing-library/react'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import { DocumentContext } from '../../src/DocumentContext.js'
import { Section } from '../../src/sections/Section.jsx'
import { H1, Paragraph } from '../../src/docx/index.js'

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

describe('Section', () => {
    it('registers its children on the given block for the docx format by default', () => {
        const block = { id: 'a' }
        const { store } = renderWithStore(
            <Section block={block}>
                <H1>Title</H1>
                <Paragraph>Body</Paragraph>
            </Section>,
        )

        const outputs = store.getOutputs('docx')
        expect(outputs).toHaveLength(1)
        expect(outputs[0].block).toBe(block)
        expect(outputs[0].fragment).toBeDefined()
    })

    it('renders its children inside a <section> element', () => {
        const block = { id: 'a' }
        const { container } = renderWithStore(
            <Section block={block}>
                <p>visible content</p>
            </Section>,
        )
        const section = container.querySelector('section')
        expect(section).not.toBeNull()
        expect(section.textContent).toBe('visible content')
    })

    it('registers under a custom format when the format prop is provided', () => {
        const block = { id: 'b' }
        const { store } = renderWithStore(
            <Section block={block} format="xlsx">
                <p>ignored for registration shape</p>
            </Section>,
        )
        expect(store.getOutputs('docx')).toHaveLength(0)
        expect(store.getOutputs('xlsx')).toHaveLength(1)
    })

    it('forwards extra HTML props to the rendered <section>', () => {
        const block = { id: 'c' }
        const { container } = renderWithStore(
            <Section block={block} className="my-section" id="cover">
                <p>x</p>
            </Section>,
        )
        const section = container.querySelector('section')
        expect(section.className).toBe('my-section')
        expect(section.id).toBe('cover')
    })
})
