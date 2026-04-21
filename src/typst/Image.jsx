/**
 * Image / figure. Emits <img data-type="image"> with src and optional alt,
 * width, caption. The adapter fetches, hashes, and rewrites src to
 * assets/<hash>.<ext> in the output bundle, and emits:
 *
 *   #figure(image("assets/<hash>.<ext>", width: <width>), caption: [<caption>])
 */
export default function Image({ src, alt, width, caption, ...props }) {
    const attrs = { 'data-type': 'image' }
    if (src) attrs['data-src'] = src
    if (alt) attrs.alt = alt
    if (width) attrs['data-width'] = width
    if (caption) attrs['data-caption'] = caption

    return <img src={src} {...attrs} {...props} />
}
