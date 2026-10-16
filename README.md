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
