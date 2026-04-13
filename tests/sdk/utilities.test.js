import { describe, it, expect } from 'vitest'
import { makeCurrency, makeParentheses, makeRange, join } from '../../src/sdk/utilities.js'

describe('makeCurrency', () => {
    it('formats a number as currency', () => {
        expect(makeCurrency('1000')).toBe('$1,000.00')
    })

    it('formats without symbol', () => {
        expect(makeCurrency('1000', false)).toBe('1,000.00')
    })

    it('handles commas in input', () => {
        expect(makeCurrency('1,234,567')).toBe('$1,234,567.00')
    })

    it('handles non-numeric input', () => {
        expect(makeCurrency('N/A')).toBe('$N/A')
    })
})

describe('makeParentheses', () => {
    it('wraps text in parentheses', () => {
        expect(makeParentheses('hello')).toBe('(hello)')
    })

    it('returns empty for falsy', () => {
        expect(makeParentheses('')).toBe('')
        expect(makeParentheses(null)).toBe('')
    })
})

describe('makeRange', () => {
    it('creates range string', () => {
        expect(makeRange('2020', '2025')).toBe('2020 - 2025')
    })

    it('returns single value when one missing', () => {
        expect(makeRange('2020', '')).toBe('2020')
        expect(makeRange('', '2025')).toBe('2025')
    })

    it('returns empty when both missing', () => {
        expect(makeRange('', '')).toBe('')
    })
})

describe('join', () => {
    it('joins with default separator', () => {
        expect(join(['a', 'b', 'c'])).toBe('a b c')
    })

    it('joins with custom separator', () => {
        expect(join(['a', 'b', 'c'], ', ')).toBe('a, b, c')
    })

    it('filters falsy values', () => {
        expect(join(['a', '', null, 'b'], ', ')).toBe('a, b')
    })
})
