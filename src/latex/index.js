/**
 * @uniweb/press/latex — React builder components for LaTeX documents.
 *
 * The data-* attribute vocabulary is identical to the Typst builders
 * (paragraph, heading, list, blockQuote, image, table, chapterOpener,
 * codeBlock, asterism, raw, sequence, text, link). Both adapters walk
 * the same HTML-IR; the difference is downstream — typst.js emits
 * `*bold*` and `\=`-style headings, latex.js emits `\textbf{...}` and
 * `\section{...}`.
 *
 * Per `docs/architecture/adding-a-format.md` §"Worked example: LaTeX",
 * builders that share an attribute set with another HTML-based adapter
 * can be thin re-exports rather than parallel implementations. We
 * follow that here. Foundations writing JSX import from
 * `@uniweb/press/latex`; the same JSX produces a LaTeX bundle when
 * `compile('latex')` runs.
 *
 * The format adapter (compileLatex, buildBundle) lives at
 * src/adapters/latex.js and is intentionally NOT part of this barrel —
 * adapters are reached only via the dynamic import in
 * src/adapters/dispatch.js, so importing from '@uniweb/press/latex' does
 * not pull in the adapter or its ZIP helper.
 */

export {
    TextRun,
    Paragraph,
    Paragraphs,
    Heading,
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
    ChapterOpener,
    CodeBlock,
    List,
    BulletList,
    NumberedList,
    BlockQuote,
    Image,
    Table,
    Tr,
    Td,
    Asterism,
    Raw,
    Sequence,
} from '../typst/index.js'

// markRawLatex / sentinels — exposed so foundation code can wrap raw
// LaTeX strings that the adapter should pass through its body-text
// escape pass unchanged. See src/latex/raw.js for rationale.
export { markRawLatex, RAW_BEGIN, RAW_END } from './raw.js'

// LaTeX inset formatters — generic primitives that emit \cite{...} and
// \autoref{...} commands. Foundations supply the resolved keys; press
// supplies the emission shape + sentinel wrapping.
export { formatCite, formatAutoref } from './insets.js'
