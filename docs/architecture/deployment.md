# Deploying a Press compile endpoint

This doc exists for formats that can't compile in the browser. Typst today needs a native binary or a heavy WASM runtime; LaTeX will probably always need a server. A compile endpoint is Press's escape hatch for formats like these — see [principle 3](./principles.md#3-frontend-first-backends-are-escape-hatches) for why server mode is explicitly framed as a fallback, not the architecture.

Most Press deployments don't need this doc. If every format your foundation offers has a frontend compile path (docx, xlsx, typst in `sources` mode, future Paged.js in `html` mode), you can deploy Press as a static site and stop reading here.

If you're running Typst `server` mode, or when LaTeX, Paged.js `server` mode, or Pandoc integration ship, this is the doc for standing up the backend those modes talk to.

## The wire protocol

One HTTP operation, deliberately minimal.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: one field per bundle file, field name equal to filename. For Typst: `main.typ`, `meta.typ`, `content.typ`, `preamble.typ`, `template.typ`. The server writes them verbatim into a temp directory and runs the compiler.

**Response:**
- Success: `200 OK`, `Content-Type: application/pdf`, body = PDF bytes.
- Failure: any `4xx` / `5xx`, `Content-Type: text/plain; charset=utf-8`, body = the compiler's stderr or a meaningful error message. The `DownloadButton` surfaces the body text to the user.

That's the whole contract. Client-side code doesn't care where the endpoint lives:

```jsx
<DownloadButton endpoint="https://api.example.com/press/typst/compile" />
```

Same protocol, same Blob back.

## Reference implementations

Key design points for all of them: stateless (no session), short-lived temp directories per request, no persistence, aggressive timeouts. The actual compile is the only work.

When Press ships a reference production endpoint (a deliberate future move — see [principle 3](./principles.md#3-frontend-first-backends-are-escape-hatches) for why it isn't shipped now), **Cloudflare is the target platform**, because Uniweb sites are hosted there. The Cloudflare section below is accordingly the most developed. The other platforms are documented as alternatives for foundations hosted elsewhere, not as recommendations.

### Cloudflare (primary target)

Cloudflare Workers on their own can't run native binaries, which means a Typst or LaTeX endpoint needs one of two architectures. Both preserve the wire protocol above; only the backend changes.

**Option A: Worker → Container Service.** A Worker receives the multipart request, forwards it to a Container Service running the `typst` binary (`typst compile`), and streams the resulting PDF back. Cloudflare's Containers + Dispatch make this a few lines of Worker code and a small Dockerfile for the container image. Scales with Container Service concurrency; cold-starts measured in low seconds.

Trade-offs: introduces a second deployable (the container), and Container Service pricing dominates the cost model for this path. But it's the path with the strongest font story — the container can carry an arbitrary font directory, matching what a foundation would get from a generic Node server.

**Option B: WASM Typst in the Worker.** `@myriaddreamin/typst-ts-web-compiler` compiles Typst sources to PDF inside a V8 isolate. The Worker receives the multipart request, feeds sources to the WASM compiler, returns the PDF. No containers, no separate deployable. Font delivery is the hard part: WASM Typst needs fonts loaded explicitly, and Workers have tight size limits, so a curated font set shipped in R2 is the realistic path.

Trade-offs: constrained fonts (whatever fits in the R2 payload the Worker fetches), but much simpler deployment and cheaper at scale. Likely to become viable on its own as WASM Typst matures; today it's a partial solution.

**Which to pick.** For a first production endpoint where font freedom matters, Option A. For a second-phase endpoint where cost and simplicity dominate and the font set is fixed, Option B. Both can coexist — an endpoint routing to one or the other based on format or load — but that's likely overengineering for the near term.

### Express / Node (canonical reference)

The easiest implementation to read and reason about. ~25 lines:

```js
import express from 'express'
import multer from 'multer'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const app = express()
const upload = multer()

app.post('/press/typst/compile', upload.any(), async (req, res) => {
    const dir = await mkdtemp(join(tmpdir(), 'press-'))
    try {
        for (const f of req.files) {
            await writeFile(join(dir, f.fieldname), f.buffer)
        }
        const out = join(dir, 'out.pdf')
        await runTypst(['compile', join(dir, 'main.typ'), out])
        res.type('application/pdf').send(await readFile(out))
    } catch (err) {
        res.status(500).type('text/plain').send(err.message || String(err))
    } finally {
        rm(dir, { recursive: true, force: true }).catch(() => {})
    }
})

function runTypst(args) {
    return new Promise((resolve, reject) => {
        let stderr = ''
        const p = spawn('typst', args)
        p.stderr.on('data', (b) => (stderr += b))
        p.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(stderr))
        )
    })
}
```

Scales horizontally because nothing is shared state. Useful as the first thing to stand up for local testing or a self-hosted deployment; not the architecture the Uniweb ecosystem itself will use.

### AWS Lambda (container image)

Package the `typst` binary into a container image (Dockerfile `FROM public.ecr.aws/lambda/nodejs:20` + `RUN apt-get install typst` or download-and-extract). The handler runs the same Node code as above, reading `event.body` (API Gateway decodes multipart if configured) and returning a base64 body with `isBase64Encoded: true`.

Cold-start concern: the Typst binary adds ~10 MB to the image; warm-start is fine.

### Serverless function (Vercel, Netlify)

Same shape as Lambda, different packaging. Vercel's serverless runtime supports attaching a binary via `includeFiles`; Netlify's background functions are fine for the 10-second-ish compile budget.

## Operational concerns

- **Timeouts.** Typst's compiler is fast (single-digit seconds for a 200-page book on modern hardware). Set the endpoint's timeout at 30s; any book longer than that isn't being served well by a synchronous request anyway.
- **Concurrency.** Stateless compiles parallelise trivially. Bound concurrency via the platform's autoscaling or an explicit queue if needed.
- **Payload size.** Bundles are typically a few hundred KB of source. `content.typ` grows linearly with book size but stays under a few MB even for large books. Keep the endpoint's max body size at 10 MB.
- **Caching.** Same bundle → same PDF (Typst is deterministic). A hash of the bundle is a legitimate cache key; served from a CDN, popular-book downloads become free after the first request. On Cloudflare this is particularly cheap — Workers can check a KV or R2 cache before forwarding to the container.

## Fonts

Fonts interact with each adapter differently. The current picture:

**Typst (shipped).** The `typst` binary reads fonts from system paths, `--font-path`, or the embedded defaults (New Computer Modern). A server endpoint can ship a font directory and pass `--font-path`; the Vite dev plugin exposes `extraArgs` for that. For `sources` mode, fonts are the user's problem — they compile locally with whatever they have installed. For in-browser Typst (WASM mode, when it ships), fonts must be loaded explicitly into the WASM runtime — the foundation will need to declare a fonts manifest and the adapter will forward it.

**docx (shipped).** The `docx` library writes font names into the docx XML; whoever opens the file (Word, Pages, LibreOffice) resolves them at open time. No fonts ship with the file. This is why Word documents look different across machines — you're relying on the reader having your fonts installed. If you need font fidelity, embed the fonts as a Word feature (docx supports this; the library has options) or ship the fonts alongside the `.docx` as a note for recipients.

**Paged.js (roadmap).** Fonts are regular web fonts — loaded via `@font-face` in CSS, resolved by the browser. Same font story as the web view. This is actually the simplest path for font fidelity: whatever fonts your site uses for the web, Paged.js will use for the print PDF.

**LaTeX (speculative).** LaTeX typically uses its own font configuration (pdfLaTeX has legacy font packages; XeLaTeX and LuaLaTeX can load system TrueType/OpenType). A server endpoint passes the font-config file alongside the sources. Matches the Typst server story closely.

**General pattern across all adapters: font policy is a foundation decision, not a Press decision.** Press exposes a hook (a string argument, an options object, a directory path) that the foundation fills in. No font logic lives in Press core.

## What Press does not ship

Press ships a Vite dev plugin (`pressTypstCompile`) because it's a two-line install that makes local development work. The plugin is explicitly dev-only — `apply: 'serve'` — and will refuse to run in a production build.

Press deliberately does not ship a production server today. The wire protocol above is small enough that every deployment has its own hosting story, and shipping a reference worker would mean maintaining it across Lambda, Cloudflare, Vercel, Netlify, and whatever comes next before Press itself is 1.0.

A future `@uniweb/press-compile-server` package is the likely shape when this changes — a Cloudflare-first deployable that speaks the wire protocol, with a clean path for self-hosted alternatives. Keeping it as a separate package preserves Press itself as a pure client library.

## See also

- [principles.md](./principles.md) — particularly principle 3 on frontend-first.
- [overview.md](./overview.md) — the broader architecture these endpoints slot into.
- [format-roadmap.md](./format-roadmap.md) — which formats currently need a backend, which don't, and which haven't decided.
- [adding-a-format.md](./adding-a-format.md) — the adapter side of this story.
