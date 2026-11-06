-- 一个地点只维护一份旅行文字和一个相册。旧内容和照片全部并入同一条回忆，不删除媒体。
-- 保留原有 TravelMemory / TravelPhoto 表以兼容已有备份、AI 导入和媒体外键。
-- 对有多篇记录的地点另存原始日记字段，后续即使修改了合并正文仍能查回旧内容。
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT 'legacy_place_notes_20261107', json_group_array(json_object(
  'id', "id", 'placeId', "placeId", 'planId', "planId",
  'title', "title", 'content', "content", 'happenedAt', "happenedAt",
  'createdAt', "createdAt", 'updatedAt', "updatedAt"
)), CURRENT_TIMESTAMP
FROM "TravelMemory"
WHERE "placeId" IN (
  SELECT "placeId" FROM "TravelMemory" WHERE "placeId" IS NOT NULL
  GROUP BY "placeId" HAVING COUNT(*) > 1
)
HAVING COUNT(*) > 0;

CREATE TEMP TABLE "_PlaceNoteKeepers" AS
SELECT "placeId", MIN("id") AS "id" FROM "TravelMemory"
WHERE "placeId" IS NOT NULL GROUP BY "placeId";

-- 将旧日记标题（即使只有一篇）、正文以及多篇日记日期转成统一正文，避免旧信息消失。
UPDATE "TravelMemory"
SET "content" = COALESCE((
  SELECT group_concat("segment", char(10) || char(10))
  FROM (
    SELECT CASE
      WHEN "t"."title" = "p"."name" AND "n"."total" = 1 THEN "t"."content"
      ELSE
        (CASE WHEN "t"."happenedAt" IS NOT NULL AND "n"."total" > 1
          THEN strftime('%Y-%m-%d', "t"."happenedAt" / 1000, 'unixepoch') || ' · ' ELSE '' END)
        || "t"."title"
        || (CASE WHEN "t"."content" <> '' THEN char(10) || "t"."content" ELSE '' END)
    END AS "segment"
    FROM "TravelMemory" "t"
    JOIN "VisitedPlace" "p" ON "p"."id" = "t"."placeId"
    JOIN (SELECT "placeId", COUNT(*) "total" FROM "TravelMemory"
      WHERE "placeId" IS NOT NULL GROUP BY "placeId") "n" ON "n"."placeId" = "t"."placeId"
    WHERE "t"."placeId" = "TravelMemory"."placeId"
    ORDER BY "t"."createdAt", "t"."id"
  )
), '')
WHERE "id" IN (SELECT "id" FROM "_PlaceNoteKeepers");

UPDATE "TravelMemory"
SET "happenedAt" = COALESCE("happenedAt",
  (SELECT MIN("t"."happenedAt") FROM "TravelMemory" "t"
   WHERE "t"."placeId" = "TravelMemory"."placeId"))
WHERE "id" IN (SELECT "id" FROM "_PlaceNoteKeepers");

UPDATE "TravelPhoto"
SET "memoryId" = (
  SELECT "k"."id" FROM "_PlaceNoteKeepers" "k"
  JOIN "TravelMemory" "t" ON "t"."placeId" = "k"."placeId"
  WHERE "t"."id" = "TravelPhoto"."memoryId"
)
WHERE "memoryId" IN (
  SELECT "t"."id" FROM "TravelMemory" "t"
  WHERE "t"."placeId" IS NOT NULL
);

DELETE FROM "TravelMemory"
WHERE "placeId" IS NOT NULL AND "id" NOT IN (SELECT "id" FROM "_PlaceNoteKeepers");

DROP TABLE "_PlaceNoteKeepers";
DROP INDEX IF EXISTS "TravelMemory_placeId_idx";
CREATE UNIQUE INDEX "TravelMemory_placeId_key" ON "TravelMemory"("placeId");
