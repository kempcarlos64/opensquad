import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import type {
  AgentType,
  FinalScript,
  ProjectStatus,
  RenderTimeline,
  RunMetadata,
  ScriptCandidate,
  VideoBrief,
  VideoJobStatus,
  VideoPlan,
} from "@/lib/domain";

import { getDatabase } from "./client";
import {
  auditEvents,
  convergenceRuns,
  organicVideoProjects,
  scriptCandidates,
  videoJobs,
} from "./schema";

export async function createProject(input: {
  title: string;
  brief: VideoBrief;
  avatarId: string;
  voiceId: string;
}) {
  const id = randomUUID();
  const now = new Date();
  const row = {
    id,
    title: input.title,
    status: "draft" satisfies ProjectStatus,
    briefJson: input.brief,
    selectedAvatarId: input.avatarId,
    selectedVoiceId: input.voiceId,
    createdAt: now,
    updatedAt: now,
  };
  await getDatabase().insert(organicVideoProjects).values(row);
  await addAuditEvent(id, "project.created", { title: input.title });
  return row;
}

export async function listProjects(limit = 20) {
  return getDatabase()
    .select()
    .from(organicVideoProjects)
    .orderBy(desc(organicVideoProjects.createdAt))
    .limit(limit);
}

export async function getProject(projectId: string) {
  return getDatabase().query.organicVideoProjects.findFirst({
    where: eq(organicVideoProjects.id, projectId),
  });
}

export async function getProjectDetail(projectId: string) {
  const project = await getProject(projectId);
  if (!project) return undefined;
  const [candidates, convergence, jobs, events] = await Promise.all([
    getDatabase()
      .select()
      .from(scriptCandidates)
      .where(eq(scriptCandidates.projectId, projectId))
      .orderBy(scriptCandidates.version, scriptCandidates.agentType),
    getDatabase()
      .select()
      .from(convergenceRuns)
      .where(eq(convergenceRuns.projectId, projectId))
      .orderBy(convergenceRuns.version),
    getDatabase()
      .select()
      .from(videoJobs)
      .where(eq(videoJobs.projectId, projectId))
      .orderBy(desc(videoJobs.createdAt)),
    getDatabase()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.projectId, projectId))
      .orderBy(auditEvents.createdAt),
  ]);
  return { project, candidates, convergence, jobs, events };
}

export async function updateProject(
  projectId: string,
  values: Partial<{
    status: ProjectStatus;
    finalScriptJson: FinalScript;
    selectedAvatarId: string;
    selectedVoiceId: string;
  }>,
) {
  await getDatabase()
    .update(organicVideoProjects)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(organicVideoProjects.id, projectId));
}

export async function saveCandidate(input: {
  projectId: string;
  agent: AgentType;
  version: number;
  metadata: RunMetadata;
  output?: ScriptCandidate;
  errorMessage?: string;
}) {
  const averageScore = input.output
    ? Object.values(input.output.scores).reduce((sum, score) => sum + score, 0) / 7
    : null;
  await getDatabase()
    .insert(scriptCandidates)
    .values({
      id: randomUUID(),
      projectId: input.projectId,
      agentType: input.agent,
      version: input.version,
      promptVersion: input.metadata.promptVersion,
      model: input.metadata.model,
      latencyMs: input.metadata.latencyMs,
      inputTokens: input.metadata.inputTokens,
      outputTokens: input.metadata.outputTokens,
      estimatedCost: input.metadata.estimatedCost,
      outputJson: input.output ?? null,
      score: averageScore,
      errorMessage: input.errorMessage ?? null,
    })
    .onConflictDoNothing();
}

export async function saveConvergence(input: {
  projectId: string;
  version: number;
  metadata: RunMetadata;
  output: FinalScript;
}) {
  await getDatabase()
    .insert(convergenceRuns)
    .values({
      id: randomUUID(),
      projectId: input.projectId,
      version: input.version,
      decision: input.output.decision,
      promptVersion: input.metadata.promptVersion,
      model: input.metadata.model,
      latencyMs: input.metadata.latencyMs,
      inputTokens: input.metadata.inputTokens,
      outputTokens: input.metadata.outputTokens,
      estimatedCost: input.metadata.estimatedCost,
      outputJson: input.output,
    })
    .onConflictDoNothing();
}

export async function addAuditEvent(
  projectId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {},
  eventKey?: string,
) {
  await getDatabase()
    .insert(auditEvents)
    .values({
      id: randomUUID(),
      projectId,
      eventType,
      eventKey: eventKey ?? null,
      payloadJson: payload,
    })
    .onConflictDoNothing();
}

export async function getAuditEventByKey(eventKey: string) {
  return getDatabase().query.auditEvents.findFirst({
    where: eq(auditEvents.eventKey, eventKey),
  });
}

export async function createVideoJob(input: {
  projectId: string;
  idempotencyKey: string;
  planHash: string;
  plan: VideoPlan;
}) {
  const id = randomUUID();
  const now = new Date();
  await getDatabase()
    .insert(videoJobs)
    .values({
      id,
      projectId: input.projectId,
      idempotencyKey: input.idempotencyKey,
      planHash: input.planHash,
      status: "queued",
      requestJson: input.plan,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return getVideoJobByIdempotencyKey(input.idempotencyKey);
}

export async function getVideoJob(jobId: string) {
  return getDatabase().query.videoJobs.findFirst({ where: eq(videoJobs.id, jobId) });
}

export async function getVideoJobByIdempotencyKey(idempotencyKey: string) {
  return getDatabase().query.videoJobs.findFirst({
    where: eq(videoJobs.idempotencyKey, idempotencyKey),
  });
}

export async function getVideoJobByProviderId(providerVideoId: string) {
  return getDatabase().query.videoJobs.findFirst({
    where: eq(videoJobs.providerVideoId, providerVideoId),
  });
}

export async function updateVideoJob(
  jobId: string,
  values: Partial<{
    providerVideoId: string;
    status: VideoJobStatus;
    responseJson: Record<string, unknown>;
    sourceVideoUrl: string;
    storedSourcePath: string | null;
    finalVideoPath: string | null;
    srtPath: string | null;
    timelineJson: RenderTimeline;
    estimatedCost: number;
    actualCost: number;
    pollAttempt: number;
    nextPollAt: Date;
    errorMessage: string | null;
  }>,
) {
  await getDatabase()
    .update(videoJobs)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(videoJobs.id, jobId));
}

export async function findReadyJobForProject(projectId: string) {
  return getDatabase().query.videoJobs.findFirst({
    where: and(eq(videoJobs.projectId, projectId), eq(videoJobs.status, "completed")),
    orderBy: desc(videoJobs.createdAt),
  });
}
