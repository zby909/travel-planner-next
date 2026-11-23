-- 固定已有估算当时显示的币种，保留所有预算数值。
ALTER TABLE "Destination" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'CNY';
UPDATE "Destination" SET "currency" = COALESCE((
  SELECT upper(trim("value")) FROM "AppSetting"
  WHERE "key" = 'currency' AND upper(trim("value")) GLOB '[A-Z][A-Z][A-Z]'
), 'CNY');
