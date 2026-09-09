import type { StyleSpecification, LineLayerSpecification } from "maplibre-gl";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json" with { type: "json" };

const topology = worldTopology as unknown as { objects: { countries: object } };
const morroviaCountries = feature(
  topology as never,
  topology.objects.countries as never,
) as unknown as GeoJSON.FeatureCollection;

// CARTO raster tiles are deliberately used instead of their remote GL style:
// the latter can load controls but fail to load map layers in some browsers.
export function createMorroviaMapStyle(basemapKey?: string): StyleSpecification {
  const style: StyleSpecification = {
  version: 8,
  sources: {
    "morrovia-countries": {
      type: "geojson",
      data: morroviaCountries,
      attribution: "Natural Earth",
    },
    carto: {
      type: "raster",
      tiles: [`https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${encodeURIComponent(basemapKey ?? "")}`],
      tileSize: 256,
      maxzoom: 20,
      attribution: "© CARTO, © OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "morrovia-ocean",
      type: "background",
        /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map paint is shared unchanged; MapLibre style expressions require literal colours. */
      paint: { "background-color": "#f2f4f6" },
    },
    {
      id: "carto-light",
      type: "raster",
      source: "carto",
      paint: {
        "raster-saturation": -0.22,
        "raster-contrast": -0.06,
        "raster-brightness-max": 0.98,
        "raster-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 0, 7.1, 0.24, 8.35, 0.94],
      },
    },
    {
      id: "morrovia-land",
      type: "fill",
      source: "morrovia-countries",
      paint: {
        /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map paint is shared unchanged; MapLibre style expressions require literal colours. */
        "fill-color": "#fffefe",
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 1, 7.2, 0.72, 8.35, 0],
      },
    },
    {
      id: "morrovia-borders",
      type: "line",
      source: "morrovia-countries",
      paint: {
        /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map paint is shared unchanged; MapLibre style expressions require literal colours. */
        "line-color": "#c9cae2",
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 6, 1.15, 8.35, 0.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 0.92, 7.2, 0.58, 8.35, 0],
      },
    },
  ],
};

  // Unauthenticated CARTO tiles now contain a watermark. Keep the canonical
  // country layer visible at every zoom rather than requesting unusable tiles.
  if (!basemapKey) {
    delete style.sources.carto;
    style.layers = style.layers.filter((layer) => layer.id !== "carto-light");
    for (const layer of style.layers) {
      if (layer.type === "fill") layer.paint = { ...layer.paint, "fill-opacity": 1 };
      if (layer.type === "line") layer.paint = { ...layer.paint, "line-opacity": .92 };
    }
  }
  return style;
}
export const morroviaMapStyle = createMorroviaMapStyle(process.env.NEXT_PUBLIC_CARTO_BASEMAP_KEY);

export const mapRouteCasing: LineLayerSpecification["paint"] = { "line-color": "rgba(255,255,255,.98)", "line-width": 10, "line-opacity": 0.98 };

export const mapRouteLine: LineLayerSpecification["paint"] = {
        /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map paint is shared unchanged; MapLibre style expressions require literal colours. */
            "line-color": "#f42b7a",
            "line-width": 6,
            "line-opacity": 0.94,
          };

export const mapRoutePlanning: LineLayerSpecification["paint"] = {
            "line-color": "rgba(255,255,255,.94)",
            "line-width": 1.8,
            "line-opacity": 0.9,
            "line-dasharray": [0.7, 1.35],
          };
