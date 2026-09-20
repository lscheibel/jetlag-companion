CREATE TABLE "trackingToken" (
	"token" text PRIMARY KEY NOT NULL,
	"deviceId" text NOT NULL,
	"createdAt" bigint NOT NULL,
	"revokedAt" bigint,
	"lastSeenAt" bigint
);
--> statement-breakpoint
CREATE INDEX "trackingToken_device_idx" ON "trackingToken" USING btree ("deviceId");