// @vitest-environment node
/**
 * Integration test for the Vite dev plugin.
 *
 * The plugin is a Vite plugin that installs a middleware. We don't need
 * a real Vite server — we can hand the plugin a minimal server shim that
 * captures the middleware registration, then drive it with a fake
 * IncomingMessage / ServerResponse pair.
 *
 * Skipped when the `typst` binary is not in PATH (the plugin shells out
 * to it to produce the PDF).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createServer } from 'node:http'
import { execSync } from 'node:child_process'
import { pressTypstCompile } from '../../src/vite-plugin-typst.js'

function typstAvailable() {
    try {
        execSync('typst --version', { stdio: 'ignore' })
        return true
    } catch {
        return false
    }
}

const HAS_TYPST = typstAvailable()

/**
 * Start a tiny HTTP server hosting the plugin's middleware, return the URL.
 * Closes automatically after the test.
 */
async function startPluginServer(plugin, pathPrefix = '/__press/typst/compile') {
    let boundMiddleware = null
    const fakeServer = {
        middlewares: {
            use(path, mw) {
                if (path === pathPrefix) boundMiddleware = mw
            },
        },
    }
    plugin.configureServer(fakeServer)
    expect(boundMiddleware).toBeTruthy()

    const server = createServer((req, res) => {
        // Only the plugin's registered path should reach the middleware.
        if (req.url === pathPrefix) {
            boundMiddleware(req, res, () => {
                res.statusCode = 404
                res.end('not handled')
            })
        } else {
            res.statusCode = 404
            res.end('not found')
        }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address()
    return {
        url: `http://127.0.0.1:${port}${pathPrefix}`,
        close: () => new Promise((r) => server.close(r)),
    }
}

describe('pressTypstCompile plugin', () => {
    it('rejects non-POST methods with 405', async () => {
        const plugin = pressTypstCompile()
        const { url, close } = await startPluginServer(plugin)
        try {
            const res = await fetch(url, { method: 'GET' })
            expect(res.status).toBe(405)
            expect(res.headers.get('allow')).toBe('POST')
        } finally {
            await close()
        }
    })

    it('rejects non-multipart bodies with 500 and a helpful message', async () => {
        const plugin = pressTypstCompile()
        const { url, close } = await startPluginServer(plugin)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ foo: 'bar' }),
            })
            expect(res.status).toBe(500)
            const body = await res.text()
            expect(body).toMatch(/multipart\/form-data/i)
        } finally {
            await close()
        }
    })

    it('rejects bundles missing main.typ', async () => {
        const plugin = pressTypstCompile()
        const { url, close } = await startPluginServer(plugin)
        try {
            const form = new FormData()
            form.append('meta.typ', new Blob(['#let meta = (title: "x")']), 'meta.typ')
            const res = await fetch(url, { method: 'POST', body: form })
            expect(res.status).toBe(500)
            const body = await res.text()
            expect(body).toMatch(/missing main\.typ/i)
        } finally {
            await close()
        }
    })

    it.skipIf(!HAS_TYPST)(
        'compiles a minimal bundle into a PDF',
        async () => {
            const plugin = pressTypstCompile()
            const { url, close } = await startPluginServer(plugin)
            try {
                const form = new FormData()
                form.append(
                    'main.typ',
                    new Blob(['= Hello from Press\n\nA minimal paragraph.']),
                    'main.typ',
                )
                const res = await fetch(url, { method: 'POST', body: form })
                expect(res.status).toBe(200)
                expect(res.headers.get('content-type')).toMatch(/application\/pdf/)
                const buf = await res.arrayBuffer()
                expect(buf.byteLength).toBeGreaterThan(500)
                // PDF magic bytes.
                const bytes = new Uint8Array(buf)
                expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF')
            } finally {
                await close()
            }
        },
        30000,
    )

    it('reports typst errors as 500 with the compiler stderr', async () => {
        if (!HAS_TYPST) return
        const plugin = pressTypstCompile()
        const { url, close } = await startPluginServer(plugin)
        try {
            const form = new FormData()
            // Deliberate syntax error: mismatched bracket.
            form.append(
                'main.typ',
                new Blob(['#let broken = (\n']),
                'main.typ',
            )
            const res = await fetch(url, { method: 'POST', body: form })
            expect(res.status).toBe(500)
            const body = await res.text()
            expect(body).toMatch(/error/i)
        } finally {
            await close()
        }
    })

    it('gives a helpful error when the typst binary is missing', async () => {
        const plugin = pressTypstCompile({ binary: '/nonexistent/typst-xyz' })
        const { url, close } = await startPluginServer(plugin)
        try {
            const form = new FormData()
            form.append('main.typ', new Blob(['= hi']), 'main.typ')
            const res = await fetch(url, { method: 'POST', body: form })
            expect(res.status).toBe(500)
            const body = await res.text()
            expect(body).toMatch(/not found in PATH|typst/i)
        } finally {
            await close()
        }
    })
})
