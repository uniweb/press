/**
 * Tests for @uniweb/press/docx unit conversion helpers.
 *
 * The key property we verify here: for every integer input in a
 * reasonable range, the local implementations produce bitwise
 * identical output to the docx library's own conversions. Foundation
 * code that imports from @uniweb/press/docx should get the same
 * values as code that imports from docx directly.
 *
 * When docx eventually ships a new version with different rounding,
 * this test suite catches the drift.
 */
import { describe, it, expect } from 'vitest'
import {
    convertMillimetersToTwip as pressConvertMm,
    convertInchesToTwip as pressConvertIn,
    convertCentimetersToTwip as pressConvertCm,
    convertPointsToHalfPoints as pressConvertPtHp,
} from '../../src/docx/units.js'
import {
    convertMillimetersToTwip as docxConvertMm,
    convertInchesToTwip as docxConvertIn,
} from 'docx'

describe('convertMillimetersToTwip', () => {
    it('matches the canonical docx formula at integer inputs', () => {
        for (let mm = 0; mm <= 300; mm++) {
            expect(pressConvertMm(mm)).toBe(docxConvertMm(mm))
        }
    })

    it('matches at non-integer inputs', () => {
        const samples = [0.5, 1.5, 2.5, 3.7, 10.25, 25.4, 210]
        for (const mm of samples) {
            expect(pressConvertMm(mm)).toBe(docxConvertMm(mm))
        }
    })

    it('returns 0 for 0 mm', () => {
        expect(pressConvertMm(0)).toBe(0)
    })

    it('produces reasonable values for common page margins', () => {
        // 25.4 mm = 1 inch = 1440 twips
        expect(pressConvertMm(25.4)).toBe(1440)
        // 20 mm ~= 1134 twips (per the floor formula)
        expect(pressConvertMm(20)).toBe(docxConvertMm(20))
    })
})

describe('convertInchesToTwip', () => {
    it('matches the canonical docx formula at integer inputs', () => {
        for (let inches = 0; inches <= 20; inches++) {
            expect(pressConvertIn(inches)).toBe(docxConvertIn(inches))
        }
    })

    it('matches at non-integer inputs', () => {
        const samples = [0.25, 0.5, 0.75, 1.5, 2.125, 8.5]
        for (const inches of samples) {
            expect(pressConvertIn(inches)).toBe(docxConvertIn(inches))
        }
    })

    it('returns 1440 for 1 inch', () => {
        expect(pressConvertIn(1)).toBe(1440)
    })

    it('returns 0 for 0 inches', () => {
        expect(pressConvertIn(0)).toBe(0)
    })
})

describe('convertCentimetersToTwip', () => {
    it('is equivalent to millimetersToTwip(cm * 10)', () => {
        for (let cm = 0; cm <= 30; cm++) {
            expect(pressConvertCm(cm)).toBe(pressConvertMm(cm * 10))
        }
    })

    it('returns 0 for 0 cm', () => {
        expect(pressConvertCm(0)).toBe(0)
    })

    it('produces the same result for 2.54 cm as 1 inch', () => {
        // 2.54 cm = 1 inch; should round to the same twip value.
        expect(pressConvertCm(2.54)).toBe(pressConvertIn(1))
    })
})

describe('convertPointsToHalfPoints', () => {
    it('doubles the input', () => {
        expect(pressConvertPtHp(11)).toBe(22)
        expect(pressConvertPtHp(12)).toBe(24)
        expect(pressConvertPtHp(14)).toBe(28)
        expect(pressConvertPtHp(24)).toBe(48)
    })

    it('rounds non-integer inputs', () => {
        expect(pressConvertPtHp(10.5)).toBe(21)
        expect(pressConvertPtHp(11.25)).toBe(23)
    })

    it('returns 0 for 0 points', () => {
        expect(pressConvertPtHp(0)).toBe(0)
    })
})
