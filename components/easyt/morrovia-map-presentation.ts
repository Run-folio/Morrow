import type { StyleSpecification, LineLayerSpecification } from "maplibre-gl";
import { feature } from "topojson-client";
import worldTopology from "world-atlas/countries-50m.json" with { type: "json" };

const topology = worldTopology as unknown as { objects: { countries: object } };
const morroviaCountries = feature(
  topology as never,
  topology.objects.countries as never,
) as unknown as GeoJSON.FeatureCollection;

export const MORROVIA_DETAILED_BASEMAP_SOURCE_ID = "openmaptiles";
export const MORROVIA_DETAILED_BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * A bundled, provider-independent style used only while the detailed provider
 * is unavailable. Keeping it local means a failed style or tile request can
 * never leave the MapLibre canvas transparent or white.
 */
export function createMorroviaFallbackMapStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      "morrovia-countries": {
        type: "geojson",
        data: morroviaCountries,
        attribution: "Natural Earth",
      },
    },
    layers: [
      {
        id: "morrovia-ocean",
        type: "background",
        /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map fallback paint is a MapLibre style literal. */
        paint: { "background-color": "#f2f4f6" },
      },
      {
        id: "morrovia-land",
        type: "fill",
        source: "morrovia-countries",
        paint: {
          /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map fallback paint is a MapLibre style literal. */
          "fill-color": "#fffefe",
          "fill-opacity": 1,
        },
      },
      {
        id: "morrovia-borders",
        type: "line",
        source: "morrovia-countries",
        paint: {
          /* morrovia-ui-audit-allow-next-line inline-color -- Canonical Trip Map fallback paint is a MapLibre style literal. */
          "line-color": "#c9cae2",
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.75, 6, 1.15, 12, 0.6],
          "line-opacity": 0.92,
        },
      },
    ],
  };
}

export const morroviaMapFallbackStyle = createMorroviaFallbackMapStyle();
export const morroviaMapStyle = MORROVIA_DETAILED_BASEMAP_STYLE_URL;

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
