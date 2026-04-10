import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { render } from '@testing-library/react'
import DocumentProvider from '../../src/react/DocumentProvider.jsx'
import { useDocumentOutput } from '../../src/react/useDocumentOutput.js'
import { DocumentContext } from '../../src/react/DocumentContext.js'

/**
 * Helper: render a tree and return the store from the context.
 */
function renderWithStore(ui) {
    let capturedStore = null

    function StoreCapture() {
        capturedStore = React.useContext(DocumentContext)
        return null
    }

    render(
        <DocumentProvider>
            <StoreCapture />
            {ui}
        </DocumentProvider>,
    )

    return capturedStore
}

describe('DocumentProvider', () => {
    it('provides a store via context', () => {
        const store = renderWithStore(null)
        expect(store).toBeDefined()
        expect(typeof store.register).toBe('function')
        expect(typeof store.getOutputs).toBe('function')
        expect(typeof store.clear).toBe('function')
    })

    it('returns the same store across re-renders (memoized)', () => {
        let stores = []

        function Collector() {
            const store = React.useContext(DocumentContext)
            stores.push(store)
            return null
        }

        const { rerender } = render(
            <DocumentProvider>
                <Collector />
            </DocumentProvider>,
        )

        rerender(
            <DocumentProvider>
                <Collector />
            </DocumentProvider>,
        )

        expect(stores).toHaveLength(2)
        expect(stores[0]).toBe(stores[1])
    })
})

describe('useDocumentOutput', () => {
    it('registers a fragment for a given block and format', () => {
        const block = { id: 'block-1' }
        const fragment = '<p>Hello</p>'

        function TestComponent() {
            useDocumentOutput(block, 'docx', fragment)
            return null
        }

        const store = renderWithStore(<TestComponent />)
        const outputs = store.getOutputs('docx')

        expect(outputs).toHaveLength(1)
        expect(outputs[0].block).toBe(block)
        expect(outputs[0].fragment).toBe(fragment)
    })

    it('registers with options (role, applyTo)', () => {
        const block = { id: 'header-block' }
        const fragment = '<p>Header</p>'

        function TestComponent() {
            useDocumentOutput(block, 'docx', fragment, {
                role: 'header',
                applyTo: 'first',
            })
            return null
        }

        const store = renderWithStore(<TestComponent />)
        const outputs = store.getOutputs('docx')

        expect(outputs[0].options).toEqual({ role: 'header', applyTo: 'first' })
    })

    it('registers multiple blocks in order', () => {
        const block1 = { id: 'block-1' }
        const block2 = { id: 'block-2' }

        function TestComponent() {
            useDocumentOutput(block1, 'docx', 'First')
            useDocumentOutput(block2, 'docx', 'Second')
            return null
        }

        const store = renderWithStore(<TestComponent />)
        const outputs = store.getOutputs('docx')

        expect(outputs).toHaveLength(2)
        expect(outputs[0].fragment).toBe('First')
        expect(outputs[1].fragment).toBe('Second')
    })

    it('overwrites same block + format on re-register (Strict Mode safe)', () => {
        const block = { id: 'block-1' }

        function TestComponent() {
            useDocumentOutput(block, 'docx', 'Latest')
            return null
        }

        const store = renderWithStore(<TestComponent />)
        // Simulate double-render (Strict Mode): register again with same block
        store.register(block, 'docx', 'Overwritten')

        const outputs = store.getOutputs('docx')
        expect(outputs).toHaveLength(1)
        expect(outputs[0].fragment).toBe('Overwritten')
    })

    it('supports multiple formats per block', () => {
        const block = { id: 'block-1' }

        function TestComponent() {
            useDocumentOutput(block, 'docx', 'Docx fragment')
            useDocumentOutput(block, 'xlsx', { headers: ['A'], data: [[1]] })
            return null
        }

        const store = renderWithStore(<TestComponent />)

        const docxOutputs = store.getOutputs('docx')
        const xlsxOutputs = store.getOutputs('xlsx')

        expect(docxOutputs).toHaveLength(1)
        expect(docxOutputs[0].fragment).toBe('Docx fragment')
        expect(xlsxOutputs).toHaveLength(1)
        expect(xlsxOutputs[0].fragment).toEqual({ headers: ['A'], data: [[1]] })
    })

    it('returns empty array for unregistered formats', () => {
        function TestComponent() {
            return null
        }

        const store = renderWithStore(<TestComponent />)
        expect(store.getOutputs('pdf')).toEqual([])
    })

    it('does not crash when called outside DocumentProvider', () => {
        // Should warn but not throw.
        const block = { id: 'orphan' }
        function Orphan() {
            useDocumentOutput(block, 'docx', 'fragment')
            return null
        }

        expect(() => render(<Orphan />)).not.toThrow()
    })

    it('clear() removes all registrations', () => {
        const block = { id: 'block-1' }

        function TestComponent() {
            useDocumentOutput(block, 'docx', 'fragment')
            return null
        }

        const store = renderWithStore(<TestComponent />)
        expect(store.getOutputs('docx')).toHaveLength(1)

        store.clear()
        expect(store.getOutputs('docx')).toEqual([])
    })
})
