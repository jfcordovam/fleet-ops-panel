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

## Deploy to Vercel

This project is configured to be served from `/fleet-map-demo/`. Deploy it as its own Vercel project with the Vite preset, `npm run build` as the build command, and `dist` as the output directory.

To expose it at `https://franciscocordova.dev/fleet-map-demo`, keep the custom domain assigned to the portfolio project and add this rewrite in that project's `vercel.json`, replacing the destination with this deployment's production URL:

```json
{
  "rewrites": [
    { "source": "/fleet-map-demo", "destination": "https://fleet-ops-panel.vercel.app/" },
    { "source": "/fleet-map-demo/:path*", "destination": "https://fleet-ops-panel.vercel.app/:path*" }
  ]
}
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
