CREATE TYPE "workspace_role" AS ENUM ('owner', 'admin', 'member');

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "users_email_unique" ON "users" (lower("email"));

CREATE TABLE "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE "workspace_members" (
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "workspace_role" DEFAULT 'member' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY ("workspace_id", "user_id")
);
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" ("user_id");

CREATE TABLE "freezers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "temperature_celsius" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "freezers_workspace_name_unique" ON "freezers" ("workspace_id", "name");
CREATE INDEX "freezers_workspace_idx" ON "freezers" ("workspace_id");

CREATE TABLE "racks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "freezer_id" uuid NOT NULL REFERENCES "freezers"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "position" integer NOT NULL CHECK ("position" > 0),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "racks_freezer_name_unique" ON "racks" ("freezer_id", "name");
CREATE UNIQUE INDEX "racks_freezer_position_unique" ON "racks" ("freezer_id", "position");

CREATE TABLE "boxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rack_id" uuid NOT NULL REFERENCES "racks"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "position" integer NOT NULL CHECK ("position" > 0),
  "rows" integer DEFAULT 8 NOT NULL CHECK ("rows" > 0),
  "columns" integer DEFAULT 8 NOT NULL CHECK ("columns" > 0),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "boxes_rack_name_unique" ON "boxes" ("rack_id", "name");
CREATE UNIQUE INDEX "boxes_rack_position_unique" ON "boxes" ("rack_id", "position");

CREATE TABLE "samples" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "box_id" uuid NOT NULL REFERENCES "boxes"("id") ON DELETE CASCADE,
  "external_id" text NOT NULL,
  "name" text NOT NULL,
  "project" text NOT NULL,
  "row" integer NOT NULL CHECK ("row" > 0),
  "column" integer NOT NULL CHECK ("column" > 0),
  "stored_at" timestamptz DEFAULT now() NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "samples_workspace_external_id_unique" ON "samples" ("workspace_id", "external_id");
CREATE UNIQUE INDEX "samples_box_position_unique" ON "samples" ("box_id", "row", "column");
CREATE INDEX "samples_workspace_name_idx" ON "samples" ("workspace_id", "name");

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" ("token_hash");
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");
CREATE INDEX "sessions_expires_idx" ON "sessions" ("expires_at");
