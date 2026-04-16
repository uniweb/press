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
 * @param {Object} props
 * @param {Object|string} props.data - Either a URL string or { url, value, alt }.
 * @param {number} [props.width=400] - Target docx width, in the transformation unit the docx library uses.
 * @param {number} [props.height=300] - Target docx height.
 */
export default function Image({
    data,
    width = 400,
    height = 300,
    className,
    style,
    ...props
}) {
    if (!data) return null

    const { value, url, alt = '' } = typeof data === 'string' ? { url: data } : data
    const src = url || value || ''
    if (!src) return null

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
