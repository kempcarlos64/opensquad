import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type {
  FinalScript,
  RenderTimeline,
  ScriptCandidate,
  VideoBrief,
  VideoPlan,
} from "@/lib/domain";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

export const organicVideoProjects = sqliteTable(
  "organic_video_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    briefJson: text("brief_json", { mode: "json" }).$type<VideoBrief>().notNull(),
    finalScriptJson: text("final_script_json", { mode: "json" }).$type<FinalScript>(),
    selectedAvatarId: text("selected_avatar_id"),
    selectedVoiceId: text("selected_voice_id"),
    ...timestamps,
  },
  (table) => [
    index("organic_video_projects_status_idx").on(table.status),
    index("organic_video_projects_created_at_idx").on(table.createdAt),
  ],
);

export const scriptCandidates = sqliteTable(
  "script_candidates",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => organicVideoProjects.id, { onDelete: "cascade" }),
    agentType: text("agent_type").notNull(),
    version: integer("version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCost: real("estimated_cost").notNull().default(0),
    outputJson: text("output_json", { mode: "json" }).$type<ScriptCandidate>(),
    score: real("score"),
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("script_candidates_project_agent_version_uq").on(
      table.projectId,
      table.agentType,
      table.version,
    ),
    index("script_candidates_project_idx").on(table.projectId),
  ],
);

export const convergenceRuns = sqliteTable(
  "convergence_runs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => organicVideoProjects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    decision: text("decision").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCost: real("estimated_cost").notNull().default(0),
    outputJson: text("output_json", { mode: "json" }).$type<FinalScript>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("convergence_runs_project_version_uq").on(
      table.projectId,
      table.version,
    ),
    index("convergence_runs_project_idx").on(table.projectId),
  ],
);

export const videoJobs = sqliteTable(
  "video_jobs",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => organicVideoProjects.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("heygen"),
    providerVideoId: text("provider_video_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    planHash: text("plan_hash").notNull(),
    status: text("status").notNull(),
    requestJson: text("request_json", { mode: "json" }).$type<VideoPlan>(),
    responseJson: text("response_json", { mode: "json" }).$type<Record<string, unknown>>(),
    sourceVideoUrl: text("source_video_url"),
    storedSourcePath: text("stored_source_path"),
    finalVideoPath: text("final_video_path"),
    srtPath: text("srt_path"),
    timelineJson: text("timeline_json", { mode: "json" }).$type<RenderTimeline>(),
    estimatedCost: real("estimated_cost").notNull().default(0),
    actualCost: real("actual_cost"),
    pollAttempt: integer("poll_attempt").notNull().default(0),
    nextPollAt: integer("next_poll_at", { mode: "timestamp_ms" }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("video_jobs_idempotency_key_uq").on(table.idempotencyKey),
    index("video_jobs_project_idx").on(table.projectId),
    index("video_jobs_provider_video_idx").on(table.providerVideoId),
    index("video_jobs_status_poll_idx").on(table.status, table.nextPollAt),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => organicVideoProjects.id, {
      onDelete: "cascade",
    }),
    eventType: text("event_type").notNull(),
    eventKey: text("event_key"),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("audit_events_event_key_uq").on(table.eventKey),
    index("audit_events_project_created_idx").on(table.projectId, table.createdAt),
  ],
);

export const trendItems = sqliteTable(
  "trend_items",
  {
    id: text("id").primaryKey(),
    platform: text("platform").notNull(),
    externalId: text("external_id"),
    sourceUrl: text("source_url").notNull(),
    creatorHandle: text("creator_handle"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    views: integer("views"),
    baselineViews: real("baseline_views"),
    performanceRatio: real("performance_ratio"),
    velocityScore: real("velocity_score"),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown>>(),
    snapshotAt: integer("snapshot_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("trend_items_snapshot_uq").on(
      table.platform,
      table.externalId,
      table.snapshotAt,
    ),
    index("trend_items_performance_idx").on(table.performanceRatio),
  ],
);
