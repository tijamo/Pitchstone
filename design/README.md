# Icon sources

`public/icon.svg` is the master mark and ships as-is — it is the favicon, so
it is a runtime asset as well as a source.

`icon-maskable.svg` here is source only. It is the same mark on a full-bleed
ground for Android's maskable icons, which crop to whatever shape the launcher
uses. It lives outside `public/` so it is not served or precached: nothing
loads it, only the PNG rendered from it.

The mark is also inlined as a React component in `src/components/Mark.tsx` for
the sign-in screen. Change the mark and change all three.

## Regenerating the PNGs

No rasteriser is installed, so the PNGs are rendered through the Chromium that
Playwright already needs (see the `verify` skill for why it is pinned by path):

```js
// for each [source, output, size]:
//   ['../public/icon.svg',  '../public/icon-192.png',           192],
//   ['../public/icon.svg',  '../public/icon-512.png',           512],
//   ['../public/icon.svg',  '../public/apple-touch-icon.png',   180],
//   ['icon-maskable.svg',   '../public/icon-maskable-512.png',  512],
const page = await browser.newPage({ viewport: { width: size, height: size } })
await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`)
await page.screenshot({ path: output, omitBackground: true })
```

The maskable variant keeps the mark inside the centred 80%-diameter safe
circle; the plain one is drawn ~10% larger, because nothing crops it and at
16px in a browser tab every pixel counts.
