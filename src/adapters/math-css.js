/**
 * @fileoverview The CSS a Temml-produced MathML document needs to lay out.
 *
 * Math arrives as MathML, which browsers render natively — so it is tempting to
 * conclude, as this pipeline's own comments once did, that it carries no CSS
 * dependency at all. It carries a large one, and `<menclose>` is the proof:
 * that element is NOT part of MathML-Core, it is Temml's own polyfill, and the
 * rules that draw `\cancel`, `\overline` and `\sout` over it exist only in
 * Temml's stylesheet. Without them those constructs render as the bare term — a
 * formula that means something different from what the author wrote.
 *
 * ── Why this is a vendored string and not an import ──
 *
 * The browser lane (`@uniweb/kit/math-tokens.css`) simply does
 * `@import "temml/dist/Temml-Local.css"` and lets the bundler resolve it. press
 * cannot: its adapters EMIT CSS as a string into a document, run in browser
 * hosts as well as Node ones (see the host-supplied asset loaders in
 * `assets/fetch.js`), and press has — by constitution — no `@uniweb/*`
 * dependency at all. So the declarations are genuinely duplicated here.
 *
 * That duplicate is pinned mechanically rather than by comment:
 * `framework/_contracts/math-css-parity.test.js` recomposes this value from the
 * real `temml` package plus kit's stylesheet and fails when they disagree.
 * Regenerate rather than hand-edit `TEMML_BASE`.
 *
 * ── The two deliberate departures from Temml's sheet ──
 *
 * 1. **`@font-face` is stripped.** It points at `Temml.woff2`, which a bundler
 *    emits as an asset for the browser lane but which press would have to
 *    package into the EPUB itself. Fixing it is an asset question for the EPUB
 *    adapter, not a CSS one.
 *
 *    Consequence, accepted for now, and it is wider than it first looks: two
 *    rules want that face — `math .mathscr` and, more commonly, `mo.tml-prime`,
 *    so every `f'` and `f''` in a compiled document loses its prime alignment
 *    and falls back to a system glyph. (It is NOT what draws `\mathcal`; that
 *    is `*.mathcal { font-feature-settings: 'ss01' }` and survives stripping.)
 *
 * 2. **`.tml-eqn::before` is rescoped to `.tml-eqn:empty::before`.** Temml
 *    leaves the tag span empty and asks a CSS counter to draw the number. That
 *    works in a browser and not in a document: Paged.js rewrites counters for
 *    its own pagination and strips `counter-increment`, so every equation
 *    rendered as "(0)" (measured 2026-07-31). `numberEquations` below therefore
 *    writes the number in as TEXT — and a span carrying a number is no longer
 *    `:empty`, so the counter rule and the text can never both fire.
 */

/**
 * Temml's own stylesheet, vendored. Generated from `temml/dist/Temml-Local.css`
 * with the two departures described above. Do not hand-edit.
 */
