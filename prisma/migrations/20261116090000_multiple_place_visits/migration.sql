-- 保留手记和照片的原 ID，把地点的同行人和日期说明移到到访记录。
BEGIN IMMEDIATE;

ALTER TABLE "TravelMemory" ADD COLUMN "whenLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TravelMemory" ADD COLUMN "group" TEXT;
DROP INDEX "TravelMemory_placeId_key";

UPDATE "TravelMemory"
SET "whenLabel" = (SELECT "whenLabel" FROM "VisitedPlace" WHERE "id" = "TravelMemory"."placeId"),
    "group" = (SELECT "group" FROM "VisitedPlace" WHERE "id" = "TravelMemory"."placeId")
WHERE "placeId" IS NOT NULL;

INSERT INTO "TravelMemory" ("id", "placeId", "title", "content", "whenLabel", "group", "updatedAt")
SELECT lower(hex(randomblob(16))), "id", "name", '', "whenLabel", "group", CURRENT_TIMESTAMP
FROM "VisitedPlace"
WHERE NOT EXISTS (SELECT 1 FROM "TravelMemory" WHERE "placeId" = "VisitedPlace"."id");

CREATE INDEX "TravelMemory_placeId_happenedAt_idx" ON "TravelMemory"("placeId", "happenedAt");
DROP INDEX "VisitedPlace_group_sortOrder_idx";
ALTER TABLE "VisitedPlace" DROP COLUMN "group";
ALTER TABLE "VisitedPlace" DROP COLUMN "whenLabel";
CREATE INDEX "VisitedPlace_sortOrder_idx" ON "VisitedPlace"("sortOrder");

COMMIT;
