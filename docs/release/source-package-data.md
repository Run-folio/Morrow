# Pinned source-package data

`data/package-manifest.json` enumerates the 27 accepted geographic files, byte
lengths and SHA256 values. They are regular Git files. The root ignore rules
allow only this manifest and the enumerated paths, so an unrelated local data
file is not implicitly included. Dataset bytes, identity/snapshot rules and
runtime behavior are unchanged from the separately reviewed baseline.

Natural Earth/world-atlas land data is public domain. OurAirports is public
domain; settlement/admin reference facts retain GeoNames CC BY4.0 attribution.
The island source captures and derived containment retain OpenStreetMap ODbL1.0
terms. Preserve `data/place-reference/LICENSES.md`, both island/readme notices,
source URLs, timestamps and digests. Backend tracing alone does not establish
the public attribution and data-availability offer described by the island
README; verify that offer before publication. No data license is extended or
reinterpreted by this packaging change.

The five runtime place-data consumers have explicit tracing includes derived
from this manifest, rather than an unrestricted data-directory glob. Capture
and Day Trips use the same reader as Geocode, Discover and Route Image. The
land geometry is statically imported and bundled; it is still versioned as a
build input.

From a clean source package, install the committed dependency lock using the
approved build environment, not an absolute local `node_modules` link. The
validated local toolchain is Node24.14.1 / npm11.11.0. Confirm the host's Node and
Next adapter settings before deployment. No environment credentials belong in
the source package.

Read-only qualification:

```
node --experimental-strip-types --test tests/source-package-data.test.mjs
node scripts/verify-source-package.mjs
# After the exact candidate's successful build:
node scripts/verify-source-package.mjs --dist .next-check
```

The last check requires a fresh completed build from this package and verifies
all 26 reference inputs in each of the five route traces. It must not be
reported passed using an earlier candidate's build. Hosted acceptance remains
separate and requires explicit deployment authorization.
