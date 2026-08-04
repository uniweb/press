/**
 * A link's label is styled runs, not a string.
 *
 * Marks compose with an <a> from both directions, and both used to be lost in
 * parseStyledString's link branch, which returned without consulting the
 * accumulated styles or walking the body:
 *
 *   <sup><a href=…>1</a></sup>          the mark was silently dropped
 *   <a href=…><strong>x</strong></a>    the markup survived as a LITERAL
 *                                       string, which React escapes and Word
 *                                       renders as visible '<strong>x</strong>'
 *
 * The second is the one authors actually hit — `[**Read the paper**](…)` is
 * ordinary markdown. Both adapters could always format text inside a link
 * (docx walks link children through irToTextRunPair); the formatting simply
 * never reached them.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { Paragraph, H1 } from '../../src/docx/index.js'
import { compileInvoice } from '../integration/invoice-fixtures/_harness.jsx'

/** The <w:hyperlink> element, so an assertion can't pass on markup outside it. */
function hyperlinkOf(documentXml) {
    const match = documentXml.match(/<w:hyperlink[^>]*>.*?<\/w:hyperlink>/s)
    return match ? match[0] : ''
}

describe('marks on a link', () => {
    it('renders a mark inside the link, not its raw markup', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data='A <a href="https://e.com"><strong>bold</strong></a> link' />,
        )
        const link = hyperlinkOf(documentXml)

        expect(link).toMatch(/<w:b\/>/)
        expect(link).toMatch(/<w:t[^>]*>bold<\/w:t>/)
        // The regression: tag text reaching the document, escaped, as content.
        expect(documentXml).not.toMatch(/&lt;strong&gt;/)
    })

    it('applies a mark wrapping the link to its label', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data='See<sup><a href="https://e.com">1</a></sup>' />,
        )
        const link = hyperlinkOf(documentXml)

        expect(link).toMatch(/<w:vertAlign w:val="superscript"\/>/)
        expect(link).toMatch(/<w:t[^>]*>1<\/w:t>/)
    })

    it('keeps the Hyperlink style alongside the mark', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data='A <a href="https://e.com"><strong>bold</strong></a> link' />,
        )
        // The mark must not cost the link its styling — Word users restyle
        // links through the Hyperlink style, per the named-styles decision.
        expect(hyperlinkOf(documentXml)).toMatch(/<w:rStyle w:val="Hyperlink"\/>/)
    })

    it('splits a link label into runs when only part of it is marked', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data='<a href="https://e.com">x<sup>2</sup></a>' />,
        )
        const link = hyperlinkOf(documentXml)

        expect(link).toMatch(/<w:t[^>]*>x<\/w:t>/)
        expect(link).toMatch(/<w:vertAlign w:val="superscript"\/>/)
        expect(link).toMatch(/<w:t[^>]*>2<\/w:t>/)
    })

    it('carries marks through a heading link too', async () => {
        const { documentXml } = await compileInvoice(
            <H1 data='Read <a href="https://e.com"><em>the paper</em></a>' />,
        )
        const link = hyperlinkOf(documentXml)

        expect(link).toMatch(/<w:i\/>/)
        expect(documentXml).not.toMatch(/&lt;em&gt;/)
    })

    it('leaves an unmarked link unchanged', async () => {
        const { documentXml } = await compileInvoice(
            <Paragraph data='See <a href="https://e.com">the docs</a>.' />,
        )
        const link = hyperlinkOf(documentXml)

        expect(link).toMatch(/<w:t[^>]*>the docs<\/w:t>/)
        expect(link).toMatch(/<w:rStyle w:val="Hyperlink"\/>/)
        expect(link).not.toMatch(/<w:b\/>|<w:i\/>|<w:vertAlign/)
    })
})
