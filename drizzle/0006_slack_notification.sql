CREATE TABLE "slack_notification" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"read_until" timestamp with time zone NOT NULL,
	CONSTRAINT "slack_notification_one_row" CHECK ("slack_notification"."id" = 1)
);
