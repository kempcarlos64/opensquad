export type InstagramReel = {
  id: string;
  sourceUrl: string;
  creatorOrBrand: string;
  caption: string;
  transcript: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string | null;
  views: number | null;
  plays: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  width: number | null;
  height: number | null;
};

export type PopularReelsInput = {
  query: string;
  limit: number;
};

export interface InstagramProvider {
  readonly mode: "mock" | "real";
  discoverPopularReels(input: PopularReelsInput): Promise<InstagramReel[]>;
  analyzeReel(reelUrl: string): Promise<InstagramReel>;
}
