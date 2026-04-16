/**
 * Image — inline-to-block <img> with Press's docx semantics.
 *
 * Emits a bare <img data-type="image"> so the IR walker's image node
 * reaches the docx adapter at the section level, where irToImageParagraph
 * fetches the bytes and wraps them in a DocxParagraph. Wrapping the image
 * in another paragraph at render time would push it into inline context,
 * where the adapter deliberately drops images.
 *
 * For a figure + caption block, use <Figure> from @uniweb/press/docx —
 * it composes Image with a data-type="contentWrapper" figure and a
 * Caption paragraph.
 *
 * Site-absolute URLs ('/foo.png') are resolved against the `basePath`
 * provided by the enclosing <DocumentProvider> so the <img> and the
 * docx-adapter fetch both use the deployed origin-relative URL. External
 * and relative URLs are passed through unchanged.
 *
 * @param {Object} props
 * @param {Object|string} props.data - Either a URL string or { url, value, alt }.
 * @param {number} [props.width=400] - Target docx width, in the transformation unit the docx library uses.
 * @param {number} [props.height=300] - Target docx height.
 */
import { useContext } from 'react'
import { BasePathContext } from '../BasePathContext.js'
import { resolveUrl } from './resolveUrl.js'

export default function Image({
    data,
    width = 400,
    height = 300,
    className,
    style,
    ...props
}) {
    const basePath = useContext(BasePathContext)
    if (!data) return null

    const { value, url, alt = '' } = typeof data === 'string' ? { url: data } : data
    const rawSrc = url || value || ''
    if (!rawSrc) return null

    const src = resolveUrl(rawSrc, basePath)

    return (
        <img
            data-type="image"
            data-src={src}
            data-transformation-width={width}
            data-transformation-height={height}
            data-alttext-description={alt}
            src={src}
            alt={alt}
            className={className}
            style={{ display: 'block', maxWidth: '100%', height: 'auto', ...style }}
            {...props}
        />
    )
}

/**
 * Render an array of images.
 */
export function Images({ data, dataProps = {} }) {
    if (!data || !data.length) return null
    return data.map((img, index) => <Image key={index} data={img} {...dataProps} />)
}
