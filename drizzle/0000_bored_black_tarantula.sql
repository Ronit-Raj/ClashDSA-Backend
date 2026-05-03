CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TABLE "contests" (
	"contest_id" text PRIMARY KEY NOT NULL,
	"contest_duration" integer,
	"start_time" timestamp with time zone,
	"title" text,
	"problems" jsonb,
	"creator_id" text,
	"random" boolean DEFAULT false,
	"public" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"participant_id" text,
	"contest_id" text,
	"performance" jsonb,
	CONSTRAINT "participants_participant_id_contest_id_pk" PRIMARY KEY("participant_id","contest_id")
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"problem_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"topics" jsonb NOT NULL,
	"time_limit" integer DEFAULT 2 NOT NULL,
	"memory_limit" integer DEFAULT 256 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"submission_id" text PRIMARY KEY NOT NULL,
	"contest_id" text NOT NULL,
	"problem_id" integer NOT NULL,
	"participant_id" text NOT NULL,
	"tokens" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"verdict" text DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
