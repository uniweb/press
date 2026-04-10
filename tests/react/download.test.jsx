/**
 * Tests for DownloadButton and useDocumentDownload hook.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

afterEach(cleanup)
import DocumentProvider from '../../src/react/DocumentProvider.jsx'
import { useDocumentOutput } from '../../src/react/useDocumentOutput.js'
import DownloadButton, { useDocumentDownload } from '../../src/react/DownloadButton.jsx'
import { Paragraph, H1 } from '../../src/react/components/index.js'

// --- Sample section ---

function TitleSection({ block }) {
    const markup = <H1>{block.content.title}</H1>
    useDocumentOutput(block, 'docx', markup)
    return markup
}

const block = { id: 'test', content: { title: 'Test Report' } }

describe('DownloadButton', () => {
    it('renders a button with the format label', () => {
        render(
            <DocumentProvider>
                <TitleSection block={block} />
                <DownloadButton format="docx" />
            </DocumentProvider>,
        )

        const btn = screen.getByRole('button')
        expect(btn).toBeDefined()
        expect(btn.textContent).toBe('Download DOCX')
    })

    it('renders custom children as the label', () => {
        render(
            <DocumentProvider>
                <TitleSection block={block} />
                <DownloadButton format="docx">Export Report</DownloadButton>
            </DocumentProvider>,
        )

        expect(screen.getByRole('button').textContent).toBe('Export Report')
    })

    it('calls the docx adapter and triggers download on click', async () => {
        // Mock createObjectURL and revokeObjectURL
        const mockUrl = 'blob:mock-url'
        const createSpy = vi.fn(() => mockUrl)
        const revokeSpy = vi.fn()
        globalThis.URL.createObjectURL = createSpy
        globalThis.URL.revokeObjectURL = revokeSpy

        // Mock the click on the <a> element
        const clickSpy = vi.fn()
        const origCreateElement = document.createElement.bind(document)
        vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            const el = origCreateElement(tag)
            if (tag === 'a') {
                el.click = clickSpy
            }
            return el
        })

        render(
            <DocumentProvider>
                <TitleSection block={block} />
                <DownloadButton format="docx" fileName="test-report.docx" />
            </DocumentProvider>,
        )

        const btn = screen.getByRole('button')
        fireEvent.click(btn)

        await waitFor(() => {
            expect(clickSpy).toHaveBeenCalled()
        })

        expect(createSpy).toHaveBeenCalled()
        expect(revokeSpy).toHaveBeenCalledWith(mockUrl)

        // Cleanup
        vi.restoreAllMocks()
    })
})

describe('useDocumentDownload', () => {
    it('returns download function and isCompiling state', () => {
        let hookResult = null

        function Consumer() {
            hookResult = useDocumentDownload({ format: 'docx' })
            return null
        }

        render(
            <DocumentProvider>
                <TitleSection block={block} />
                <Consumer />
            </DocumentProvider>,
        )

        expect(typeof hookResult.download).toBe('function')
        expect(hookResult.isCompiling).toBe(false)
    })

    it('throws for unsupported format', async () => {
        let hookResult = null

        function Consumer() {
            hookResult = useDocumentDownload({ format: 'rtf' })
            return null
        }

        render(
            <DocumentProvider>
                <TitleSection block={block} />
                <Consumer />
            </DocumentProvider>,
        )

        await expect(hookResult.download()).rejects.toThrow('Unsupported document format')
    })
})
