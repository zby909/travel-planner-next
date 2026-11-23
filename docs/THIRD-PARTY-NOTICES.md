# Third-party Assets and License Notes

The root [MIT License](../LICENSE) applies to original Travel Journal for Two source code and project documentation. It does not replace or override the license of any third-party software, map dataset, photograph, font, icon, or other asset.

## Known assets requiring separate treatment

### Apache ECharts

- File: `public/maps/echarts.min.js`
- The bundled file retains its upstream Apache License 2.0 header.
- Upstream license: <https://www.apache.org/licenses/LICENSE-2.0>
- The bundle matches the original ECharts 5.6.0 renderer. The release [LICENSE](../public/maps/LICENSE-echarts.txt) and [NOTICE](../public/maps/NOTICE-echarts.txt) accompany it.

### Offline map geometry

- File: `public/maps/map-geo-data.js`
- The map matches the original atlas byte for byte. Its build inputs were Alibaba Cloud DataV.GeoAtlas for China and The D3 Graph Gallery for world outlines. Source links, feature counts and the artifact digest are in the [source inventory](../public/maps/SOURCES.txt).
- Alibaba Cloud identifies Amap as the source of the China boundaries, describes use for learning and communication, and directs copyright enquiries to Amap. [DataV GeoAtlas documentation](https://help.aliyun.com/en/datav/datav-7-0/user-guide/datav-geoatlas-widgets/)
- The D3 Graph Gallery repository credits Holtz Yan and carries an MIT notice. The notice accompanies the map. [Gallery license](../public/maps/licenses/LICENSE-d3-graph-gallery)
- For the world layer, 171 of the 177 original features match names and complete geometries in `johan/world.geo.json`. Its maintainer describes the data’s legal status as uncertain. Public redistribution of the bundled geometry still needs a suitable grant or replacement data with documented terms. [Upstream README](https://github.com/johan/world.geo.json/blob/master/README.md)

### Historical travel photographs

Earlier Git history contains a legacy image attribution manifest at `public/images/visited/attribution-manifest.json`. It records 31 visited-place images. Some entries identify Wikimedia Commons material under CC BY-SA 3.0 or CC BY-SA 4.0; other entries do not include complete author and license details. Several SVG illustrations are explicitly described as original project artwork.

The original static project includes two source lists, one for future destinations and one for visited places. These reference images belong to the private legacy media collection. For a public release, check each file's source page for its attribution and permitted use.

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
