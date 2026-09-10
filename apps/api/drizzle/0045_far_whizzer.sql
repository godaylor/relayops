CREATE TABLE "incident_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"incident_id" text NOT NULL,
	"incident_version" integer NOT NULL,
	"type" text NOT NULL,
	"actor_user_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	CONSTRAINT "incident_event_workspace_incident_key_unique" UNIQUE("workspace_id","incident_id","idempotency_key"),
	CONSTRAINT "incident_event_incident_version_type_unique" UNIQUE("incident_id","incident_version","type"),
	CONSTRAINT "incident_event_version_positive" CHECK ("incident_event"."incident_version" > 0),
	CONSTRAINT "incident_event_type_valid" CHECK ("incident_event"."type" IN ('incident.created'))
);
--> statement-breakpoint
CREATE TABLE "incident" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"severity" text DEFAULT 'unknown' NOT NULL,
	"service_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"creation_idempotency_key" text NOT NULL,
	"created_by" text,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_update_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "incident_workspace_id_number_unique" UNIQUE("workspace_id","number"),
	CONSTRAINT "incident_workspace_id_creation_key_unique" UNIQUE("workspace_id","creation_idempotency_key"),
	CONSTRAINT "incident_number_positive" CHECK ("incident"."number" > 0),
	CONSTRAINT "incident_version_positive" CHECK ("incident"."version" > 0),
	CONSTRAINT "incident_status_valid" CHECK ("incident"."status" IN ('detected')),
	CONSTRAINT "incident_severity_valid" CHECK ("incident"."severity" IN ('unknown', 'sev1', 'sev2', 'sev3', 'sev4'))
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"aggregate_version" integer NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"claimed_by" text,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_event_aggregate_version_type_unique" UNIQUE("aggregate_type","aggregate_id","aggregate_version","event_type"),
	CONSTRAINT "outbox_event_attempts_non_negative" CHECK ("outbox_event"."attempts" >= 0),
	CONSTRAINT "outbox_event_aggregate_version_positive" CHECK ("outbox_event"."aggregate_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_workspace_id_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "service_workspace_id_slug_unique" UNIQUE("workspace_id","slug")
);
--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_workspace_incident_fk" FOREIGN KEY ("workspace_id","incident_id") REFERENCES "public"."incident"("workspace_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "incident" ADD CONSTRAINT "incident_workspace_service_fk" FOREIGN KEY ("workspace_id","service_id") REFERENCES "public"."service"("workspace_id","id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "incident_event_workspace_incident_occurred_idx" ON "incident_event" USING btree ("workspace_id","incident_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "incident_workspace_detected_idx" ON "incident" USING btree ("workspace_id","detected_at","id");--> statement-breakpoint
CREATE INDEX "incident_workspace_service_detected_idx" ON "incident" USING btree ("workspace_id","service_id","detected_at","id");--> statement-breakpoint
CREATE INDEX "outbox_event_unpublished_claim_idx" ON "outbox_event" USING btree ("available_at","created_at","id") WHERE "outbox_event"."published_at" IS NULL;--> statement-breakpoint
CREATE INDEX "service_workspace_id_created_at_idx" ON "service" USING btree ("workspace_id","created_at","id");