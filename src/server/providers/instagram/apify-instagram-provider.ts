import { z } from "zod";

import { getEnv } from "@/server/env";

import type { InstagramProvider, InstagramReel, PopularReelsInput } from "./types";

const datasetSchema = z.array(z.record(z.string(), z.unknown()));

export class ApifyInstagramProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApifyInstagramProviderError";
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringAt(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberAt(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeReel(item: Record<string, unknown>, index: number): InstagramReel | null {
  const sourceUrl = stringAt(item, "url", "reelUrl", "postUrl", "inputUrl");
  if (!sourceUrl) return null;
  const owner = nestedRecord(item.owner);
  const id = stringAt(item, "id", "shortCode", "shortcode") ?? `instagram-${index + 1}`;
  return {
    id,
    sourceUrl,
    creatorOrBrand:
      stringAt(item, "ownerUsername", "username", "ownerFullName", "ownerName") ??
      (owner ? stringAt(owner, "username", "full_name", "fullName") : null) ??
      "Perfil publico do Instagram",
    caption: stringAt(item, "caption", "text", "description") ?? "Legenda publica nao disponivel.",
    transcript: stringAt(item, "transcript", "videoTranscript"),
    thumbnailUrl: stringAt(item, "displayUrl", "thumbnailUrl", "imageUrl", "display_url"),
    durationSeconds: numberAt(item, "videoDuration", "duration", "durationSeconds"),
    publishedAt: stringAt(item, "timestamp", "takenAt", "publishedAt"),
    views: numberAt(item, "videoViewCount", "viewCount", "viewsCount", "views"),
    plays: numberAt(item, "videoPlayCount", "playCount", "playsCount", "plays"),
    likes: numberAt(item, "likesCount", "likeCount", "likes"),
    comments: numberAt(item, "commentsCount", "commentCount", "comments"),
    shares: numberAt(item, "sharesCount", "shareCount", "shares"),
    width: numberAt(item, "videoWidth", "width"),
    height: numberAt(item, "videoHeight", "height"),
  };
}

export class ApifyInstagramProvider implements InstagramProvider {
  readonly mode = "real" as const;

  private async runActor(actor: string, input: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    const env = getEnv();
    if (!env.APIFY_API_TOKEN) {
      throw new ApifyInstagramProviderError("A integracao Apify nao possui token no servidor.");
    }
    const endpoint = new URL(
      `/v2/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items`,
      env.APIFY_API_BASE,
    );
    endpoint.searchParams.set("maxItems", "10");
    endpoint.searchParams.set("maxTotalChargeUsd", String(env.APIFY_MAX_TOTAL_CHARGE_USD));
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.APIFY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(55_000),
      });
    } catch {
      throw new ApifyInstagramProviderError("A consulta ao Instagram via Apify excedeu o tempo limite. Tente novamente.");
    }
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 300);
      if (detail.includes("Actor run did not succeed")) {
        throw new ApifyInstagramProviderError("O Instagram bloqueou temporariamente esta coleta pÃºblica. Tente novamente em alguns minutos ou ajuste o tema.");
      }
      throw new ApifyInstagramProviderError(`A consulta ao Instagram via Apify falhou (HTTP ${response.status})${detail ? `: ${detail}` : "."}`);
    }
    const data: unknown = await response.json();
    return datasetSchema.parse(data);
  }

  async discoverPopularReels(input: PopularReelsInput): Promise<InstagramReel[]> {
    const env = getEnv();
    const items = await this.runActor(env.APIFY_INSTAGRAM_SEARCH_ACTOR, {
      search: input.query,
      searchType: "popular",
      searchLimit: input.limit,
      liveSearch: false,
    });
    return items
      .map(normalizeReel)
      .filter((reel): reel is InstagramReel => reel !== null);
  }

  async analyzeReel(reelUrl: string): Promise<InstagramReel> {
    const env = getEnv();
    const items = await this.runActor(env.APIFY_INSTAGRAM_REEL_ACTOR, {
      username: [reelUrl],
      resultsLimit: 1,
      includeTranscript: true,
      includeDownloadedVideo: false,
      includeSharesCount: false,
    });
    const reel = items.map(normalizeReel).find((candidate): candidate is InstagramReel => candidate !== null);
    if (!reel) {
      throw new ApifyInstagramProviderError("Nenhum Reel publico foi retornado para este link.");
    }
    return reel;
  }
}
