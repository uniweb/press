import { describe, it, expect } from 'vitest'
import {
    attributeMap,
    attributesToProperties,
    setPath,
} from '../../src/ir/attributes.js'

describe('setPath', () => {
    it('sets a top-level key', () => {
        const obj = {}
        setPath(obj, ['foo'], 'bar')
        expect(obj).toEqual({ foo: 'bar' })
    })

    it('creates intermediate objects when nesting', () => {
        const obj = {}
        setPath(obj, ['a', 'b', 'c'], 42)
        expect(obj).toEqual({ a: { b: { c: 42 } } })
    })

    it('preserves existing sibling keys at each level', () => {
        const obj = { a: { existing: 1 } }
        setPath(obj, ['a', 'new'], 2)
        expect(obj).toEqual({ a: { existing: 1, new: 2 } })
    })

    it('overwrites non-object intermediate values with objects', () => {
        // Defensive behavior: if a shallower value was previously a string,
        // subsequent nested paths should overwrite it rather than crash.
        const obj = { a: 'clobber-me' }
        setPath(obj, ['a', 'b'], 'v')
        expect(obj).toEqual({ a: { b: 'v' } })
    })

    it('overwrites existing leaf values', () => {
        const obj = { a: 'old' }
        setPath(obj, ['a'], 'new')
        expect(obj).toEqual({ a: 'new' })
    })
})

describe('attributeMap', () => {
    it('covers every attribute from the legacy switch statement', () => {
        // Canary: if someone adds or removes an attribute, this test updates
        // deliberately. Matches the count from report-sdk/src/utils.js:223-410.
        // 1 underline + 3 positionaltab + 2 spacing + 2 transformation
        // + 1 bullet + 3 numbering + 3 alttext + 2 width + 4 margins
        // + 12 borders + 1 image-type + 6 floating = 40 entries.
        const keys = Object.keys(attributeMap)
        expect(keys).toHaveLength(40)
    })

    it('does not contain data-type', () => {
        expect(attributeMap).not.toHaveProperty('data-type')
    })
})