const TEMML_BASE = `math {
  font-family: "Cambria Math", 'STIXTwoMath-Regular', 'NotoSansMath-Regular', math;
  font-style: normal;
  font-weight: normal;
  line-height: normal;
  font-size-adjust: none;
  text-indent: 0;
  text-transform: none;
  letter-spacing: normal;
  word-wrap: normal;
  direction: ltr;
  /* Prevent Firefox from omitting the dot on i or j. */
  font-feature-settings: "dtls" off;
}

math * {
  border-color: currentColor;
}

/* display: block is necessary in Firefox and Safari.
 * Not in Chromium, which recognizes display: "block math" written inline. */
 math.tml-display {
  display: block;
  width: 100%;
}

*.mathcal {
  /* NotoSans */
  font-feature-settings: 'ss01';
}

math .mathscr {
  font-family: "Temml";
}

mo.tml-prime {
  font-family: Temml;
}

/* Cramped superscripts in WebKit */
mfrac > :nth-child(2),
msqrt,
mover > :first-child {
  math-shift: compact
}

.menclose {
  display: inline-block;
  position: relative;
  padding: 0.5ex 0ex;
}
.tml-cancelto {
  display: inline-block;
  position: absolute;
  top: 0;
  left: 0;
  padding: 0.5ex 0ex;
  background-color: currentColor;
  /* Use the SVG as an alpha mask (painted by background-color) */
  -webkit-mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><defs><marker id='a' markerHeight='5' markerUnits='strokeWidth' markerWidth='7' orient='auto' refX='7' refY='2.5'><path fill='black' d='m0 0 7 2.5L0 5z'/></marker></defs><line x2='100%25' y1='100%25' stroke='black' stroke-width='.06em' marker-end='url(%23a)' vector-effect='non-scaling-stroke'/></svg>");
          mask-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'><defs><marker id='a' markerHeight='5' markerUnits='strokeWidth' markerWidth='7' orient='auto' refX='7' refY='2.5'><path fill='black' d='m0 0 7 2.5L0 5z'/></marker></defs><line x2='100%25' y1='100%25' stroke='black' stroke-width='.06em' marker-end='url(%23a)' vector-effect='non-scaling-stroke'/></svg>");
  -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
  -webkit-mask-size: 100% 100%;
          mask-size: 100% 100%;
  -webkit-mask-position: 0 0;
          mask-position: 0 0;
}

@supports (-moz-appearance: none) {
  /* \vec w/o italic correction for Firefox */
  .tml-vec {
    transform: scale(0.75)
  }
  /* Fix \cancelto in Firefox */
  .ff-narrow {
    width: 0em;
  }
  .ff-nudge-left {
    margin-left: -0.2em;
  }
}

@supports (not (-moz-appearance: none)) {
  /* Chromium and WebKit */
  /* prime vertical alignment */
  mo.tml-prime {
    font-family: Temml;
  }
  /* Italic correction on superscripts */
  .tml-sml-pad {
    padding-left: 0.05em;
  }
  .tml-med-pad {
    padding-left: 0.10em;
  }
  .tml-lrg-pad {
    padding-left: 0.15em;
  }
}

@supports (-webkit-backdrop-filter: blur(1px)) {
  /* WebKit vertical & italic correction on accents */
  .wbk-acc {
    /* lower by x-height distance */
    transform: translate(0em, 0.431em);
  }
  .wbk-sml {
    transform: translate(0.07em, 0);
  }
  .wbk-sml-acc {
    transform: translate(0.07em, 0.431em);
  }
  .wbk-sml-vec {
    transform: scale(0.75) translate(0.07em, 0);
  }
  .wbk-med {
    transform: translate(0.14em, 0);
  }
  .wbk-med-acc {
    transform: translate(0.14em, 0.431em);
  }
  .wbk-med-vec {
    transform: scale(0.75) translate(0.14em, 0);
  }
  .wbk-lrg {
    transform: translate(0.21em, 0);
  }
  .wbk-lrg-acc {
    transform: translate(0.21em, 0.431em);
  }
  .wbk-lrg-vec {
    transform: scale(0.75) translate(0.21em, 0);
  }
}

/* \cancel & \phase use background images. Get them to print. */
menclose {
  -webkit-print-color-adjust: exact;  /* Chrome & Edge */
          print-color-adjust: exact;
}

/* Array cell justification in Firefox & WebKit */
.tml-right {
  text-align: right;
}
.tml-left {
  text-align: left;
}

/* For CD labels that grow to the left in Firefox and WebKit */
.tml-shift-left { margin-left:-200% }

/* Styles for Chromium only */
@supports (not (-webkit-backdrop-filter: blur(1px))) and (not (-moz-appearance: none)) {
  /* Italic correction on accents */
  .chr-sml {
    transform: translate(0.07em, 0)
  }
  .chr-sml-vec {
    transform: scale(0.75) translate(0.07em, 0)
  }
  .chr-med {
    transform: translate(0.14em, 0)
  }
  .chr-med-vec {
    transform: scale(0.75) translate(0.14em, 0)
  }
  .chr-lrg {
    transform: translate(0.21em, 0)
  }
  .chr-lrg-vec {
    transform: scale(0.75) translate(0.21em, 0)
  }

  /* For CD labels that grow to the left */
  .tml-shift-left { margin-left:-100% }

  /* MathML Core & Chromium do not support the MathML 3.0 element <menclose> attributes. */
  /* So use styles. */
  menclose {
    position: relative;
    padding: 0.5ex 0ex;
  }
  
    .tml-overline {
    padding: 0.1em 0 0 0;
    border-top: 0.065em solid;
  }

  .tml-underline {
    padding: 0 0 0.1em 0;
    border-bottom: 0.065em solid;
  }

  .tml-cancel {
    display: inline-block;
    position: absolute;
    left: 0.5px;
    bottom: 0;
    width: 100%;
    height: 100%;
    background-color: currentColor;
  }
  .upstrike {
    clip-path: polygon(0.05em 100%, 0em calc(100% - 0.05em), calc(100% - 0.05em) 0em, 100% 0.05em);
  }
  .downstrike {
    clip-path: polygon(0em 0.05em, 0.05em 0em, 100% calc(100% - 0.05em), calc(100% - 0.05em) 100%);
  }
  .sout {
    clip-path: polygon(0em calc(55% + 0.0333em), 0em calc(55% - 0.0333em), 100% calc(55% - 0.0333em), 100% calc(55% + 0.0333em));
  }
  .tml-xcancel {
    clip-path: polygon(0.05em 0em, 0em 0.05em, calc(50% - 0.05em) 50%, 0em calc(100% - 0.05em), 0.05em 100%, 50% calc(50% + 0.05em), calc(100% - 0.05em) 100%, 100% calc(100% - 0.05em), calc(50% + 0.05em) 50%, 100% 0.05em, calc(100% - 0.05em) 0%, 50% calc(50% - 0.05em));
  }

  .longdiv-top {
    border-top: 0.067em solid;
    padding: 0.1em 0.2em 0.2em 0.433em;
  }
  .longdiv-arc {
    position: absolute;
    top: 0;
    bottom: 0.1em;
    left: -0.4em;
    width: 0.7em;
    border: 0.067em solid;
    transform: translateY(-0.067em);
    border-radius: 70%;
    clip-path: inset(0 0 0 0.4em);
    box-sizing: border-box;}
    .menclose {display: inline-block;
    text-align: left;
    position: relative;
  }
  
  .phasor-bottom {
    border-bottom: 0.067em solid;
    padding: 0.2em 0.2em 0.1em 0.6em;
  }
  .phasor-angle {
    display: inline-block;
    position: absolute;
    left: 0.5px;
    bottom: -0.04em;
    height: 100%;
    aspect-ratio: 0.5;
    background-color: currentColor;
    clip-path: polygon(0.05em 100%, 0em calc(100% - 0.05em), calc(100% - 0.05em) 0em, 100% 0.05em);
  }

  .tml-fbox {
    padding: 3pt;
    border: 1px solid;
  }

  .circle-pad {
    padding: 0.267em;
  }
  .textcircle {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
    border: 0.067em solid;
    border-radius: 50%;
   }

   .actuarial {
    padding: 0.03889em 0.03889em 0 0.03889em;
    border-width: 0.08em 0.08em 0em 0em;
    border-style: solid;
    margin-right: 0.03889em;
   }

   /* Stretch \widetilde */
  .tml-crooked-2 {
    transform: scale(2.0, 1.1)
  }
  .tml-crooked-3 {
    transform: scale(3.0, 1.3)
  }
  .tml-crooked-4 {
    transform: scale(4.0, 1.4)
  }
  /* set array cell justification */
  .tml-right {
    text-align: -webkit-right;
  }
  .tml-left {
    text-align: -webkit-left;
  }
}

.special-fraction {
  font-family: 'STIX TWO', 'Times New Roman', Times, Tinos, serif;
}

/* flex-wrap for line-breaking in Chromium */
math {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
}
math > mrow {
  padding: 0.5ex 0ex;
}

/* Default mtd top padding is 0.5ex per MathML-Core and user-agent CSS */
/* We adjust for jot and small */
mtable.tml-jot mtd {
  padding-top: 0.7ex;
  padding-bottom: 0.7ex;
}
mtable.tml-small mtd {
  padding-top: 0.35ex;
  padding-bottom: 0.35ex;
}

/* Firefox */
@-moz-document url-prefix() {
  /* Avoid flex-wrap */
  math { display: inline; }
  math > mrow { padding: 0 }
  /* Adjust Firefox spacing between array rows */
  mtd, mtable.tml-small mtd { padding-top: 0; padding-bottom: 0; }
  mtable.tml-jot mtd { padding-top: 0.2ex; padding-bottom: 0.ex; }
}

/* AMS environment auto-numbering via CSS counter. */
.tml-eqn:empty::before {
  counter-increment: tmlEqnNo;
  content: "(" counter(tmlEqnNo) ")";
}

body {
  counter-reset: tmlEqnNo;
}`

