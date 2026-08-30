ALTER TABLE "game" ALTER COLUMN "positionIntervalMs" SET DEFAULT 5000;--> statement-breakpoint
-- Nothing but `openGame` ever writes this column, so a row still holding 30000
-- is a row on the old default rather than a host's choice. Games created before
-- the trail existed get its resolution too.
UPDATE "game" SET "positionIntervalMs" = 5000 WHERE "positionIntervalMs" = 30000;
