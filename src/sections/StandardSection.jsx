/**
 * Opinionated Uniweb content-shape renderer.
 *
 * Reads the standard Uniweb content shape (title, subtitle, description,
 * paragraphs, images, links, lists) and renders it through /docx builders,
 * eliminating the heading-paragraphs-images-links-lists boilerplate that
 * every foundation otherwise rewrites per section.
 *
 * StandardSection duck-types on the content shape — it does not import
 * from @uniweb/core. A non-Uniweb project that produces the same shape
 * gets it for free.
 *
 * Foundations that need child-block recursion pass a render function
 * via `renderChildBlocks`, typically kit's <ChildBlocks> component:
 *
 *   import { ChildBlocks } from '@uniweb/kit'
 *   <StandardSection
 *     block={block}
 *     renderChildBlocks={(b) => <ChildBlocks from={b} />}
 *   />
 *
 * StandardSection itself does not import from @uniweb/kit — doing so
 * would couple Press to Uniweb-specific rendering.
 */
import {
    H1,
    H2,
    H3,
    Paragraphs,
    Images,
    Links,
    Lists,
} from '../docx/index.js'
import { Section } from './Section.jsx'

export function StandardSection({
    block,
    content = block?.content,
    format = 'docx',
    renderChildBlocks,
}) {
    const c = content || {}
    return (
        <Section block={block} format={format}>
            {c.title && <H1 data={c.title} />}
            {c.subtitle && <H2 data={c.subtitle} />}
            {c.description && <H3 data={c.description} />}
            <Paragraphs data={c.paragraphs} />
            <Images data={c.images} />
            <Links data={c.links} />
            <Lists data={c.lists} />
            {renderChildBlocks && renderChildBlocks(block)}
        </Section>
    )
}
