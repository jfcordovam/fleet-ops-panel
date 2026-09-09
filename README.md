# Fleet Ops

A local, interactive 3D fleet simulation for Frankfurt. The project demonstrates a production-minded frontend architecture with React, TypeScript, MapLibre GL JS, responsive controls, and deterministic simulation logic.

## Run locally

Requires Node.js 24 LTS, npm, and a WebGL-enabled browser.

```sh
npm install
npm run dev
```

The app has no API key or backend. Map tiles, fonts, and sprites are loaded from OpenFreeMap, so an internet connection is required.

## Commands

```sh
npm run lint
npm test
npm run build
npm run preview
```

## Implementation notes

- MapLibre renders Frankfurt buildings and vehicle volumes in a shared 3D scene.
- The simulation builds a street graph from vector-tile road geometry and plans varied connected routes.
- Vehicle telemetry is simulated locally; animation, route changes, selection, follow mode, and viewport-aware map markers run entirely in the browser.
- The simulation domain is framework-independent and covered by local unit tests.

## Attribution

- [MapLibre GL JS](https://maplibre.org/)
- [OpenFreeMap](https://openfreemap.org/) and [OpenMapTiles](https://openmaptiles.org/)
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- [Lucide](https://lucide.dev/)
