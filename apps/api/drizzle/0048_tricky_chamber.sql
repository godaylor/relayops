CREATE TABLE "authorization_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"target_user_id" text,
	"previous_role" text NOT NULL,
	"next_role" text NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authorization_audit_event_type_valid" CHECK ("authorization_audit_event"."event_type" IN ('workspace.role_changed'))
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"definition" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_view_workspace_owner_name_unique" UNIQUE("workspace_id","owner_user_id","name"),
	CONSTRAINT "saved_view_visibility_valid" CHECK ("saved_view"."visibility" IN ('private', 'workspace')),
	CONSTRAINT "saved_view_schema_version_supported" CHECK ("saved_view"."schema_version" = 1),
	CONSTRAINT "saved_view_version_positive" CHECK ("saved_view"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "authorization_audit_event" ADD CONSTRAINT "authorization_audit_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "authorization_audit_event" ADD CONSTRAINT "authorization_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "authorization_audit_event" ADD CONSTRAINT "authorization_audit_event_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "authorization_audit_workspace_created_idx" ON "authorization_audit_event" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE INDEX "authorization_audit_target_created_idx" ON "authorization_audit_event" USING btree ("target_user_id","created_at");--> statement-breakpoint
CREATE INDEX "saved_view_workspace_visibility_updated_idx" ON "saved_view" USING btree ("workspace_id","visibility","updated_at","id");--> statement-breakpoint
CREATE INDEX "saved_view_workspace_owner_updated_idx" ON "saved_view" USING btree ("workspace_id","owner_user_id","updated_at","id");--> statement-breakpoint
ALTER TABLE "workspace_role" ADD CONSTRAINT "workspace_role_workspace_role_unique" UNIQUE("workspace_id","role");