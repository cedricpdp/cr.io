CREATE TABLE "sample_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sample_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "boxes" ADD COLUMN "project" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sample_history" ADD CONSTRAINT "sample_history_sample_id_samples_id_fk" FOREIGN KEY ("sample_id") REFERENCES "public"."samples"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_history" ADD CONSTRAINT "sample_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sample_history" ADD CONSTRAINT "sample_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sample_history_sample_created_idx" ON "sample_history" USING btree ("sample_id","created_at");--> statement-breakpoint
CREATE INDEX "sample_history_workspace_idx" ON "sample_history" USING btree ("workspace_id");