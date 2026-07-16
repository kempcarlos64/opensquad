import { afterEach, describe, expect, it } from "vitest";

import { resetEnvForTests } from "@/server/env";
import { resetInstagramProviderForTests } from "@/server/providers/instagram";
import {
  analyzeInstagramLink,
  discoverInstagramReferences,
  instagramLinkAnalysisInputSchema,
} from "@/server/services/instagram-discovery";

afterEach(() => {
  delete process.env.APIFY_REAL_CALLS_ENABLED;
  delete process.env.APIFY_API_TOKEN;
  resetEnvForTests();
  resetInstagramProviderForTests();
});

describe("Instagram discovery", () => {
  it("returns a ranked Top 10 in complete mock mode", async () => {
    const result = await discoverInstagramReferences({
      query: "geracao de posts para Instagram",
      limit: 10,
    });

    expect(result.mode).toBe("mock");
    expect(result.candidates).toHaveLength(10);
    expect(result.candidates[0]).toMatchObject({
      rank: 1,
      platform: "instagram",
      rightsOrPermission: "public_reference",
    });
    expect(result.candidates[0]?.performanceSignal).toContain("observadas");
  });

  it("maps a public Reel link into a safe reference without returning transcript text", async () => {
    const result = await analyzeInstagramLink({
      reelUrl: "https://www.instagram.com/reel/Example123/",
    });

    expect(result.candidate.sourceUrl).toBe("https://www.instagram.com/reel/Example123/");
    expect(result.candidate.observedStructure).toContain("Adaptar");
    expect(result.candidate.adaptationGuardrail).toContain("reutilize texto");
    expect(JSON.stringify(result)).not.toContain("Em seguida, a pessoa entrega");
  });

  it("accepts only public Instagram post and Reel URLs", () => {
    expect(() => instagramLinkAnalysisInputSchema.parse({ reelUrl: "https://example.com/reel/test" })).toThrow();
    expect(() => instagramLinkAnalysisInputSchema.parse({ reelUrl: "https://www.instagram.com/stories/test" })).toThrow();
  });
});