/**
 * What Temml does not have. Kept byte-identical to the rules in
 * `@uniweb/kit/math-tokens.css`, which the parity test enforces.
 *
 * 1. `mtd` padding: Temml's sheet only ADJUSTS row spacing for jot and small,
 *    on the stated assumption that "default mtd top padding is 0.5ex per
 *    MathML-Core and user-agent CSS". Measured in Chrome (2026-07), a pristine
 *    `mtd` gets 0px, and a `pmatrix` or `cases` carries no `tml-*` class at
 *    all — so its rows touch. Guarded to exclude Firefox because Temml
 *    deliberately ZEROES mtd padding there, and an unguarded `math mtd`
 *    outranks it on specificity (0,0,2 vs 0,0,1) regardless of the at-rule.
 *
 * 2. Display math needs CSS block layout, not MathML layout, for an equation
 *    TAG to reach the right margin. Temml already declares
 *    `math.tml-display { display: block; width: 100% }` and cannot win: it emits
 *    `style="display:block math"` inline on every display formula, and an
 *    inline style beats any stylesheet rule. This restores Temml's own intent
 *    with the `!important` its rule lacks, scoped with `:has()` so unnumbered
 *    formulas keep MathML layout and stay centred.
 */
const UNIWEB_CORRECTIONS = `@supports (not (-moz-appearance: none)) {
  math mtd { padding-top: 0.5ex; padding-bottom: 0.5ex; }
}
math.tml-display:has(.tml-eqn) {
  display: block !important;
  width: 100%;
}`

