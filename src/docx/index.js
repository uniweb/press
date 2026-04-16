/**
 * @uniweb/press/docx — React builder components for Word documents.
 *
 * Foundations import these to describe document content in JSX. The same
 * JSX renders as the React preview and — when useDocumentCompile('docx')
 * is called — is walked to produce a .docx file.
 *
 * The format adapter (compileDocx, buildDocument, the docx library) lives
 * at src/adapters/docx.js and is not part of this barrel. It is reached
 * only via the dynamic import in useDocumentCompile, so importing from
 * '@uniweb/press/docx' does not pull in the ~3.4 MB docx library.
 */

export { default as Paragraph, Paragraphs } from './Paragraph.jsx'
export { default as TextRun } from './TextRun.jsx'
export { H1, H2, H3, H4 } from './Headings.jsx'
export { default as Image, Images } from './Image.jsx'
export { default as Caption } from './Caption.jsx'
export { default as Figure } from './Figure.jsx'
export { Table, Tr, Td } from './Table.jsx'
export { default as Link, Links } from './Link.jsx'
export { default as List, Lists } from './List.jsx'
export { BulletList, NumberedList } from './Lists.jsx'
export { default as TableOfContents } from './TableOfContents.jsx'

export {
    convertMillimetersToTwip,
    convertCentimetersToTwip,
    convertInchesToTwip,
    convertPointsToHalfPoints,
} from './units.js'
