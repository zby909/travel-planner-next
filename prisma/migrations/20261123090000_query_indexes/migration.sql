-- 为高频媒体引用检查、首页精选相片与过期草稿清理补充查询索引。
CREATE INDEX "ImportDraft_status_expiresAt_idx" ON "ImportDraft"("status", "expiresAt");
CREATE INDEX "MediaAsset_status_createdAt_idx" ON "MediaAsset"("status", "createdAt");
CREATE INDEX "TravelPhoto_filePath_idx" ON "TravelPhoto"("filePath");
CREATE INDEX "TravelPhoto_isFeatured_createdAt_idx" ON "TravelPhoto"("isFeatured", "createdAt");
