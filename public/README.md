# Media assets

The hero and ambient-audio files are committed to this folder so the app
works out of the box on a fresh clone. If you ever need to swap them:

- **`echo-hero-clean.mp4`** — full-bleed background video on the landing
  page. Cinematic bokeh / camera-pull shots, ~17 MB.
- **`echo-ambient.mp3`** — looping wind + birdsong audio on the landing
  page, ~4.6 MB. CC0 / public domain (attribution: BigSoundBank
  "Wind in a Tree" by Joseph Sardin).

Both files are served from `/` (root) by Next.js. If you replace them
keep the same filenames or update the `src` attributes in
`src/components/ui/echo-hero.tsx`.
