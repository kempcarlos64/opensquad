import type { ScriptCandidate } from "@/lib/domain";

const weights = {
  hook: 20,
  retention: 15,
  clarity: 15,
  brand: 15,
  conversion: 15,
  naturalness: 10,
  factual_safety: 10,
} as const;

export function weightedCandidateScore(candidate: ScriptCandidate): number {
  const total = Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + (candidate.scores[key as keyof typeof weights] / 10) * weight;
  }, 0);
  return Math.round(total * 10) / 10;
}

export function semanticAgreement(candidates: ScriptCandidate[]): number {
  if (candidates.length < 2) return 0;
  const wordSets = candidates.map((candidate) => {
    return new Set(
      `${candidate.hook} ${candidate.spoken_script}`
        .toLocaleLowerCase("pt-BR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length > 4),
    );
  });
  const similarities: number[] = [];
  for (let first = 0; first < wordSets.length; first += 1) {
    for (let second = first + 1; second < wordSets.length; second += 1) {
      const left = wordSets[first];
      const right = wordSets[second];
      if (!left || !right) continue;
      const intersection = [...left].filter((word) => right.has(word)).length;
      const union = new Set([...left, ...right]).size;
      similarities.push(union === 0 ? 0 : intersection / union);
    }
  }
  if (similarities.length === 0) return 0;
  return Math.round((similarities.reduce((sum, value) => sum + value, 0) / similarities.length) * 100);
}
