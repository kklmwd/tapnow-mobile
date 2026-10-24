# TapCanvas

A phone-first node canvas for AI image and video generation, in the spirit of TapNow's Tapflow canvas.
Static web app (installable PWA). No backend: your fal.ai key stays in your browser.

## What it does

- Node canvas: **Prompt**, **Photo** (upload), **Image** and **Video** nodes. Connect them by dragging handles, or on a phone by tapping chips in the node sheet.
- Image models (via fal.ai): **Nano Banana Pro** (`fal-ai/nano-banana-pro`, `/edit`) and **GPT Image 2** (`openai/gpt-image-2`, `/edit`).
- Video model (via fal.ai): **Seedance 2.0** (`bytedance/seedance-2.0/text-to-video`, `/image-to-video`).
- Connect an image to a video node for image-to-video; a second image becomes the end frame.
- "Generate" on a node first runs any connected image nodes that have no result yet.
- Gallery of everything generated, project export/import, works offline as a shell.
- **Demo mode** (default) fakes results so you can try the whole flow without spending money.

## Use it

1. Open the deployed page on your phone (GitHub Pages: Settings > Pages > Source: GitHub Actions).
2. Settings > fal.ai (real) > paste your fal key. Use a key with a spend limit; every run is billed to your fal account.
3. Share > Add to Home Screen.

Model endpoints can be changed in Settings > Model endpoints if fal renames one.

## Wobble Seal (mini game)

`public/wobble-seal/index.html` is a standalone, endless stacking game, served at `./wobble-seal/` on the deployed site.
A circus seal balances a tower of balls on its nose. Hold one finger anywhere and slide to move it; catch falling balls to build the tower, and land them dead centre for a "perfect" combo.
It starts fast, stays flat for the first 10 balls, then speeds up every 2 balls. The taller the tower, the heavier it drags and the more it bends and wobbles.
From 30 balls, junk falls too (29 kinds: pets, poop, sushi, a Poké Ball, game swords and guns, pizza...): 40% of drops at 30 balls, 80% at 45, all of them from 60. Junk is worth 3, and any miss costs one of three lives; golden fish give one back.
It has a loud Japanese-arcade look: saturated sunburst backgrounds with halftone dots, thick black outlines, bouncy outlined lettering, all in-game callouts in katakana, vertical speed lines that thicken as the tower grows, and a crowd of mascots that cheer catches and panic at misses. The speaker button mutes. No build step or dependencies.

## Develop

```
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run e2e        # builds, then runs phone-size browser tests in demo mode
```

## Known gaps

- Text-to-video and text-to-image endpoint IDs for Seedance 2.0 and GPT Image 2 follow fal's naming pattern but were not individually confirmed; image-to-video and edit endpoints were read from fal's docs.
- GPT Image 2 `image_size` options use fal's standard size names and may need adjusting.
- No real fal call has been made (no key available to the build session); the request shape is tested against a stubbed network.
