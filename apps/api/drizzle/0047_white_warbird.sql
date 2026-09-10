CREATE TABLE "incident_affected_service" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"service_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_affected_service_unique" UNIQUE("workspace_id","incident_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "incident_responder" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_responder_workspace_incident_user_unique" UNIQUE("workspace_id","incident_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "incident_event" DROP CONSTRAINT "incident_event_type_valid";--> statement-breakpoint
ALTER TABLE "incident" DROP CONSTRAINT "incident_status_valid";--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "impact" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "commander_id" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "resolution_summary" text;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "mitigated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "incident_affected_service" ADD CONSTRAINT "incident_affected_service_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_affected_service" ADD CONSTRAINT "incident_affected_service_incident_fk" FOREIGN KEY ("workspace_id","incident_id") REFERENCES "public"."incident"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_affected_service" ADD CONSTRAINT "incident_affected_service_service_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_responder" ADD CONSTRAINT "incident_responder_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_responder" ADD CONSTRAINT "incident_responder_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_responder" ADD CONSTRAINT "incident_responder_incident_fk" FOREIGN KEY ("workspace_id","incident_id") REFERENCES "public"."incident"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "incident_affected_service_workspace_service_idx" ON "incident_affected_service" USING btree ("workspace_id","service_id","incident_id");--> statement-breakpoint
CREATE INDEX "incident_responder_workspace_user_idx" ON "incident_responder" USING btree ("workspace_id","user_id","incident_id");--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_commander_id_user_id_fk" FOREIGN KEY ("commander_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "incident_workspace_status_severity_detected_idx" ON "incident" USING btree ("workspace_id","status","severity","detected_at","id");--> statement-breakpoint
CREATE INDEX "incident_workspace_commander_idx" ON "incident" USING btree ("workspace_id","commander_id","status");--> statement-breakpoint
CREATE INDEX "incident_workspace_last_update_idx" ON "incident" USING btree ("workspace_id","last_update_at","id");--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_type_valid" CHECK ("incident_event"."type" IN ('incident.created', 'incident.status_changed', 'incident.severity_changed', 'incident.assignment_changed', 'incident.update_published', 'incident.timestamps_corrected', 'incident.resolved', 'incident.dismissed', 'incident.reopened'));--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_impact_valid" CHECK ("incident"."impact" IN ('unknown', 'none', 'degraded', 'partial_outage', 'full_outage'));--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_status_valid" CHECK ("incident"."status" IN ('detected', 'triaging', 'mitigating', 'monitoring', 'resolved', 'dismissed'));