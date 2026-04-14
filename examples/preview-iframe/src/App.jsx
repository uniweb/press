/**
 * Runnable demo for @uniweb/press:
 *
 *   - Three section components register docx output via useDocumentOutput.
 *   - PreviewControls offers a Preview button (compile → docx-preview
 *     render into a sandboxed iframe) and a Download button (compile →
 *     triggerDownload).
 *
 * Foundations that prefer rendering preview into a plain <div> can swap
 * the iframe target; the compile/download primitives are the same.
 */
import React, { useRef, useState } from 'react'
import {
    DocumentProvider,
    useDocumentOutput,
    useDocumentCompile,
    triggerDownload,
} from '@uniweb/press'
import { H1, H2, Paragraph, Paragraphs } from '@uniweb/press/docx'

const coverBlock = { id: 'cover' }
const summaryBlock = { id: 'summary' }
const findingsBlock = { id: 'findings' }

function Cover({ block }) {
    const markup = (
        <>
            <H1>Annual Report 2025</H1>
            <Paragraph>Prepared by the @uniweb/press preview demo.</Paragraph>
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function Summary({ block }) {
    const markup = (
        <>
            <H2>Executive summary</H2>
            <Paragraphs
                data={[
                    'This demo exercises the register-and-compile contract.',
                    'The same JSX you see on screen is walked to produce the .docx file.',
                ]}
            />
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function Findings({ block }) {
    const markup = (
        <>
            <H2>Findings</H2>
            <Paragraph data="Growth was <strong>steady</strong> across all regions." />
            <Paragraph data="Refereed output rose by <em>12%</em> year over year." />
        </>
    )
    useDocumentOutput(block, 'docx', markup)
    return <section>{markup}</section>
}

function PreviewControls({ iframeRef }) {
    const { compile, isCompiling } = useDocumentCompile()
    const [error, setError] = useState(null)

    async function runPreview() {
        setError(null)
        try {
            const blob = await compile('docx')
            const { renderAsync } = await import('docx-preview')
            const iframe = iframeRef.current
            if (!iframe) return
            const doc = iframe.contentDocument
            doc.body.innerHTML = ''
            await renderAsync(blob, doc.body, null, {
                className: 'docx-preview',
                inWrapper: true,
            })
        } catch (err) {
            console.error(err)
            setError(err.message || String(err))
        }
    }

    async function runDownload() {
        setError(null)
        try {
            const blob = await compile('docx')
            triggerDownload(blob, 'annual-report-2025.docx')
        } catch (err) {
            console.error(err)
            setError(err.message || String(err))
        }
    }

    return (
        <div className="controls">
            <button type="button" onClick={runPreview} disabled={isCompiling}>
                {isCompiling ? 'Working…' : 'Preview'}
            </button>
            <button type="button" onClick={runDownload} disabled={isCompiling}>
                {isCompiling ? 'Working…' : 'Download'}
            </button>
            {error && (
                <span style={{ color: 'crimson', alignSelf: 'center' }}>
                    {error}
                </span>
            )}
        </div>
    )
}

export default function App() {
    const iframeRef = useRef(null)

    return (
        <DocumentProvider>
            <h1>@uniweb/press — preview-iframe demo</h1>
            <p>
                Three section components below register their JSX with the
                document provider. Click <em>Preview</em> to render the
                compiled .docx into a sandboxed iframe via{' '}
                <code>docx-preview</code>, or <em>Download</em> to save the
                file locally.
            </p>

            <Cover block={coverBlock} />
            <Summary block={summaryBlock} />
            <Findings block={findingsBlock} />

            <PreviewControls iframeRef={iframeRef} />

            <iframe
                ref={iframeRef}
                className="preview"
                title="Compiled .docx preview"
                sandbox="allow-same-origin"
            />
        </DocumentProvider>
    )
}
