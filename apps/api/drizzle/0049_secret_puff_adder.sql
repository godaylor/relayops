CREATE TABLE "incident_signal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"signal_id" text NOT NULL,
	"attached_by" text,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_signal_workspace_incident_signal_unique" UNIQUE("workspace_id","incident_id","signal_id")
);
--> statement-breakpoint
CREATE TABLE "signal_ingestion_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"request_id" text NOT NULL,
	"payload_hash" text,
	"body_size" integer DEFAULT 0 NOT NULL,
	"outcome" text DEFAULT 'received' NOT NULL,
	"error_code" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "signal_ingestion_attempt_workspace_source_request_unique" UNIQUE("workspace_id","source_id","request_id"),
	CONSTRAINT "signal_ingestion_attempt_body_size_valid" CHECK ("signal_ingestion_attempt"."body_size" >= 0),
	CONSTRAINT "signal_ingestion_attempt_outcome_valid" CHECK ("signal_ingestion_attempt"."outcome" IN ('received', 'accepted', 'deduplicated', 'rejected', 'rate_limited'))
);
--> statement-breakpoint
CREATE TABLE "signal_source" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"source" text DEFAULT 'generic_webhook' NOT NULL,
	"encrypted_secret" text NOT NULL,
	"nonce" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_source_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "signal_source_workspace_name_unique" UNIQUE("workspace_id","name"),
	CONSTRAINT "signal_source_type_valid" CHECK ("signal_source"."source" = 'generic_webhook'),
	CONSTRAINT "signal_source_key_version_positive" CHECK ("signal_source"."key_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "signal" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text,
	"fingerprint" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"service_id" text,
	"title" text NOT NULL,
	"summary" text,
	"observed_at" timestamp with time zone NOT NULL,
	"severity_hint" text DEFAULT 'unknown' NOT NULL,
	"redacted_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ingestion_status" text DEFAULT 'new' NOT NULL,
	"demo_data_set_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signal_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "signal_severity_hint_valid" CHECK ("signal"."severity_hint" IN ('unknown', 'sev1', 'sev2', 'sev3', 'sev4')),
	CONSTRAINT "signal_ingestion_status_valid" CHECK ("signal"."ingestion_status" IN ('new', 'attached'))
);
--> statement-breakpoint
ALTER TABLE "incident_event" DROP CONSTRAINT "incident_event_type_valid";--> statement-breakpoint
ALTER TABLE "incident_signal" ADD CONSTRAINT "incident_signal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_signal" ADD CONSTRAINT "incident_signal_attached_by_user_id_fk" FOREIGN KEY ("attached_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_signal" ADD CONSTRAINT "incident_signal_workspace_incident_fk" FOREIGN KEY ("workspace_id","incident_id") REFERENCES "public"."incident"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_signal" ADD CONSTRAINT "incident_signal_workspace_signal_fk" FOREIGN KEY ("workspace_id","signal_id") REFERENCES "public"."signal"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "signal_ingestion_attempt" ADD CONSTRAINT "signal_ingestion_attempt_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "signal_ingestion_attempt" ADD CONSTRAINT "signal_ingestion_attempt_workspace_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."signal_source"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "signal_source" ADD CONSTRAINT "signal_source_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "signal" ADD CONSTRAINT "signal_workspace_service_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "incident_signal_workspace_signal_idx" ON "incident_signal" USING btree ("workspace_id","signal_id","incident_id");--> statement-breakpoint
CREATE INDEX "signal_ingestion_attempt_rate_idx" ON "signal_ingestion_attempt" USING btree ("workspace_id","source_id","received_at");--> statement-breakpoint
CREATE INDEX "signal_source_workspace_created_idx" ON "signal_source" USING btree ("workspace_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "signal_workspace_source_external_unique" ON "signal" USING btree ("workspace_id","source","external_id") WHERE "signal"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "signal_workspace_observed_idx" ON "signal" USING btree ("workspace_id","observed_at","id");--> statement-breakpoint
CREATE INDEX "signal_workspace_status_observed_idx" ON "signal" USING btree ("workspace_id","ingestion_status","observed_at","id");--> statement-breakpoint
CREATE INDEX "signal_workspace_service_observed_idx" ON "signal" USING btree ("workspace_id","service_id","observed_at","id");--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_type_valid" CHECK ("incident_event"."type" IN ('incident.created', 'incident.status_changed', 'incident.severity_changed', 'incident.assignment_changed', 'incident.update_published', 'incident.timestamps_corrected', 'incident.resolved', 'incident.dismissed', 'incident.reopened', 'incident.signal_attached'));