describe('attributesToProperties', () => {
    describe('skipping rules', () => {
        it('returns an empty object for no attributes', () => {
            expect(attributesToProperties([])).toEqual({})
        })

        it('skips non-data attributes', () => {
            const result = attributesToProperties([
                { name: 'class', value: 'pl-8' },
                { name: 'id', value: 'foo' },
                { name: 'style', value: 'color: red' },
            ])
            expect(result).toEqual({})
        })

        it('skips data-type (consumed by parser separately)', () => {
            const result = attributesToProperties([
                { name: 'data-type', value: 'tableCell' },
            ])
            expect(result).toEqual({})
        })
    })

    describe('explicit attribute rules', () => {
        it('maps data-margins-* to a nested margins object', () => {
            const result = attributesToProperties([
                { name: 'data-margins-top', value: '100' },
                { name: 'data-margins-bottom', value: '50' },
                { name: 'data-margins-left', value: '25' },
                { name: 'data-margins-right', value: '75' },
            ])
            expect(result).toEqual({
                margins: { top: '100', bottom: '50', left: '25', right: '75' },
            })
        })

        it('maps data-borders-*-* to a twice-nested borders object', () => {
            const result = attributesToProperties([
                { name: 'data-borders-top-style', value: 'single' },
                { name: 'data-borders-top-size', value: '4' },
                { name: 'data-borders-top-color', value: 'ffffff' },
                { name: 'data-borders-bottom-style', value: 'double' },
            ])
            expect(result).toEqual({
                borders: {
                    top: { style: 'single', size: '4', color: 'ffffff' },
                    bottom: { style: 'double' },
                },
            })
        })

        it('maps data-positionaltab-relativeto to camelCase relativeTo', () => {
            // Note the casing difference: the HTML attribute is lowercase
            // (because HTML attrs are case-insensitive), but the IR uses
            // camelCase to match the docx library's expected property name.
            const result = attributesToProperties([
                { name: 'data-positionaltab-relativeto', value: 'margin' },
            ])
            expect(result).toEqual({
                positionalTab: { relativeTo: 'margin' },
            })
        })

        it('maps data-floating-* to twice-nested floating object', () => {
            const result = attributesToProperties([
                { name: 'data-floating-horizontalposition-relative', value: 'page' },
                { name: 'data-floating-horizontalposition-align', value: 'center' },
                { name: 'data-floating-horizontalposition-offset', value: '100' },
                { name: 'data-floating-verticalposition-relative', value: 'margin' },
            ])
            expect(result).toEqual({
                floating: {
                    horizontalPosition: {
                        relative: 'page',
                        align: 'center',
                        offset: '100',
                    },
                    verticalPosition: {
                        relative: 'margin',
                    },
                },
            })
        })

        it('maps data-underline to an empty object regardless of value', () => {
            // Presence-triggered: value is ignored.
            const result1 = attributesToProperties([
                { name: 'data-underline', value: 'true' },
            ])
            const result2 = attributesToProperties([
                { name: 'data-underline', value: '' },
            ])
            expect(result1).toEqual({ underline: {} })
            expect(result2).toEqual({ underline: {} })
        })

        it('maps data-image-type to a flat imageType property', () => {
            const result = attributesToProperties([
                { name: 'data-image-type', value: 'png' },
            ])
            expect(result).toEqual({ imageType: 'png' })
        })

        it('maps data-width-size and data-width-type to a nested width object', () => {
            const result = attributesToProperties([
                { name: 'data-width-size', value: '50' },
                { name: 'data-width-type', value: 'percentage' },
            ])
            expect(result).toEqual({
                width: { size: '50', type: 'percentage' },
            })
        })

        it('maps data-bullet-level to a nested bullet object', () => {
            const result = attributesToProperties([
                { name: 'data-bullet-level', value: '2' },
            ])
            expect(result).toEqual({ bullet: { level: '2' } })
        })

        it('maps all three data-alttext-* to a nested altText object', () => {
            const result = attributesToProperties([
                { name: 'data-alttext-title', value: 'Photo' },
                { name: 'data-alttext-description', value: 'A sunset' },
                { name: 'data-alttext-name', value: 'sunset.jpg' },
            ])
            expect(result).toEqual({
                altText: {
                    title: 'Photo',
                    description: 'A sunset',
                    name: 'sunset.jpg',
                },
            })
        })
    })

    describe('default fallthrough', () => {
        it('strips the data- prefix for unknown attributes', () => {
            const result = attributesToProperties([
                { name: 'data-bold', value: 'true' },
                { name: 'data-italics', value: 'true' },
            ])
            expect(result).toEqual({ bold: 'true', italics: 'true' })
        })

        it('maps data-heading to a flat heading property', () => {
            // Used by H1-H4 builder components to propagate heading level.
            const result = attributesToProperties([
                { name: 'data-heading', value: 'HEADING_1' },
            ])
            expect(result).toEqual({ heading: 'HEADING_1' })
        })

        it('maps data-link and data-anchor for hyperlinks', () => {
            const result = attributesToProperties([
                { name: 'data-link', value: 'https://example.com' },
            ])
            expect(result).toEqual({ link: 'https://example.com' })
        })

        it('maps data-src for images', () => {
            const result = attributesToProperties([
                { name: 'data-src', value: '/images/hero.png' },
            ])
            expect(result).toEqual({ src: '/images/hero.png' })
        })
    })

    describe('mixed scenarios', () => {
        it('combines explicit rules, fallthroughs, and skipped attributes correctly', () => {
            const result = attributesToProperties([
                { name: 'class', value: 'pl-8' }, // skipped
                { name: 'data-type', value: 'tableCell' }, // skipped
                { name: 'data-width-size', value: '25' }, // explicit
                { name: 'data-width-type', value: 'pct' }, // explicit, merges
                { name: 'data-margins-top', value: '100' }, // explicit
                { name: 'data-bold', value: 'true' }, // fallthrough
            ])
            expect(result).toEqual({
                width: { size: '25', type: 'pct' },
                margins: { top: '100' },
                bold: 'true',
            })
        })

        it('does not mutate the input attribute list', () => {
            const attrs = [
                { name: 'data-margins-top', value: '100' },
                { name: 'data-bold', value: 'true' },
            ]
            const snapshot = JSON.parse(JSON.stringify(attrs))
            attributesToProperties(attrs)
            expect(attrs).toEqual(snapshot)
        })
    })
})
