import type { InstagramProvider, InstagramReel, PopularReelsInput } from "./types";

const mockHooks = [
  "O motivo de seus posts parecerem genericos nao e falta de ideia.",
  "Antes de abrir o Canva, resolva esta parte do seu conteudo.",
  "Tres segundos para fazer seu post parar de ser ignorado.",
  "Voce nao precisa postar mais: precisa de uma tese por conteudo.",
  "O erro que faz especialistas parecerem iguais no Instagram.",
  "Seu proximo carrossel comeca antes do primeiro layout.",
  "Como transformar uma pergunta de cliente em conteudo que prende.",
  "Se o seu post nao tem contraste, ele perde a disputa no feed.",
  "A estrutura simples por tras de um post que vira conversa.",
  "Pare de escolher tema: comece escolhendo a tensao do publico.",
];

function mockReel(index: number, query: string): InstagramReel {
  const views = 1_820_000 - index * 119_000;
  return {
    id: `mock-instagram-${index + 1}`,
    sourceUrl: `https://www.instagram.com/reel/DEMO${String(index + 1).padStart(6, "0")}/`,
    creatorOrBrand: `Criador demonstrativo ${index + 1}`,
    caption: `${mockHooks[index] ?? mockHooks[0]} #instagram #conteudo #${query.replace(/\s+/g, "")}`,
    transcript: index % 2 === 0 ? `${mockHooks[index] ?? mockHooks[0]} Em seguida, a pessoa entrega uma explicacao curta e um convite original.` : null,
    thumbnailUrl: null,
    durationSeconds: 24 + (index % 4) * 5,
    publishedAt: "2026-06-01T12:00:00.000Z",
    views,
    plays: views + 23_000,
    likes: 97_000 - index * 6_100,
    comments: 2_400 - index * 130,
    shares: 6_800 - index * 370,
    width: 1080,
    height: 1920,
  };
}

export class MockInstagramProvider implements InstagramProvider {
  readonly mode = "mock" as const;

  async discoverPopularReels(input: PopularReelsInput): Promise<InstagramReel[]> {
    return Array.from({ length: input.limit }, (_, index) => mockReel(index, input.query));
  }

  async analyzeReel(reelUrl: string): Promise<InstagramReel> {
    const reel = mockReel(0, "conteudo");
    return { ...reel, id: "mock-link-analysis", sourceUrl: reelUrl };
  }
}
