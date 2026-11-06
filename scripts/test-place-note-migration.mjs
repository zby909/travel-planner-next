import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { backupBeforePlaceNoteMigration } from "./backup-before-place-note.mjs";

// 使用隔离的内存 SQLite，模拟旧版一个地点有多篇日记及照片的数据库状态。
const db = new DatabaseSync(":memory:");
try {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE "VisitedPlace" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
    CREATE TABLE "AppSetting" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" INTEGER NOT NULL);
    CREATE TABLE "TravelMemory" (
      "id" TEXT PRIMARY KEY, "planId" TEXT, "placeId" TEXT, "title" TEXT NOT NULL,
      "content" TEXT NOT NULL, "happenedAt" INTEGER, "createdAt" INTEGER, "updatedAt" INTEGER
    );
    CREATE TABLE "TravelPhoto" (
      "id" TEXT PRIMARY KEY, "memoryId" TEXT, "planId" TEXT, "filePath" TEXT NOT NULL,
      "mediaAssetId" TEXT, "sortOrder" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY ("memoryId") REFERENCES "TravelMemory"("id") ON DELETE SET NULL
    );
    INSERT INTO "VisitedPlace" VALUES ('kyoto', '京都'), ('osaka', '大阪');
    INSERT INTO "TravelMemory" VALUES
      ('a-memory',NULL,'kyoto','抵达的那天','傍晚散步',1730419200000,1,1),
      ('b-memory',NULL,'kyoto','第二天','雨后的街道',1730505600000,2,2),
      ('c-memory',NULL,'osaka','大阪','一次记录',NULL,1,1),
      ('d-orphan',NULL,NULL,'未归类日记','还未指定地点',NULL,3,3);
    INSERT INTO "TravelPhoto"("id","memoryId","filePath","mediaAssetId","sortOrder") VALUES
      ('photo-a','a-memory','/api/media/11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111',0),
      ('photo-b','b-memory','/api/media/22222222-2222-2222-2222-222222222222','22222222-2222-2222-2222-222222222222',0);
  `);
  const migration = await readFile(join(process.cwd(), "prisma", "migrations",
    "20261106230000_one_note_per_place", "migration.sql"), "utf8");
  db.exec(migration);
  const records = db.prepare('SELECT "id","placeId","content","happenedAt" FROM "TravelMemory" ORDER BY "id"').all();
  assert.equal(records.length, 3, "Historical migration unexpectedly deleted unassigned or other-place entries");
  const kyoto = records.find(item => item.placeId === "kyoto");
  assert.equal(kyoto.id, "a-memory");
  const archived = db.prepare('SELECT "value" FROM "AppSetting" WHERE "key"=?')
    .get("legacy_place_notes_20261107");
  const oldNotes = JSON.parse(archived.value);
  assert.equal(oldNotes.length, 2, "Migration did not retain source records for multi-note places");
  assert.ok(oldNotes.some(note => note.id === "b-memory" && note.content === "雨后的街道"),
    "Historical note snapshot lost an original entry");
  assert.ok(kyoto.content.includes("抵达的那天") && kyoto.content.includes("傍晚散步")
    && kyoto.content.includes("第二天") && kyoto.content.includes("雨后的街道"),
  "One-note migration dropped old story titles or text");
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM "TravelPhoto" WHERE "memoryId"=?').get(kyoto.id).total, 2,
    "One-note migration dropped historical media associations");
  assert.equal(records.find(item => item.id === "d-orphan")?.content, "还未指定地点",
    "Unassigned legacy diary should be preserved for manual placement");
  assert.equal(records.find(item => item.id === "c-memory")?.content, "一次记录",
    "Single-note location content should be preserved unchanged");
  assert.throws(() => db.exec(`INSERT INTO "TravelMemory"("id","placeId","title","content")
    VALUES ('duplicate','kyoto','无效','重复')`), /UNIQUE/i, "Database does not enforce one note per place");
  console.log("PLACE_NOTE_MIGRATION_PASS: merge multiple stories, preserve photos/notes, reject duplicate place entry");
} finally {
  db.close();
}

// 在临时磁盘创建旧库，验证容器启动前的 VACUUM 快照是完整且幂等的。
const temporaryRoot = await mkdtemp(join(tmpdir(), "travel-preflight-"));
try {
  const originalPath = join(temporaryRoot, "travel.db");
  const oldDb = new DatabaseSync(originalPath);
  oldDb.exec(`
    CREATE TABLE "_prisma_migrations" ("migration_name" TEXT, "finished_at" TEXT);
    INSERT INTO "_prisma_migrations" VALUES ('20261104150000_travel_memories', '2026-11-01');
    CREATE TABLE "TravelMemory" ("id" TEXT PRIMARY KEY, "placeId" TEXT, "content" TEXT);
    INSERT INTO "TravelMemory" VALUES ('original','kyoto','迁移前的文字');
  `);
  oldDb.close();
  const backup = await backupBeforePlaceNoteMigration(`file:${originalPath.replaceAll("\\", "/")}`);
  assert.ok(backup && existsSync(backup), "Before-migration SQLite snapshot was not created");
  const snapshot = new DatabaseSync(backup, { readOnly: true });
  assert.equal(snapshot.prepare('SELECT "content" FROM "TravelMemory"').get().content, "迁移前的文字");
  snapshot.close();
  assert.equal(await backupBeforePlaceNoteMigration(`file:${originalPath.replaceAll("\\", "/")}`), backup,
    "Second startup must keep the original pre-migration snapshot");
  console.log("PLACE_NOTE_PREFLIGHT_PASS: complete SQLite snapshot and stable repeat");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
