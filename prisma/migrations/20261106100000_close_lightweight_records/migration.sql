-- 归档只控制展示范围，历史记录及其关联不做物理删除。
ALTER TABLE "Destination" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VisitedPlace" ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- 收敛旧模型前保留可能存在的历史值；只读运维存档随数据库备份一起保存。
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
SELECT 'legacy_lightweight_20261106', json_object(
  'planDays', json((SELECT json_group_array(json_object(
    'id', "id", 'planId', "planId", 'date', "date", 'dayNumber', "dayNumber", 'title', "title", 'details', "details"
  )) FROM "TravelPlanDay")),
  'actualBudgets', json((SELECT json_group_array(json_object('planId', "id", 'actualBudget', "actualBudget")) FROM "TravelPlan" WHERE "actualBudget" IS NOT NULL)),
  'expenseExtras', json((SELECT json_group_array(json_object('expenseId', "id", 'paidBy', "paidBy", 'receiptPath', "receiptPath")) FROM "Expense" WHERE "paidBy" IS NOT NULL OR "receiptPath" IS NOT NULL))
), CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "TravelPlanDay")
   OR EXISTS (SELECT 1 FROM "TravelPlan" WHERE "actualBudget" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "Expense" WHERE "paidBy" IS NOT NULL OR "receiptPath" IS NOT NULL);

DROP TABLE "TravelPlanDay";
ALTER TABLE "TravelPlan" DROP COLUMN "actualBudget";
ALTER TABLE "Expense" DROP COLUMN "paidBy";
ALTER TABLE "Expense" DROP COLUMN "receiptPath";
