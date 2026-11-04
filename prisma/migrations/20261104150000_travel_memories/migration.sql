-- Connect diary entries to visited places and keep each new photo tied to a managed media asset.
-- Existing filePath records remain readable; mediaAssetId is nullable for backwards compatibility.
ALTER TABLE "TravelMemory"
ADD COLUMN "placeId" TEXT REFERENCES "VisitedPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TravelMemory_planId_happenedAt_idx"
ON "TravelMemory"("planId", "happenedAt");

CREATE INDEX "TravelMemory_placeId_idx"
ON "TravelMemory"("placeId");

ALTER TABLE "TravelPhoto"
ADD COLUMN "mediaAssetId" TEXT REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TravelPhoto_mediaAssetId_key"
ON "TravelPhoto"("mediaAssetId");
