/**
 * @uniweb/press/typst — React builder components for Typst documents.
 *
 * Foundations import these to describe book-shaped content in JSX. The
 * same JSX renders as the React preview and — when useDocumentCompile('typst')
 * is called — is walked to produce a Typst source bundle (sources mode) or
 * a compiled PDF (server mode, via a backend running the `typst` CLI).
 *
 * The format adapter (compileTypst, buildBundle) lives at
 * src/adapters/typst.js and is not part of this barrel. It is reached
 * only via the dynamic import in useDocumentCompile, so importing from
 * '@uniweb/press/typst' does not pull in the adapter or its ZIP helper.
 */

export { default as TextRun } from './TextRun.jsx'
export { default as Paragraph, Paragraphs } from './Paragraph.jsx'
export { default as Heading, H1, H2, H3, H4, H5, H6 } from './Heading.jsx'
export { default as ChapterOpener } from './ChapterOpener.jsx'
export { default as CodeBlock } from './CodeBlock.jsx'
export { default as List, BulletList, NumberedList } from './List.jsx'
export { default as BlockQuote } from './BlockQuote.jsx'
export { default as Image } from './Image.jsx'
export { Table, Tr, Td } from './Table.jsx'
export { default as Asterism } from './Asterism.jsx'
export { default as Raw } from './Raw.jsx'
export { default as Sequence } from './Sequence.jsx'
