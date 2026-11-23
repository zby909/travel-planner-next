-- 跨过旧版合并步骤时暂存原记录。已运行过合并的实例没有可靠的原始照片归属。
BEGIN IMMEDIATE;
CREATE TABLE "_OriginalVisits" AS
SELECT id, planId, placeId, title, content, happenedAt, createdAt, updatedAt
FROM TravelMemory
WHERE placeId IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM _prisma_migrations WHERE migration_name = '20261106230000_one_note_per_place'
  AND finished_at IS NOT NULL AND rolled_back_at IS NULL
);
CREATE UNIQUE INDEX "_OriginalVisits_id" ON "_OriginalVisits"(id);
CREATE TABLE "_OriginalVisitPhotos" (id TEXT PRIMARY KEY, memoryId TEXT NOT NULL);
INSERT INTO "_OriginalVisitPhotos" SELECT photo.id, photo.memoryId
FROM TravelPhoto photo JOIN "_OriginalVisits" visit ON visit.id = photo.memoryId;
COMMIT;
