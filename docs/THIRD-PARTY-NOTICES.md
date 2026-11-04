# Third-party Assets and License Notes

The root [MIT License](../LICENSE) applies to original Travel Journal for Two source code and project documentation. It does not replace or override the license of any third-party software, map dataset, photograph, font, icon, or other asset.

## Known assets requiring separate treatment

### Apache ECharts

- File: `public/maps/echarts.min.js`
- The bundled file retains its upstream Apache License 2.0 header.
- Upstream license: <https://www.apache.org/licenses/LICENSE-2.0>
- Before a public release, include the complete Apache 2.0 license text and any applicable upstream NOTICE material alongside the bundled file. Do not relicense ECharts under MIT.

### Offline map geometry

- File: `public/maps/map-geo-data.js`
- Its header refers to `SOURCES.txt`, but that source/attribution file is not present in the current checkout.
- The exact upstream dataset, version, and redistribution terms have not yet been verified.
- This file is not covered by the project's MIT grant until its provenance and license are established. Record the source and license here or in a dedicated adjacent notice before public distribution.

### Historical travel photographs

Earlier Git history contains a legacy image attribution manifest at `public/images/visited/attribution-manifest.json`. It records 31 visited-place images. Some entries identify Wikimedia Commons material under CC BY-SA 3.0 or CC BY-SA 4.0; other entries do not include complete author and license details. Several SVG illustrations are explicitly described as original project artwork.

- Historical photos and illustrations are not automatically relicensed under MIT.
- For CC BY-SA assets, preserve creator attribution, source links, license links, and any required indication of changes. Adaptations must follow the applicable ShareAlike terms.
- For entries without a verified license, do not assume that public availability means permission to redistribute.
- If redistribution rights cannot be verified, remove the affected asset from the public release and, if necessary, from the Git history that will be published.

The maintainer has confirmed that the historical travel records do not need to be withheld for privacy reasons. This confirmation does not change the copyright or license terms of third-party media.

### npm dependencies

Dependencies retain the licenses declared by their respective packages. See the `license` fields and package metadata in the root `package-lock.json`. Do not treat the root MIT license as a replacement for dependency notices.

## Adding a third-party asset

For every new third-party asset, record:

1. File path and upstream project or source URL.
2. Author/creator, when required.
3. Exact license name and a link to its full text.
4. Whether the asset was modified, cropped, converted, or otherwise adapted.
5. Any required attribution or NOTICE text.

Keep attribution close to the asset or in this document. Do not copy third-party assets into the repository until their redistribution terms are understood.
