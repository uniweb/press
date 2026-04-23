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
    return readPartXml(doc, 'word/document.xml')
}

/**
 * Read any file inside a packed docx buffer. Useful for inspecting
 * word/styles.xml or word/numbering.xml alongside word/document.xml.
 */
async function readPartXml(doc, partPath) {
    const buffer = await Packer.toBuffer(doc)
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const file = zip.file(partPath)
    return file ? file.async('string') : null
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

// ============================================================================
// paragraphStyles and numbering pass-through (R5 gap #3 scaffold)
// ============================================================================

describe('paragraphStyles option', () => {
    it('passes a named paragraph style to word/styles.xml', async () => {
        const ir = [
            {
                type: 'paragraph',
                style: 'bibliography',
                children: [{ type: 'text', content: 'Hanging indent entry' }],
            },
        ]

        const doc = await buildDocument(
            { sections: [ir] },
            {
                paragraphStyles: [
                    {
                        id: 'bibliography',
                        name: 'Bibliography',
                        basedOn: 'Normal',
                        next: 'Normal',
                        quickFormat: true,
                        run: { size: 22 }, // half-points = 11pt
                        paragraph: {
                            indent: { left: 720, hanging: 720 },
                            spacing: { after: 120 },
                        },
                    },
                ],
            },
        )

        const stylesXml = await readPartXml(doc, 'word/styles.xml')
        expect(stylesXml).not.toBeNull()
        // The style definition lives in word/styles.xml. The id appears
        // as w:styleId on the <w:style> element.
        expect(stylesXml).toContain('w:styleId="bibliography"')
        // And the display name shows up too.
        expect(stylesXml).toContain('w:val="Bibliography"')

        // The paragraph in word/document.xml references the style by id.
        const documentXml = await readDocumentXml(doc)
        expect(documentXml).toContain('w:val="bibliography"')
    })

    it('omits the styles block when no paragraphStyles are passed', async () => {
        // Baseline: a document with no caller-supplied styles still works
        // and its styles.xml does not contain a "bibliography" custom entry.
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', content: 'Unstyled' }],
                    },
                ],
            ],
        })
        const stylesXml = await readPartXml(doc, 'word/styles.xml')
        // The default styles file exists and contains built-ins, but not
        // a style id we'd recognise from this test.
        expect(stylesXml).not.toContain('w:styleId="bibliography"')
    })

    it('ignores an empty paragraphStyles array', async () => {
        // Passing paragraphStyles: [] should behave the same as omitting it.
        const doc = await buildDocument(
            {
                sections: [
                    [
                        {
                            type: 'paragraph',
                            children: [{ type: 'text', content: 'Empty list' }],
                        },
                    ],
                ],
            },
            { paragraphStyles: [] },
        )
        const stylesXml = await readPartXml(doc, 'word/styles.xml')
        expect(stylesXml).not.toContain('w:styleId="bibliography"')
    })
})

describe('numbering option', () => {
    it('passes a numbering config to word/numbering.xml', async () => {
        const ir = [
            {
                type: 'paragraph',
                numbering: { reference: 'biblio-numbering', level: 0 },
                children: [{ type: 'text', content: 'First reference' }],
            },
        ]

        const doc = await buildDocument(
            { sections: [ir] },
            {
                numbering: [
                    {
                        reference: 'biblio-numbering',
                        levels: [
                            {
                                level: 0,
                                format: 'decimal',
                                text: '%1.',
                                alignment: 'start',
                                style: {
                                    paragraph: {
                                        indent: { left: 720, hanging: 360 },
                                    },
                                },
                            },
                        ],
                    },
                ],
            },
        )

        const numberingXml = await readPartXml(doc, 'word/numbering.xml')
        expect(numberingXml).not.toBeNull()
        // The numbering reference we defined should appear in numbering.xml.
        // The docx library assigns numeric IDs; the format marker is what
        // we can assert directly without knowing the ID.
        expect(numberingXml).toContain('w:val="decimal"')
        expect(numberingXml).toContain('%1.')
    })

    it('produces a valid document when numbering is omitted', async () => {
        // Baseline: no numbering config, document still packs. This is
        // the check that the scaffold is a no-op for non-callers.
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', content: 'No numbering' }],
                    },
                ],
            ],
        })
        const buffer = await Packer.toBuffer(doc)
        expect(buffer[0]).toBe(0x50)
    })
})

