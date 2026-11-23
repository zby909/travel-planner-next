-- 只有从合并前原库升级时才有暂存行，按原编号还原手记及相册。
BEGIN IMMEDIATE;
WITH keepers AS (SELECT placeId, MIN(id) AS id FROM "_OriginalVisits" GROUP BY placeId)
INSERT INTO TravelMemory (id, planId, placeId, title, content, happenedAt, createdAt, updatedAt, whenLabel, "group")
SELECT old.id, old.planId, old.placeId, old.title, old.content, old.happenedAt, old.createdAt, old.updatedAt,
  CASE WHEN old.id = keeper.id THEN current.whenLabel ELSE '' END,
  CASE WHEN old.id = keeper.id THEN current."group" ELSE NULL END
FROM "_OriginalVisits" old JOIN keepers keeper ON keeper.placeId = old.placeId
JOIN TravelMemory current ON current.id = keeper.id
WHERE 1
ON CONFLICT(id) DO UPDATE SET title = excluded.title, content = excluded.content,
  happenedAt = excluded.happenedAt, updatedAt = excluded.updatedAt;
UPDATE TravelPhoto SET memoryId = (SELECT memoryId FROM "_OriginalVisitPhotos" WHERE id = TravelPhoto.id)
WHERE id IN (SELECT id FROM "_OriginalVisitPhotos");
DROP TABLE "_OriginalVisitPhotos";
DROP TABLE "_OriginalVisits";
COMMIT;
