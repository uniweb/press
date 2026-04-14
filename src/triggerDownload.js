/**
 * Trigger a browser download for a Blob.
 *
 * Creates a temporary anchor element, clicks it to start the download,
 * and cleans up the object URL. No-op in environments without a DOM
 * (Node, SSR, tests without jsdom), so it can be called unconditionally
 * from isomorphic code.
 *
 * @param {Blob} blob - The blob to download.
 * @param {string} fileName - Name the browser should use for the saved file.
 */
export function triggerDownload(blob, fileName) {
    if (typeof document === 'undefined') return

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
