/**
 * In-document anchors, across both authoring paths.
 *
 * A Word internal hyperlink resolves by NAME: `<w:hyperlink w:anchor="x">`
 * finds `<w:bookmarkStart w:name="x"/>`. The IR carries that bare name — a
 * paragraph's `data-bookmark="x"` becomes exactly `w:name="x"`.
 *
 * Both producers used to break that contract, in different ways, and neither
 * failure was visible from the terminal:
 *
 *   <Link data={{href: '#section-3'}} />   emitted w:anchor="#section-3",
 *                                          which never matches w:name="section-3"
 *   <a href="#section-3"> in a data string emitted an EXTERNAL relationship
 *                                          (r:id), so there was no anchor at all
 *
 * The first is the documented example in docs/api/docx.md, so following the
 * documentation produced a dead link. The last test here is the one that
 * matters: it asserts the two halves meet in a single document.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { Paragraph, Link } from '../../src/docx/index.js'
import { compileInvoice } from '../integration/invoice-fixtures/_harness.jsx'

const anchorOf = (xml) => (xml.match(/w:anchor="([^"]*)"/) || [])[1] ?? null
const bookmarkOf = (xml) => (xml.match(/w:name="([^"]*)"/) || [])[1] ?? null

describe('in-document anchors', () => {
    describe('via the <Link> builder', () => {
        it('drops the fragment marker from a "#id" href', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph>
                    <Link data={{ label: 'See Section 3', href: '#section-3' }} />
                </Paragraph>,
            )
            expect(anchorOf(documentXml)).toBe('section-3')
        })

        it('still accepts a bare bookmark name', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph>
                    <Link data={{ label: 'See Section 3', href: 'section-3' }} />
                </Paragraph>,
            )
            expect(anchorOf(documentXml)).toBe('section-3')
        })
    })

    describe('via a data string', () => {
        it('emits an internal hyperlink, not an external relationship', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph data='See <a href="#section-3">Section 3</a>' />,
            )
            expect(anchorOf(documentXml)).toBe('section-3')
            // The regression: an external relationship carries r:id and cannot
            // address a bookmark.
            expect(documentXml).not.toMatch(/<w:hyperlink[^>]*r:id=/)
        })

        it('keeps marks on an anchor link', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph data='See <a href="#section-3"><strong>Section 3</strong></a>' />,
            )
            expect(anchorOf(documentXml)).toBe('section-3')
            expect(documentXml).toMatch(/<w:b\/>/)
        })

        it('leaves a real destination external', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph data='See <a href="https://e.com">the docs</a>' />,
            )
            expect(anchorOf(documentXml)).toBeNull()
            expect(documentXml).toMatch(/<w:hyperlink[^>]*r:id=/)
        })

        it('leaves a URL that merely carries a fragment external', async () => {
            const { documentXml } = await compileInvoice(
                <Paragraph data='See <a href="https://e.com/page#part">the docs</a>' />,
            )
            expect(anchorOf(documentXml)).toBeNull()
            expect(documentXml).toMatch(/<w:hyperlink[^>]*r:id=/)
        })
    })

    // The contract both halves exist to satisfy. Asserting the anchor's value
    // alone would still pass if the bookmark side ever changed shape.
    it('resolves against a data-bookmark target in the same document', async () => {
        const { documentXml } = await compileInvoice(
            <>
                <Paragraph data='Jump to <a href="#section-3">Section 3</a>' />
                <Paragraph data-bookmark="section-3" data="Section 3 body" />
            </>,
        )

        expect(anchorOf(documentXml)).toBe(bookmarkOf(documentXml))
        expect(anchorOf(documentXml)).toBe('section-3')
    })
})
