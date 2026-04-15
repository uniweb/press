import { describe, it, expect } from 'vitest'
import { Packer } from 'docx'
import { buildDocument, compileDocx } from '../../src/adapters/docx.js'
import { htmlToIR } from '../../src/ir/parser.js'

/**
 * Helper: parse HTML, wrap in a single-section walker-output shape,
 * and build a Document.
 */
async function buildFromHtml(html) {
    const ir = htmlToIR(html)
    return buildDocument({ sections: [ir] })
}

/**
 * Helper: convert a Document to a Buffer for inspection.
 */
async function toBuffer(doc) {
    return Packer.toBuffer(doc)
}

describe('buildDocument', () => {
    it('creates a Document from minimal IR', async () => {
        const doc = await buildDocument({
            sections: [[{ type: 'paragraph', children: [{ type: 'text', content: 'Hello' }] }]],
        })
        expect(doc).toBeDefined()
        // Verify Document was created by checking it's a docx Document instance
        // (internal structure is not publicly exposed — just verify it packs).
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('handles empty sections gracefully', async () => {
        const doc = await buildDocument({ sections: [] })
        expect(doc).toBeDefined()
    })

    it('flattens multiple block IR arrays into one section', async () => {
        const block1 = [{ type: 'paragraph', children: [{ type: 'text', content: 'Block 1' }] }]
        const block2 = [{ type: 'paragraph', children: [{ type: 'text', content: 'Block 2' }] }]
        const doc = await buildDocument({ sections: [block1, block2] })
        expect(doc).toBeDefined()
    })
})

describe('end-to-end: HTML → IR → docx buffer', () => {
    it('produces a valid docx buffer from a simple paragraph', async () => {
        const doc = await buildFromHtml('<p data-type="paragraph">Hello world</p>')
        const buffer = await toBuffer(doc)
        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer.length).toBeGreaterThan(0)
        // docx files are ZIP archives — magic bytes PK (0x50, 0x4B).
        expect(buffer[0]).toBe(0x50)
        expect(buffer[1]).toBe(0x4b)
    })

    it('produces a valid docx from a heading', async () => {
        const doc = await buildFromHtml(
            '<h1 data-type="paragraph" data-heading="HEADING_1">Report Title</h1>',
        )
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })

    it('produces a valid docx from bold/italic/underline text', async () => {
        const html = `
            <p data-type="paragraph">
                <span data-type="text" data-bold="true">Bold</span>
                <span data-type="text" data-italics="true">Italic</span>
                <span data-type="text" data-underline="true">Underlined</span>
            </p>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from a table with cells', async () => {
        const html = `
            <div data-type="table">
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct"
                         data-margins-top="100" data-margins-bottom="50"
                         data-borders-top-style="single" data-borders-top-size="4" data-borders-top-color="000000">
                        <p data-type="paragraph">Cell A</p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">Cell B</p>
                    </div>
                </div>
            </div>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })

    it('produces a valid docx from an external hyperlink', async () => {
        const html = `
            <p data-type="paragraph">
                <a data-type="externalHyperlink" data-link="https://example.com">
                    <span data-type="text">Click here</span>
                </a>
            </p>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from a bullet list', async () => {
        const html = `
            <p data-type="paragraph" data-bullet-level="0">First item</p>
            <p data-type="paragraph" data-bullet-level="0">Second item</p>
            <p data-type="paragraph" data-bullet-level="1">Sub-item</p>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('produces a valid docx from spacing attributes', async () => {
        const html = `
            <p data-type="paragraph" data-spacing-before="200" data-spacing-after="100">
                Spaced paragraph
            </p>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('handles mixed content: heading + paragraph + table', async () => {
        const html = `
            <h1 data-type="paragraph" data-heading="HEADING_1">Annual Report</h1>
            <p data-type="paragraph">This is the summary.</p>
            <div data-type="table">
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">
                            <span data-type="text" data-bold="true">Source</span>
                        </p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">
                            <span data-type="text" data-bold="true">Amount</span>
                        </p>
                    </div>
                </div>
                <div data-type="tableRow">
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">NSERC</p>
                    </div>
                    <div data-type="tableCell" data-width-size="50" data-width-type="pct">
                        <p data-type="paragraph">$150,000</p>
                    </div>
                </div>
            </div>
        `
        const doc = await buildFromHtml(html)
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
        expect(buffer[0]).toBe(0x50)
    })
})

describe('header and footer', () => {
    it('includes header when provided', async () => {
        const headerIR = htmlToIR('<p data-type="paragraph">Header text</p>')
        const bodyIR = htmlToIR('<p data-type="paragraph">Body text</p>')
        const doc = await buildDocument({
            sections: [bodyIR],
            header: headerIR,
        })
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })

    it('includes footer when provided', async () => {
        const footerIR = htmlToIR('<p data-type="paragraph">Page footer</p>')
        const bodyIR = htmlToIR('<p data-type="paragraph">Body text</p>')
        const doc = await buildDocument({
            sections: [bodyIR],
            footer: footerIR,
        })
        const buffer = await toBuffer(doc)
        expect(buffer.length).toBeGreaterThan(0)
    })
})

describe('compileDocx', () => {
    it('returns a Blob (or Buffer in Node) with valid docx content', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Test</p>')
        const result = await compileDocx({ sections: [ir] })
        // In Node, Packer.toBlob may return a Buffer; in browser, a Blob.
        expect(result).toBeDefined()
        if (result instanceof Buffer) {
            expect(result.length).toBeGreaterThan(0)
            expect(result[0]).toBe(0x50)
        } else {
            // Blob (browser / jsdom)
            expect(result.size).toBeGreaterThan(0)
        }
    })
})

describe('page numbering', () => {
    it('replaces _currentPage and _totalPages with PageNumber tokens', async () => {
        const ir = [
            {
                type: 'paragraph',
                children: [
                    { type: 'text', content: 'Page ' },
                    { type: 'text', content: '_currentPage' },
                    { type: 'text', content: ' of ' },
                    { type: 'text', content: '_totalPages' },
                ],
            },
        ]

        const doc = await buildDocument({ sections: [ir] })
        const buffer = await Packer.toBuffer(doc)
        expect(buffer[0]).toBe(0x50)
        expect(buffer.length).toBeGreaterThan(4000)
    })
})

describe('default headers/footers', () => {
    it('includes default "Page X of Y" when no header/footer provided', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Content</p>')
        const doc = await buildDocument({ sections: [ir] })
        const buffer = await Packer.toBuffer(doc)
        expect(buffer[0]).toBe(0x50)
        expect(buffer.length).toBeGreaterThan(4000)
    })

    it('supports firstPageOnly header', async () => {
        const headerIR = [{ type: 'paragraph', children: [{ type: 'text', content: 'First Page Only' }] }]
        const bodyIR = htmlToIR('<p data-type="paragraph">Body</p>')
        const doc = await buildDocument({
            sections: [bodyIR],
            header: headerIR,
            headerFirstPageOnly: true,
        })
        const buffer = await Packer.toBuffer(doc)
        expect(buffer[0]).toBe(0x50)
        expect(buffer.length).toBeGreaterThan(4000)
    })
})

// ============================================================================
// Gap #2 (R5): paragraph-level data-style is forwarded to DocxParagraph
// ============================================================================

/**
 * Unzip a packed docx buffer and read word/document.xml as a string.
 * Lets tests assert on XML-level output (e.g., <w:pStyle w:val="X"/>).
 */
async function readDocumentXml(doc) {
    const buffer = await Packer.toBuffer(doc)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    return zip.file('word/document.xml').async('string')
}

describe('paragraph-level data-style (R5 gap #2)', () => {
    it('forwards data-style from HTML through IR to the compiled paragraph', async () => {
        const ir = htmlToIR(
            '<p data-type="paragraph" data-style="myCustomStyle">Styled content</p>',
        )
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)

        // docx library emits <w:pStyle w:val="myCustomStyle"/> inside <w:pPr>
        expect(xml).toContain('w:val="myCustomStyle"')
    })

    it('forwards style from a directly-constructed IR node', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        style: 'groupTitle',
                        children: [{ type: 'text', content: 'Group heading' }],
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        expect(xml).toContain('w:val="groupTitle"')
    })

    it('does not emit a pStyle element for paragraphs without data-style', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Plain content</p>')
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)
        // Plain paragraphs should not have an arbitrary pStyle inserted.
        // (The default "Page X of Y" footer may use pStyle internally;
        // scope the check to the body paragraph by looking for
        // "Plain content" and verifying no pStyle appears between the
        // preceding w:pPr open and the run that carries the text.)
        const bodyIdx = xml.indexOf('Plain content')
        expect(bodyIdx).toBeGreaterThan(-1)
        // Walk backwards from the text to find the enclosing w:p start.
        const pStart = xml.lastIndexOf('<w:p ', bodyIdx)
        const paragraphFragment = xml.slice(pStart, bodyIdx)
        expect(paragraphFragment).not.toContain('w:pStyle')
    })
})
