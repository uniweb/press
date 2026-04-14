/**
 * Integration test: the enriched builder components (Paragraph with data,
 * Paragraphs, Headings with data, Images, Links, Lists) produce valid docx.
 *
 * Exercises the phase 1.5 enrichment work.
 */
import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Packer } from 'docx'

import { htmlToIR } from '../../src/ir/parser.js'
import { buildDocument } from '../../src/adapters/docx.js'
import {
    H1,
    H2,
    Paragraph,
    Paragraphs,
    TextRun,
} from '../../src/docx/index.js'

describe('enriched builder components', () => {
    it('Paragraph with data prop parses styled strings', () => {
        const markup = <Paragraph data="Hello <strong>World</strong>" />
        const html = renderToStaticMarkup(markup)
        const ir = htmlToIR(html)

        expect(ir[0].type).toBe('paragraph')
        expect(ir[0].children).toBeDefined()
        // Should have at least one text child with bold=true
        const children = ir[0].children || []
        const boldChild = children.find((c) => c.type === 'text' && c.bold)
        expect(boldChild).toBeDefined()
        expect(boldChild.content).toBe('World')
    })

    it('Paragraphs renders an array of styled strings', () => {
        const markup = (
            <Paragraphs
                data={[
                    'First paragraph',
                    'Second with <em>emphasis</em>',
                    'Third with <u>underline</u>',
                ]}
            />
        )
        const html = renderToStaticMarkup(markup)
        const ir = htmlToIR(html)

        expect(ir).toHaveLength(3)
        expect(ir[0].type).toBe('paragraph')
        expect(ir[1].type).toBe('paragraph')
        expect(ir[2].type).toBe('paragraph')

        // Second paragraph should have italics
        const italicChild = ir[1].children.find((c) => c.type === 'text' && c.italics)
        expect(italicChild).toBeDefined()
    })

    it('Heading with data prop generates heading IR', () => {
        const markup = <H1 data="Section Title" />
        const html = renderToStaticMarkup(markup)
        const ir = htmlToIR(html)

        expect(ir[0]).toMatchObject({
            type: 'paragraph',
            heading: 'HEADING_1',
        })
    })

    it('builds valid docx from enriched components', async () => {
        const markup = (
            <>
                <H1 data="Report Title" />
                <H2 data="Section 1" />
                <Paragraphs
                    data={[
                        'First paragraph with <strong>bold</strong> text.',
                        'Second paragraph with <em>italic</em> text.',
                    ]}
                />
            </>
        )

        const html = renderToStaticMarkup(markup)
        const ir = htmlToIR(html)
        const doc = await buildDocument({ sections: [ir] })
        const buffer = await Packer.toBuffer(doc)

        expect(buffer).toBeInstanceOf(Buffer)
        expect(buffer[0]).toBe(0x50)
        expect(buffer[1]).toBe(0x4b)
        expect(buffer.length).toBeGreaterThan(4000)
    })

    it('IR preserves bold, italic, underline marks through pipeline', () => {
        const markup = (
            <Paragraph data="Plain <strong>bold</strong> <em>italic</em> <u>under</u> text" />
        )
        const html = renderToStaticMarkup(markup)
        const ir = htmlToIR(html)

        const children = ir[0].children || []
        const marks = children
            .filter((c) => c.type === 'text')
            .map((c) => ({
                content: c.content,
                bold: c.bold === 'true' || c.bold === true,
                italics: c.italics === 'true' || c.italics === true,
                underline: !!c.underline,
            }))

        expect(marks.some((m) => m.bold && m.content === 'bold')).toBe(true)
        expect(marks.some((m) => m.italics && m.content === 'italic')).toBe(true)
        expect(marks.some((m) => m.underline && m.content === 'under')).toBe(true)
    })
})
