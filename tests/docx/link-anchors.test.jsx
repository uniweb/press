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

        // Everything that is NOT a fragment is a destination. These all used
        // to compile to `w:anchor="<the href>"` — a bookmark that cannot
        // exist — which does not merely fail to navigate: an anchor name is
        // not a URL, so the destination was destroyed and unrecoverable.
        //
        // `section-3` is in this list deliberately. It is indistinguishable
        // from `page.html`, so accepting a bare token as a bookmark name is
        // exactly what turned page links into dead anchors. '#' disambiguates.
        it.each([
            ['mailto:', 'mailto:someone@example.edu'],
            ['tel:', 'tel:+15551234567'],
            ['a site path', '/about'],
            ['a relative path', '../sibling'],
            ['a bare filename', 'page.html'],
            ['a bare token', 'section-3'],
            ['an unresolved framework reference', 'page:installation'],
        ])('emits %s as a destination, never an anchor', async (_label, href) => {
            const { documentXml } = await compileInvoice(
                <Paragraph>
                    <Link data={{ label: 'x', href }} />
                </Paragraph>,
            )
            expect(anchorOf(documentXml)).toBeNull()
            expect(documentXml).toMatch(/<w:hyperlink[^>]*r:id=/)
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

    // The two paths classified the same href differently until they were put
    // on one shared rule: `mailto:` was a working link written one way and a
    // dead anchor written the other. Divergence, not either verdict, was the
    // defect — so this asserts agreement rather than a particular shape.
    describe('both authoring paths agree', () => {
        it.each([
            ['#section-3'],
            ['mailto:someone@example.edu'],
            ['/about'],
            ['page:installation'],
            ['https://e.com'],
        ])('classifies %s the same either way', async (href) => {
            const viaBuilder = await compileInvoice(
                <Paragraph>
                    <Link data={{ label: 'x', href }} />
                </Paragraph>,
            )
            const viaData = await compileInvoice(
                <Paragraph data={`<a href="${href}">x</a>`} />,
            )
            expect(anchorOf(viaBuilder.documentXml)).toBe(anchorOf(viaData.documentXml))
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