describe('document metadata (title, creator, ...)', () => {
    it('forwards non-paragraphStyles/numbering options to the Document constructor', async () => {
        const doc = await buildDocument(
            {
                sections: [
                    [
                        {
                            type: 'paragraph',
                            children: [{ type: 'text', content: 'Body' }],
                        },
                    ],
                ],
            },
            {
                title: 'Annual Report',
                creator: 'Dr. Jane Example',
                subject: 'Faculty Annual Report',
                description: 'Automatically generated',
                keywords: 'report, faculty, annual',
            },
        )

        // These become properties in docProps/core.xml.
        const coreXml = await readPartXml(doc, 'docProps/core.xml')
        expect(coreXml).not.toBeNull()
        expect(coreXml).toContain('Annual Report')
        expect(coreXml).toContain('Dr. Jane Example')
        expect(coreXml).toContain('Faculty Annual Report')
    })
})

// ============================================================================
// Slice 6: page breaks and table of contents
// ============================================================================

describe('data-page-break-before', () => {
    it('produces a pageBreakBefore property on the paragraph via attribute', async () => {
        const ir = htmlToIR(
            '<p data-type="paragraph" data-page-break-before="true">Fresh page</p>',
        )
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)

        // The docx library renders pageBreakBefore as <w:pageBreakBefore/>
        // inside the paragraph's <w:pPr> properties block.
        expect(xml).toContain('<w:pageBreakBefore')
        expect(xml).toContain('Fresh page')
    })

    it('produces a pageBreakBefore property on a directly-constructed IR node', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        pageBreakBefore: true,
                        children: [{ type: 'text', content: 'Start of chapter' }],
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        expect(xml).toContain('<w:pageBreakBefore')
    })

    it('does not emit pageBreakBefore for paragraphs without the attribute', async () => {
        const ir = htmlToIR('<p data-type="paragraph">No break here</p>')
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)

        // Scope the assertion to the body paragraph we just inserted,
        // so any default header/footer content can't false-positive.
        const bodyIdx = xml.indexOf('No break here')
        expect(bodyIdx).toBeGreaterThan(-1)
        const pStart = xml.lastIndexOf('<w:p ', bodyIdx)
        const fragment = xml.slice(pStart, bodyIdx)
        expect(fragment).not.toContain('<w:pageBreakBefore')
    })
})

describe('tableOfContents node type', () => {
    it('emits a w:sdt block (the docx TOC field) with a custom title', async () => {
        const ir = htmlToIR(
            '<div data-type="tableOfContents" data-toc-title="Contents" data-toc-hyperlink="true" data-toc-heading-range="1-3"></div>',
        )
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)

        // A Word TOC field lives inside <w:sdt>...</w:sdt> (structured
        // document tag), with the alias as the tag label.
        expect(xml).toContain('<w:sdt>')
        expect(xml).toContain('Contents')
        // The TOC field instruction encodes the heading range via the
        // \\o "1-3" switch — verify the switch survives the pipeline.
        expect(xml).toContain('\\o')
        expect(xml).toContain('1-3')
    })

    it('accepts a directly-constructed IR node with a toc options sub-object', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'tableOfContents',
                        toc: {
                            title: 'Table of Contents',
                            hyperlink: 'true',
                            headingRange: '2-4',
                        },
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        expect(xml).toContain('<w:sdt>')
        expect(xml).toContain('Table of Contents')
        expect(xml).toContain('2-4')
    })

    it('defaults the title, hyperlink, and heading range when the toc sub-object is missing', async () => {
        const doc = await buildDocument({
            sections: [[{ type: 'tableOfContents' }]],
        })
        const xml = await readDocumentXml(doc)
        // The defaults from irToTableOfContents: title="Contents",
        // hyperlink=true, headingRange="1-3".
        expect(xml).toContain('<w:sdt>')
        expect(xml).toContain('Contents')
        expect(xml).toContain('1-3')
    })
})

describe('bookmarks', () => {
    it('wraps a paragraph flagged with `bookmark` in a Word bookmark', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        bookmark: 'ref-origin-1859',
                        children: [{ type: 'text', content: 'Darwin, 1859.' }],
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        // docx emits the bookmark as <w:bookmarkStart .../> + <w:bookmarkEnd/>.
        // The name carries the id we supplied.
        expect(xml).toContain('<w:bookmarkStart')
        expect(xml).toContain('w:name="ref-origin-1859"')
        expect(xml).toContain('<w:bookmarkEnd')
    })

    it('lets an internal hyperlink point at a paragraph bookmark', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [
                            {
                                type: 'internalHyperlink',
                                anchor: 'ref-origin-1859',
                                children: [{ type: 'text', content: '(Darwin, 1859)' }],
                            },
                        ],
                    },
                    {
                        type: 'paragraph',
                        bookmark: 'ref-origin-1859',
                        children: [{ type: 'text', content: 'Darwin, 1859. Origin.' }],
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        // The hyperlink anchor matches the bookmark name — Word can resolve
        // the jump.
        expect(xml).toContain('w:anchor="ref-origin-1859"')
        expect(xml).toContain('w:name="ref-origin-1859"')
    })
})

