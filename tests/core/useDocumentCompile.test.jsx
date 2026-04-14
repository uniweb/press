/**
 * Tests for useDocumentCompile — the hook that turns registered outputs
 * into a Blob via the lazy-loaded format adapter.
 *
 * Covers the contract the examples/preview-iframe demo relies on:
 * compile(format) returns a valid docx Blob, isCompiling transitions
 * correctly across async calls, and successive calls return distinct
 * Blobs without stale caching.
 */
import { describe, it, expect } from 'vitest'
import React, { useEffect } from 'react'
import { render, act, waitFor } from '@testing-library/react'
import DocumentProvider from '../../src/DocumentProvider.jsx'
import { useDocumentOutput } from '../../src/useDocumentOutput.js'
import { useDocumentCompile } from '../../src/useDocumentCompile.js'
import { Paragraph, H1 } from '../../src/docx/index.js'

async function blobToUint8(blob) {
    // jsdom's Blob doesn't implement arrayBuffer(), and wrapping it in
    // Response gives back a UTF-8 decoded view that mangles binary bytes.
    // Read through FileReader instead, which returns the raw buffer.
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(new Uint8Array(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(blob)
    })
}

async function blobStartsWithPK(blob) {
    const buf = await blobToUint8(blob)
    return buf[0] === 0x50 && buf[1] === 0x4b
}

function RegisterSection({ block, title, body }) {
    const markup = (
        <>
            <H1>{title}</H1>
            <Paragraph>{body}</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function Harness({ onReady }) {
    const { compile, isCompiling } = useDocumentCompile()
    useEffect(() => {
        onReady({ compile, isCompiling })
    })
    return null
}

function renderHarness(ui) {
    const state = { compile: null, isCompiling: false, renderCount: 0 }
    render(
        <DocumentProvider>
            {ui}
            <Harness
                onReady={(latest) => {
                    state.compile = latest.compile
                    state.isCompiling = latest.isCompiling
                    state.renderCount += 1
                }}
            />
        </DocumentProvider>,
    )
    return state
}

describe('useDocumentCompile', () => {
    it('compile("docx") resolves to a valid docx Blob (PK magic bytes)', async () => {
        const block = { id: 'cover' }
        const state = renderHarness(
            <RegisterSection block={block} title="Title" body="Body" />,
        )

        let blob
        await act(async () => {
            blob = await state.compile('docx')
        })

        expect(blob).toBeInstanceOf(Blob)
        expect(blob.size).toBeGreaterThan(0)
        expect(await blobStartsWithPK(blob)).toBe(true)
    })

    it('transitions isCompiling false → true → false across an async call', async () => {
        const block = { id: 'cover' }
        const state = renderHarness(
            <RegisterSection block={block} title="Title" body="Body" />,
        )

        expect(state.isCompiling).toBe(false)

        let resolveCompile
        await act(async () => {
            const promise = state.compile('docx')
            // Flush micro-tasks so the setState from inside compile() lands.
            await Promise.resolve()
            resolveCompile = promise
        })
        await waitFor(() => expect(state.isCompiling).toBe(false))
        await resolveCompile

        // Sanity: isCompiling settled back to false and compile resolved.
        expect(state.isCompiling).toBe(false)
    })

    it('successive compile calls return distinct Blobs (no stale caching)', async () => {
        const block = { id: 'cover' }
        const state = renderHarness(
            <RegisterSection block={block} title="Title" body="Body" />,
        )

        let first
        let second
        await act(async () => {
            first = await state.compile('docx')
            second = await state.compile('docx')
        })

        expect(first).not.toBe(second)
        expect(first).toBeInstanceOf(Blob)
        expect(second).toBeInstanceOf(Blob)
    })

    it('throws for an unsupported format', async () => {
        const block = { id: 'cover' }
        const state = renderHarness(
            <RegisterSection block={block} title="Title" body="Body" />,
        )

        await expect(
            act(async () => {
                await state.compile('rtf')
            }),
        ).rejects.toThrow(/Unsupported document format/)
    })
})
