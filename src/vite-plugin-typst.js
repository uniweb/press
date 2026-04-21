/**
 * @uniweb/press/vite-plugin-typst
 *
 * Vite dev-server plugin that answers the Press typst adapter's server mode.
 *
 * On POST to the configured path (default `/__press/typst/compile`) it:
 *   1. Reads the multipart bundle (one form field per bundle file).
 *   2. Writes the files into a temp directory.
 *   3. Runs `typst compile main.typ out.pdf --root <tmpdir>`.
 *   4. Streams the resulting PDF back as application/pdf.
 *   5. Deletes the temp directory.
 *
 * Requirements: `typst` must be available in PATH. If not found, the
 * plugin responds 500 with a helpful message.
 *
 * Usage (vite.config.js):
 *
 *     import { defineSiteConfig } from '@uniweb/build/site'
 *     import { pressTypstCompile } from '@uniweb/press/vite-plugin-typst'
 *
 *     export default defineSiteConfig({ plugins: [pressTypstCompile()] })
 *
 * The plugin is dev-mode only (`apply: 'serve'`). Production deployments
 * need their own endpoint (same wire protocol) — a tiny Cloudflare Worker
 * or Express handler is ~20 lines.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

const DEFAULT_PATH = '/__press/typst/compile'

/**
 * @param {Object} [options]
 * @param {string} [options.path='/__press/typst/compile'] - URL path to answer.
 * @param {string} [options.binary='typst'] - Path to the typst binary.
 * @param {string[]} [options.extraArgs] - Extra CLI flags (e.g., ['--font-path', '/fonts']).
 * @returns {import('vite').Plugin}
 */
export function pressTypstCompile(options = {}) {
    const {
        path = DEFAULT_PATH,
        binary = 'typst',
        extraArgs = [],
    } = options

    return {
        name: 'uniweb:press-typst-compile',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(path, async (req, res, next) => {
                if (req.method !== 'POST') {
                    res.statusCode = 405
                    res.setHeader('Allow', 'POST')
                    res.end('Use POST')
                    return
                }
                try {
                    const blob = await readMultipartBundle(req)
                    const pdf = await compileBundleWithTypst(blob, {
                        binary,
                        extraArgs,
                    })
                    res.statusCode = 200
                    res.setHeader('content-type', 'application/pdf')
                    res.setHeader('content-length', String(pdf.length))
                    res.end(pdf)
                } catch (err) {
                    const msg = err.stack || err.message || String(err)
                    res.statusCode = 500
                    res.setHeader('content-type', 'text/plain; charset=utf-8')
                    res.end(msg)
                }
            })
        },
    }
}

// Re-exported default for symmetry with other Vite plugins people use.
export default pressTypstCompile

// ─────────────────────────────────────────────────────────────────────

/**
 * Read a multipart/form-data request body into a { filename: bytes } map.
 * Uses Node's built-in Web-API-style Request parser via the Fetch API
 * (undici), which handles the boundary and file field semantics for us.
 */
async function readMultipartBundle(req) {
    const contentType = req.headers['content-type'] || ''
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
        throw new Error(
            `Expected multipart/form-data, got: ${contentType || '(none)'}`,
        )
    }

    // Node's Request class (from undici) can parse multipart for us when
    // we hand it a readable body. Bridge the node IncomingMessage to a
    // Web-style ReadableStream via Readable.toWeb.
    const body = Readable.toWeb(req)
    const request = new Request('http://plugin.local/compile', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body,
        duplex: 'half',
    })

    const form = await request.formData()

    const files = {}
    for (const [name, value] of form.entries()) {
        if (typeof value === 'string') {
            files[name] = value
        } else if (value && typeof value.arrayBuffer === 'function') {
            const ab = await value.arrayBuffer()
            files[name] = new Uint8Array(ab)
        }
    }

    if (!files['main.typ']) {
        throw new Error(
            `Bundle missing main.typ. Expected fields: main.typ, meta.typ, content.typ, preamble.typ, template.typ. ` +
                `Got: ${Object.keys(files).join(', ') || '(none)'}`,
        )
    }

    return files
}

/**
 * Write the bundle to a temp dir, run `typst compile`, read the PDF,
 * clean up. Returns the PDF bytes.
 */
async function compileBundleWithTypst(files, { binary, extraArgs }) {
    const dir = await mkdtemp(join(tmpdir(), 'press-typst-'))
    try {
        for (const [name, contents] of Object.entries(files)) {
            const buf =
                typeof contents === 'string'
                    ? Buffer.from(contents, 'utf8')
                    : Buffer.from(contents.buffer, contents.byteOffset, contents.byteLength)
            await writeFile(join(dir, name), buf)
        }

        const inputPath = join(dir, 'main.typ')
        const outPath = join(dir, 'out.pdf')

        await runTypst(binary, ['compile', ...extraArgs, inputPath, outPath])

        return await readFile(outPath)
    } finally {
        // Best-effort cleanup — don't fail the request if this throws.
        rm(dir, { recursive: true, force: true }).catch(() => {})
    }
}

function runTypst(binary, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        proc.stdout.on('data', () => {})
        proc.stderr.on('data', (chunk) => {
            stderr += chunk.toString()
        })
        proc.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(
                    new Error(
                        `\`${binary}\` not found in PATH. Install Typst (https://typst.app) ` +
                            `or run \`pnpm add -D typst\` to get a bundled binary.`,
                    ),
                )
            } else {
                reject(err)
            }
        })
        proc.on('close', (code) => {
            if (code === 0) resolve()
            else
                reject(
                    new Error(
                        `\`${binary} compile\` exited ${code}.\n${stderr.trim() || '(no stderr)'}`,
                    ),
                )
        })
    })
}
