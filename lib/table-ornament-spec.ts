export const tableOrnamentSpec = {
  id: "gold-coral-table-ornament",
  suitability: "pass",
  target: "real-time interactive browser prop",
  objectClass: {
    primaryDomain: "object",
    formLanguage: ["sculptural", "organic hard-surface", "transparent-like"],
    structureKind: ["compound object", "repeated modules", "layered shell"],
    motionPotential: ["static prop", "whole-object rotation"],
    materialFamilies: ["textured gold metal", "cast glass"],
  },
  qualityContract: {
    definitionOfDone:
      "Five porous pointed gold forms read as a clustered table ornament inside a shallow irregular glass dish; all negative spaces remain visible and the entire arrangement is framed with margin.",
    criticalFeatures: [
      "five-piece stacked cluster",
      "varied circular openings with recessed interiors",
      "pointed coral-like perimeter ridges",
      "dense raised hammered nodules",
      "transparent shallow square dish with wavy rim",
    ],
    blockingFailures: [
      "forms read as smooth balls",
      "openings read as flat painted spots",
      "gold reads as plastic",
      "dish is absent or opaque",
      "camera crops any part of the subject",
    ],
  },
  repetitionSystems: {
    ornaments: { count: 5, layout: "four supported forms plus one elevated central form" },
    openings: { countPerForm: 18, distribution: "deterministic Fibonacci sphere with varied radii" },
    spikes: { countPerForm: 30, distribution: "offset Fibonacci sphere" },
    nodules: { countPerForm: 120, distribution: "surface-scattered raised hemispheres" },
  },
  materials: {
    gold: {
      baseColor: "#c49a57",
      metalness: 0.82,
      roughness: 0.36,
      localOverrides: ["dark rough cavities", "brighter lower-roughness rims", "raised nodule highlights"],
    },
    glass: {
      baseColor: "#e8f2ef",
      transmission: 0.88,
      roughness: 0.14,
      thickness: 0.28,
      localOverrides: ["clouded edge", "wavy cast surface", "slightly blue-green rim"],
    },
  },
} as const;
