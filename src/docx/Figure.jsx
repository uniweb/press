/**
 * Figure — an image paired with an optional caption.
 *
 * Renders <figure data-type="contentWrapper"> so the IR walker dissolves
 * the wrapper at compile time, leaving the image and the caption as
 * sibling section-level paragraphs in the docx. The web preview keeps
 * the semantic <figure>/<figcaption> markup.
 *
 * Pass a string `caption` prop for the common case; pass `children`
 * instead (a <Caption> element and/or a custom <Image>) for full control.
 *
 * @param {Object} props
 * @param {string} props.src - Image URL (absolute or site-relative).
 * @param {string} [props.alt] - Alt text (also becomes the docx image description).
 * @param {number} [props.width=480] - Docx image width.
 * @param {number} [props.height=320] - Docx image height.
 * @param {React.ReactNode} [props.caption] - Caption text or inline-styled string.
 * @param {string} [props.className] - Class on the outer <figure>.
 * @param {string} [props.imgClassName] - Class on the inner <img>.
 * @param {string} [props.captionClassName] - Class on the <figcaption>.
 */
import Image from './Image.jsx'
import Caption from './Caption.jsx'

export default function Figure({
    src,
    alt = '',
    width = 480,
    height = 320,
    caption,
    className,
    imgClassName,
    captionClassName,
    children,
    ...props
}) {
    const image =
        src != null ? (
            <Image
                data={{ url: src, alt }}
                width={width}
                height={height}
                className={imgClassName}
                {...props}
            />
        ) : null

    // Route string captions through Caption's `data` prop so inline marks
    // (<strong>, <em>, <a>) parse rather than render as escaped text.
    // React children would be HTML-escaped.
    const captionEl = caption
        ? typeof caption === 'string'
            ? (
                <Caption
                    as="figcaption"
                    className={captionClassName}
                    data={caption}
                />
              )
            : (
                <Caption as="figcaption" className={captionClassName}>
                    {caption}
                </Caption>
              )
        : null

    return (
        <figure data-type="contentWrapper" className={className}>
            {children ?? (
                <>
                    {image}
                    {captionEl}
                </>
            )}
        </figure>
    )
}
