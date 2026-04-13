import { describe, it, expect } from 'vitest'
import { parseStyledString } from '../../src/sdk/parseStyledString.js'

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
})
