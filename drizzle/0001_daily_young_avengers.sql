DROP INDEX "samples_workspace_external_id_unique";--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "experimenter" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "samples" DROP COLUMN "external_id";