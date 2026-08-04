import { describe, it, expect } from 'vitest'
import { parseStyledString } from '../../src/docx/parseStyledString.js'

describe('parseStyledString', () => {
    it('parses plain text', () => {
        const result = parseStyledString('Hello World')
        expect(result).toEqual([{ type: 'text', content: 'Hello World' }])
    })

    it('parses bold text', () => {
        const result = parseStyledString('Hello <strong>World</strong>')
        expect(result).toEqual([
            { type: 'text', content: 'Hello ' },
            { type: 'text', content: 'World', bold: true },
        ])
    })

    it('parses italic text', () => {
        const result = parseStyledString('Hello <em>World</em>')
        expect(result).toEqual([
            { type: 'text', content: 'Hello ' },
            { type: 'text', content: 'World', italics: true },
        ])
    })

    it('parses underline text', () => {
        const result = parseStyledString('Hello <u>World</u>')
        expect(result).toEqual([
            { type: 'text', content: 'Hello ' },
            { type: 'text', content: 'World', underline: {} },
        ])
    })

    it('parses subscript text', () => {
        const result = parseStyledString('CO<sub>2</sub>')
        expect(result).toEqual([
            { type: 'text', content: 'CO' },
            { type: 'text', content: '2', subscript: true },
        ])
    })

    it('parses superscript text', () => {
        const result = parseStyledString('x<sup>2</sup>')
        expect(result).toEqual([
            { type: 'text', content: 'x' },
            { type: 'text', content: '2', superscript: true },
        ])
    })

    it('parses nested marks', () => {
        const result = parseStyledString('<strong><em>Bold Italic</em></strong>')
        expect(result).toEqual([
            { type: 'text', content: 'Bold Italic', bold: true, italics: true },
        ])
    })

    it('handles <b> and <i> tags', () => {
        const result = parseStyledString('<b>Bold</b> and <i>Italic</i>')
        expect(result).toEqual([
            { type: 'text', content: 'Bold', bold: true },
            { type: 'text', content: ' and ' },
            { type: 'text', content: 'Italic', italics: true },
        ])
    })

    it('handles empty string', () => {
        const result = parseStyledString('')
        expect(result).toEqual([{ type: 'text', content: '' }])
    })

    it('handles non-string input', () => {
        const result = parseStyledString(42)
        expect(result).toEqual([{ type: 'text', content: '42' }])
    })

    it('handles mixed styled and plain text', () => {
        const result = parseStyledString('Start <strong>bold</strong> middle <em>italic</em> end')
        expect(result).toHaveLength(5)
        expect(result[0]).toEqual({ type: 'text', content: 'Start ' })
        expect(result[1]).toEqual({ type: 'text', content: 'bold', bold: true })
        expect(result[2]).toEqual({ type: 'text', content: ' middle ' })
        expect(result[3]).toEqual({ type: 'text', content: 'italic', italics: true })
        expect(result[4]).toEqual({ type: 'text', content: ' end' })
    })

    // A link's label is styled runs, not a string. Marks compose with an <a>
    // from both directions and both used to be lost: an outer mark was
    // dropped, and an inner one survived as a literal '<strong>…</strong>'
    // that Word then displayed as visible tag text.
    describe('links carry marks', () => {
        it('parses a plain link, exposing its label as a single run', () => {
            const result = parseStyledString('See <a href="https://e.com">the docs</a>.')
            expect(result).toEqual([
                { type: 'text', content: 'See ' },
                {
                    type: 'link',
                    content: 'the docs',
                    href: 'https://e.com',
                    parts: [{ type: 'text', content: 'the docs' }],
                },
                { type: 'text', content: '.' },
            ])
        })

        it('applies a mark wrapping the link to its label', () => {
            const result = parseStyledString('See<sup><a href="https://e.com">1</a></sup>')
            expect(result[1]).toEqual({
                type: 'link',
                content: '1',
                href: 'https://e.com',
                parts: [{ type: 'text', content: '1', superscript: true }],
            })
        })

        it('parses a mark inside the link rather than leaving raw markup', () => {
            const result = parseStyledString('<a href="https://e.com"><strong>bold</strong></a>')
            expect(result).toEqual([
                {
                    type: 'link',
                    content: 'bold',
                    href: 'https://e.com',
                    parts: [{ type: 'text', content: 'bold', bold: true }],
                },
            ])
        })

        it('splits a link label into runs when only part of it is marked', () => {
            const result = parseStyledString('<a href="https://e.com">x<sup>2</sup></a>')
            expect(result[0].content).toBe('x2')
            expect(result[0].parts).toEqual([
                { type: 'text', content: 'x' },
                { type: 'text', content: '2', superscript: true },
            ])
        })
    })
})
