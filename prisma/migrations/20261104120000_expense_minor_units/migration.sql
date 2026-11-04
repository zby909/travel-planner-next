-- Store expense values in the currency's minor unit, not specifically Chinese fen.
ALTER TABLE "Expense" RENAME COLUMN "amountFen" TO "amountMinor";