export const MATH_CSS = `${TEMML_BASE}\n${UNIWEB_CORRECTIONS}`

/**
 * Write equation numbers into Temml's tag spans as text.
 *
 * Temml leaves `<span class="tml-eqn"></span>` empty and expects a CSS counter
 * to draw the number. That works in a browser and not in a document: Paged.js
 * rewrites counters for its own pagination and strips `counter-increment`, so
 * every equation renders as "(0)" -- measured, and confirmed by the declaration
 * surviving intact once the polyfill is removed. EPUB readers vary at least as
 * widely, and neither lane offers a way to find out.
 *
 * So the document lanes stop asking CSS to count. A span that carries its
 * number is no longer `:empty`, and the stylesheet's counter rule is scoped to
 * `:empty`, so the two can never both fire and double up.
 *
 * A regex rather than a parse: Temml emits this span in exactly one shape, and
 * the epub adapter would otherwise have to thread a counter through its parse5
 * tree for no gain.
 *
 * @param {string} html
 * @param {number} [start=1] - First number to use; lets a caller continue the
 *   sequence across sections so a book numbers straight through.
 * @returns {{ html: string, next: number }}
 */
export function numberEquations(html, start = 1) {
  let n = start
  const out = String(html ?? '').replace(
    /<span class="tml-eqn"><\/span>/g,
    () => `<span class="tml-eqn">(${n++})</span>`,
  )
  return { html: out, next: n }
}
