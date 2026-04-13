/**
 * Image component for document output.
 *
 * Renders an <img> with data-type="image" and sizing attributes.
 * The docx adapter fetches the image data asynchronously during compilation.
 *
 * @param {Object} props
 * @param {Object} props.data - Image data: { value, url, alt }
 * @param {number} [props.width=400] - Image width in EMU-like units.
 * @param {number} [props.height=300] - Image height.
 */
import Paragraph from './Paragraph.jsx'

export default function Image({ data, width = 400, height = 300, ...props }) {
    if (!data) return null

    const { value, url, alt = '' } = typeof data === 'string' ? { url: data } : data
    const src = url || value || ''

    if (!src) return null

    return (
        <Paragraph as="div" {...props}>
            <img
                data-type="image"
                data-src={src}
                data-transformation-width={width}
                data-transformation-height={height}
                data-alttext-description={alt}
                src={src}
                alt={alt}
            />
        </Paragraph>
    )
}

/**
 * Render an array of images. Convenience wrapper.
 */
export function Images({ data, dataProps = {} }) {
    if (!data || !data.length) return null

    return data.map((img, index) => <Image key={index} data={img} {...dataProps} />)
}
