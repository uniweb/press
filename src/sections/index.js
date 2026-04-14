/**
 * @uniweb/press/sections — higher-level section templates.
 *
 * Two layered helpers to eliminate the boilerplate every foundation
 * rewrites:
 *
 *   - Section: generic register-and-render wrapper. Zero content
 *     knowledge, format-agnostic.
 *   - StandardSection: opinionated renderer for Uniweb's standard
 *     content shape (title, subtitle, paragraphs, images, links, lists).
 *
 * Foundations that need neither can keep importing from '@uniweb/press'
 * and '@uniweb/press/docx' directly — /sections is additive sugar.
 */

export { Section } from './Section.jsx'
export { StandardSection } from './StandardSection.jsx'
