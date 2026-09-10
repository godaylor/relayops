ALTER TABLE "service" DROP CONSTRAINT "service_workspace_id_slug_unique";--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "demo_data_set_id" text;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD COLUMN "demo_data_set_id" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "tier" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "health" text DEFAULT 'operational' NOT NULL;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "owner_team_id" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "repository_url" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "runbook_url" text;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service" ADD COLUMN "demo_data_set_id" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "product_mode" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_workspace_id_id_unique" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_workspace_owner_team_fk" FOREIGN KEY ("workspace_id","owner_team_id") REFERENCES "public"."team"("workspace_id","id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "incident_workspace_demo_idx" ON "incident" USING btree ("workspace_id","demo_data_set_id");--> statement-breakpoint
CREATE INDEX "outbox_event_workspace_demo_idx" ON "outbox_event" USING btree ("workspace_id","demo_data_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "service_workspace_active_slug_unique" ON "service" USING btree ("workspace_id","slug") WHERE "service"."archived_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_workspace_health_idx" ON "service" USING btree ("workspace_id","health","archived_at");--> statement-breakpoint
CREATE INDEX "service_workspace_demo_idx" ON "service" USING btree ("workspace_id","demo_data_set_id");--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_tier_valid" CHECK ("service"."tier" IN ('critical', 'high', 'standard', 'low'));--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_health_valid" CHECK ("service"."health" IN ('operational', 'degraded', 'major_outage', 'maintenance'));--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_product_mode_valid" CHECK ("workspace"."product_mode" IN ('legacy', 'relayops'));
