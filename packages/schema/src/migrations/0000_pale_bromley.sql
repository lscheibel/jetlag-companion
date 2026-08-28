CREATE TABLE "answer" (
	"id" text PRIMARY KEY NOT NULL,
	"questionId" text NOT NULL,
	"answeringPlayerId" text NOT NULL,
	"value" jsonb NOT NULL,
	"answerPosition" jsonb,
	"clientSubmittedAt" bigint NOT NULL,
	"answeredAfterMs" integer NOT NULL,
	"serverReceivedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "constraint" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"seekerTeamId" text NOT NULL,
	"hiderTeamId" text NOT NULL,
	"source" text NOT NULL,
	"answerId" text,
	"geometry" jsonb NOT NULL,
	"mode" text NOT NULL,
	"name" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"ordinal" integer NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"actorPlayerId" text,
	"actorTeamId" text,
	"payload" jsonb NOT NULL,
	"clientSubmittedAt" bigint,
	"serverReceivedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"createdByPlayerId" text NOT NULL,
	"mapConfigId" text,
	"eventSeq" integer DEFAULT 0 NOT NULL,
	"positionIntervalMs" integer DEFAULT 30000 NOT NULL,
	"createdAt" bigint NOT NULL,
	"startedAt" bigint,
	"endedAt" bigint
);
--> statement-breakpoint
CREATE TABLE "hiderOutcome" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"hiderTeamId" text NOT NULL,
	"seekerTeamId" text,
	"foundAt" bigint,
	"durationMillis" bigint,
	"photoId" text,
	"markedByPlayerId" text,
	"markedAt" bigint
);
--> statement-breakpoint
CREATE TABLE "hidingCommitment" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"hiderTeamId" text NOT NULL,
	"stopId" text NOT NULL,
	"zone" jsonb NOT NULL,
	"committedAt" bigint NOT NULL,
	"declaredSpot" jsonb
);
--> statement-breakpoint
CREATE TABLE "houseRules" (
	"gameId" text PRIMARY KEY NOT NULL,
	"text" text NOT NULL,
	"updatedAt" bigint NOT NULL,
	"updatedByPlayerId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapConfig" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"catalogVersion" text NOT NULL,
	"name" text NOT NULL,
	"scalePreset" text NOT NULL,
	"selection" jsonb NOT NULL,
	"validHidingArea" jsonb NOT NULL,
	"hidingRadiusMeters" double precision NOT NULL,
	"modeIds" jsonb,
	"sourceTemplateId" text,
	"supersedesConfigId" text,
	"contentHash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapStop" (
	"id" text PRIMARY KEY NOT NULL,
	"mapConfigId" text NOT NULL,
	"stopId" text NOT NULL,
	"name" text NOT NULL,
	"lng" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"modeIds" jsonb NOT NULL,
	"lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"insideArea" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mapTemplate" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"createdByPlayerId" text NOT NULL,
	"createdAt" bigint NOT NULL,
	"catalogVersion" text NOT NULL,
	"scalePreset" text NOT NULL,
	"selection" jsonb NOT NULL,
	"hidingRadiusMeters" double precision NOT NULL,
	"validHidingArea" jsonb NOT NULL,
	"contentHash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"sha256" text NOT NULL,
	"contentType" text NOT NULL,
	"byteSize" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploadedByPlayerId" text NOT NULL,
	"uploadedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pin" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"teamId" text NOT NULL,
	"roundId" text,
	"createdByPlayerId" text NOT NULL,
	"lng" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"radiusMeters" double precision,
	"label" text NOT NULL,
	"note" text NOT NULL,
	"color" text NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"displayName" text NOT NULL,
	"deviceId" text NOT NULL,
	"joinedAt" bigint NOT NULL,
	"isHost" boolean DEFAULT false NOT NULL,
	"readyAt" bigint,
	"leftAt" bigint,
	"removedByPlayerId" text
);
--> statement-breakpoint
CREATE TABLE "positionSnapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"roundId" text,
	"playerId" text NOT NULL,
	"teamId" text NOT NULL,
	"fix" jsonb NOT NULL,
	"capturedAt" bigint NOT NULL,
	"receivedAt" bigint,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"askingTeamId" text NOT NULL,
	"targetTeamId" text NOT NULL,
	"type" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" text NOT NULL,
	"askedAt" bigint NOT NULL,
	"askPosition" jsonb,
	"endedAt" bigint,
	"endPosition" jsonb
);
--> statement-breakpoint
CREATE TABLE "round" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"ordinal" integer NOT NULL,
	"status" text NOT NULL,
	"hidingDurationMs" integer NOT NULL,
	"hidingStartedAt" bigint,
	"seekingStartedAt" bigint,
	"endedAt" bigint
);
--> statement-breakpoint
CREATE TABLE "roundPause" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"startedAt" bigint NOT NULL,
	"endedAt" bigint,
	"reason" text NOT NULL,
	"startedByPlayerId" text NOT NULL,
	"endedByPlayerId" text
);
--> statement-breakpoint
CREATE TABLE "roundTeamRole" (
	"roundId" text NOT NULL,
	"teamId" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "roundTeamRole_roundId_teamId_pk" PRIMARY KEY("roundId","teamId")
);
--> statement-breakpoint
CREATE TABLE "searchZone" (
	"id" text PRIMARY KEY NOT NULL,
	"roundId" text NOT NULL,
	"seekerTeamId" text NOT NULL,
	"stopId" text,
	"lng" double precision NOT NULL,
	"lat" double precision NOT NULL,
	"radiusMeters" double precision NOT NULL,
	"note" text NOT NULL,
	"declaredByPlayerId" text NOT NULL,
	"declaredAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"gameId" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"emoji" text NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teamMember" (
	"teamId" text NOT NULL,
	"playerId" text NOT NULL,
	"joinedAt" bigint NOT NULL,
	CONSTRAINT "teamMember_teamId_playerId_pk" PRIMARY KEY("teamId","playerId")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "answer_question_idx" ON "answer" USING btree ("questionId");--> statement-breakpoint
CREATE INDEX "constraint_scope_idx" ON "constraint" USING btree ("roundId","seekerTeamId","hiderTeamId");--> statement-breakpoint
CREATE UNIQUE INDEX "event_game_seq_idx" ON "event" USING btree ("gameId","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "game_code_idx" ON "game" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "hiderOutcome_round_team_idx" ON "hiderOutcome" USING btree ("roundId","hiderTeamId");--> statement-breakpoint
CREATE UNIQUE INDEX "hidingCommitment_round_team_idx" ON "hidingCommitment" USING btree ("roundId","hiderTeamId");--> statement-breakpoint
CREATE INDEX "mapStop_config_idx" ON "mapStop" USING btree ("mapConfigId");--> statement-breakpoint
CREATE UNIQUE INDEX "mapTemplate_code_idx" ON "mapTemplate" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pin_team_idx" ON "pin" USING btree ("gameId","teamId");--> statement-breakpoint
CREATE INDEX "player_game_idx" ON "player" USING btree ("gameId");--> statement-breakpoint
CREATE INDEX "positionSnapshot_game_captured_idx" ON "positionSnapshot" USING btree ("gameId","capturedAt");--> statement-breakpoint
CREATE INDEX "positionSnapshot_player_idx" ON "positionSnapshot" USING btree ("playerId");--> statement-breakpoint
CREATE INDEX "question_round_idx" ON "question" USING btree ("roundId");--> statement-breakpoint
CREATE UNIQUE INDEX "round_game_ordinal_idx" ON "round" USING btree ("gameId","ordinal");--> statement-breakpoint
CREATE INDEX "roundPause_round_idx" ON "roundPause" USING btree ("roundId");--> statement-breakpoint
CREATE UNIQUE INDEX "searchZone_round_team_idx" ON "searchZone" USING btree ("roundId","seekerTeamId");--> statement-breakpoint
CREATE INDEX "team_game_idx" ON "team" USING btree ("gameId");--> statement-breakpoint
CREATE UNIQUE INDEX "teamMember_player_idx" ON "teamMember" USING btree ("playerId");