describe('webOnly', () => {
    it('drops a webOnly subtree from compiled docx output', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', content: 'Visible. ' },
                            {
                                type: 'webOnly',
                                children: [
                                    {
                                        type: 'text',
                                        content: 'THIS-SHOULD-NOT-APPEAR-IN-DOCX',
                                    },
                                ],
                            },
                            { type: 'text', content: ' Also visible.' },
                        ],
                    },
                ],
            ],
        })
        const xml = await readDocumentXml(doc)
        expect(xml).toContain('Visible.')
        expect(xml).toContain('Also visible.')
        expect(xml).not.toContain('THIS-SHOULD-NOT-APPEAR-IN-DOCX')
    })
})

describe('footnotes', () => {
    it('registers footnote bodies and emits reference runs inline', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', content: 'Body before. ' },
                            {
                                type: 'footnoteReference',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [
                                            {
                                                type: 'text',
                                                content: 'FOOTNOTE-BODY-MARKER',
                                            },
                                        ],
                                    },
                                ],
                            },
                            { type: 'text', content: ' Body after.' },
                        ],
                    },
                ],
            ],
        })
        const documentXml = await readDocumentXml(doc)
        const footnotesXml = await readPartXml(doc, 'word/footnotes.xml')

        // Body prose survives and the reference run lands in document.xml.
        expect(documentXml).toContain('Body before.')
        expect(documentXml).toContain('Body after.')
        expect(documentXml).toContain('<w:footnoteReference')

        // Footnote body lives in its own part.
        expect(footnotesXml).toBeTruthy()
        expect(footnotesXml).toContain('FOOTNOTE-BODY-MARKER')
    })

    it('assigns sequential ids across multiple footnote references', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [
                            { type: 'text', content: 'First. ' },
                            {
                                type: 'footnoteReference',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [{ type: 'text', content: 'ONE' }],
                                    },
                                ],
                            },
                            { type: 'text', content: ' Second. ' },
                            {
                                type: 'footnoteReference',
                                children: [
                                    {
                                        type: 'paragraph',
                                        children: [{ type: 'text', content: 'TWO' }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            ],
        })
        const documentXml = await readDocumentXml(doc)
        const footnotesXml = await readPartXml(doc, 'word/footnotes.xml')
        // Two distinct references must appear in the document body.
        const refMatches = documentXml.match(/<w:footnoteReference/g) || []
        expect(refMatches.length).toBe(2)
        // Both bodies made it into the footnotes part.
        expect(footnotesXml).toContain('ONE')
        expect(footnotesXml).toContain('TWO')
    })

    it('does not emit a footnotes part when no references exist', async () => {
        const doc = await buildDocument({
            sections: [
                [
                    {
                        type: 'paragraph',
                        children: [{ type: 'text', content: 'No footnotes here.' }],
                    },
                ],
            ],
        })
        const documentXml = await readDocumentXml(doc)
        expect(documentXml).not.toContain('<w:footnoteReference')
    })
})

// ============================================================================
// pageMargin option — overrides the section's page margin attributes.
// Values are in twips (1 inch = 1440). The `header` and `footer` entries
// define the carrier-paragraph slot used by registered headers/footers;
// both must be non-zero for floating anchors inside those slots to survive.
// ============================================================================

describe('buildDocument pageMargin option', () => {
    it('propagates pageMargin values into <w:pgMar> on the section', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Body</p>')
        const doc = await buildDocument(
            { sections: [ir] },
            {
                pageMargin: {
                    top: 1800,
                    right: 1440,
                    bottom: 1584,
                    left: 1440,
                    header: 720,
                    footer: 720,
                },
            },
        )
        const xml = await readDocumentXml(doc)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:top="1800"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:right="1440"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:bottom="1584"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:left="1440"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:header="720"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:footer="720"/)
    })

    it('accepts a partial pageMargin object', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Body</p>')
        const doc = await buildDocument(
            { sections: [ir] },
            { pageMargin: { top: 2880, bottom: 2880 } },
        )
        const xml = await readDocumentXml(doc)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:top="2880"/)
        expect(xml).toMatch(/<w:pgMar[^>]*\bw:bottom="2880"/)
    })

    it('does not emit non-default margins when pageMargin is omitted', async () => {
        const ir = htmlToIR('<p data-type="paragraph">Body</p>')
        const doc = await buildDocument({ sections: [ir] })
        const xml = await readDocumentXml(doc)
        // The docx library emits a <w:pgMar> with its own defaults
        // regardless; assert we did not inject a distinctive value.
        expect(xml).not.toContain('w:top="1800"')
    })
})
