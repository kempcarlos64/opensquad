import {
  finalScriptSchema,
  scriptCandidateSchema,
  videoBriefSchema,
  type FinalScript,
  type QualityCriterion,
  type QualityRubricItem,
  type ScriptCandidate,
  type VideoBrief,
} from "@/lib/domain";

const weights = {
  hook: 20,
  retention: 15,
  clarity: 15,
  brand: 15,
  conversion: 15,
  naturalness: 10,
  factual_safety: 10,
} as const;

export const QUALITY_RUBRIC_WEIGHTS: Record<QualityCriterion, number> = {
  hook: 15,
  retention_architecture: 15,
  strategic_clarity: 10,
  organic_value: 10,
  conversion: 15,
  naturalness: 10,
  brand_fit: 5,
  factual_integrity: 10,
  originality_safety: 5,
  production_readiness: 5,
};

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

export function normalizeBriefReferences(brief: VideoBrief): VideoBrief {
  return videoBriefSchema.parse({
    ...brief,
    source_patterns: brief.source_patterns.map((source, index) => ({
      ...source,
      id: source.id?.trim() || `ref-${index + 1}`,
    })),
  });
}

function normalizedWords(value: string): string[] {
  return value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function hasSharedPhrase(left: string, right: string, phraseLength = 6): boolean {
  const leftWords = normalizedWords(left);
  const rightWords = normalizedWords(right);
  if (leftWords.length < phraseLength || rightWords.length < phraseLength) return false;
  const rightPhrases = new Set<string>();
  for (let index = 0; index <= rightWords.length - phraseLength; index += 1) {
    rightPhrases.add(rightWords.slice(index, index + phraseLength).join(" "));
  }
  for (let index = 0; index <= leftWords.length - phraseLength; index += 1) {
    if (rightPhrases.has(leftWords.slice(index, index + phraseLength).join(" "))) return true;
  }
  return false;
}

function highestRisk(
  current: ScriptCandidate["originality_check"]["similarity_risk"],
  next: ScriptCandidate["originality_check"]["similarity_risk"],
) {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

/**
 * Deterministic guardrail for claims made by the model about originality.
 * It only catches evidence present in the supplied text; it never claims to be
 * a complete copyright or visual-similarity analysis.
 */
export function auditCandidateReferences(
  candidate: ScriptCandidate,
  brief: VideoBrief,
): ScriptCandidate {
  const normalizedBrief = normalizeBriefReferences(brief);
  const knownIds = new Set(normalizedBrief.source_patterns.map((source) => source.id ?? ""));
  const unknownIds = candidate.reference_adaptations
    .map((adaptation) => adaptation.reference_id)
    .filter((referenceId) => !knownIds.has(referenceId));
  const candidateText = [candidate.hook, candidate.spoken_script]
    .concat(candidate.scene_beats.map((beat) => beat.spoken))
    .join(" ");
  const candidateVisuals = candidate.scene_beats.map((beat) => beat.visual).join(" ");
  const textOverlap = normalizedBrief.source_patterns.some((source) => {
    const suppliedText = [source.description, source.observed_hook, source.observed_structure]
      .filter((value): value is string => Boolean(value))
      .join(" ");
    return hasSharedPhrase(candidateText, suppliedText);
  });
  const visualOverlap = normalizedBrief.source_patterns.some((source) => {
    return source.observed_visual_pattern
      ? hasSharedPhrase(candidateVisuals, source.observed_visual_pattern)
      : false;
  });

  const riskFlags = new Set(candidate.risk_flags);
  const notes = new Set(candidate.originality_check.notes);
  let similarityRisk = candidate.originality_check.similarity_risk;
  if (textOverlap) {
    riskFlags.add("REFERENCE_VERBATIM_OVERLAP");
    notes.add("Foi detectada sobreposição textual de seis ou mais palavras com uma referência fornecida.");
    similarityRisk = highestRisk(similarityRisk, "high");
  }
  if (visualOverlap) {
    riskFlags.add("REFERENCE_VISUAL_OVERLAP");
    notes.add("Foi detectada sobreposição descritiva com um padrão visual fornecido.");
    similarityRisk = highestRisk(similarityRisk, "high");
  }
  if (unknownIds.length > 0) {
    riskFlags.add("UNKNOWN_REFERENCE_ID");
    notes.add(`Referências não reconhecidas: ${[...new Set(unknownIds)].join(", ")}.`);
    similarityRisk = highestRisk(similarityRisk, "medium");
  }

  return scriptCandidateSchema.parse({
    ...candidate,
    risk_flags: [...riskFlags],
    originality_check: {
      ...candidate.originality_check,
      no_verbatim_copy: candidate.originality_check.no_verbatim_copy && !textOverlap,
      no_distinctive_visual_copy:
        candidate.originality_check.no_distinctive_visual_copy && !visualOverlap,
      similarity_risk: similarityRisk,
      notes: [...notes],
    },
  });
}

export function weightedQualityRubricScore(rubric: QualityRubricItem[]): number {
  const scores = new Map<QualityCriterion, number>();
  for (const item of rubric) {
    if (!scores.has(item.criterion)) scores.set(item.criterion, item.score);
  }
  const total = Object.entries(QUALITY_RUBRIC_WEIGHTS).reduce((sum, [criterion, weight]) => {
    return sum + ((scores.get(criterion as QualityCriterion) ?? 0) / 10) * weight;
  }, 0);
  return Math.round(total * 10) / 10;
}

export function qualityGateIssues(final: FinalScript): string[] {
  const expected = Object.keys(QUALITY_RUBRIC_WEIGHTS) as QualityCriterion[];
  const seen = new Set<QualityCriterion>();
  const duplicateCriteria = new Set<QualityCriterion>();
  for (const item of final.quality_rubric) {
    if (seen.has(item.criterion)) duplicateCriteria.add(item.criterion);
    seen.add(item.criterion);
  }
  const missingCriteria = expected.filter((criterion) => !seen.has(criterion));
  const scores = new Map(final.quality_rubric.map((item) => [item.criterion, item.score]));
  const issues: string[] = [];
  if (missingCriteria.length > 0) issues.push(`Rubrica incompleta: ${missingCriteria.join(", ")}.`);
  if (duplicateCriteria.size > 0) {
    issues.push(`Critérios duplicados na rubrica: ${[...duplicateCriteria].join(", ")}.`);
  }
  if ((scores.get("factual_integrity") ?? 0) < 9) {
    issues.push("Integridade factual abaixo do mínimo de 9/10.");
  }
  if ((scores.get("originality_safety") ?? 0) < 9) {
    issues.push("Originalidade e segurança contra cópia abaixo do mínimo de 9/10.");
  }
  if (final.quality_rubric.some((item) => item.blocking_issue)) {
    issues.push("A rubrica contém ao menos um bloqueio crítico.");
  }
  if (final.reference_audit.prohibited_copy_detected) {
    issues.push("A auditoria de referências detectou cópia textual ou visual proibida.");
  }
  if (final.fact_checks.some((check) => check.status === "needs_review")) {
    issues.push("Há alegações que ainda precisam de revisão factual.");
  }
  return issues;
}

export function enforceQualityGate(
  final: FinalScript,
  round: number,
  maximumRounds: number,
): FinalScript {
  const finalScore = weightedQualityRubricScore(final.quality_rubric);
  const issues = qualityGateIssues(final);
  const gateFailed = finalScore < 85 || issues.length > 0;
  let decision = final.decision;
  if (decision === "approved" && gateFailed) {
    decision = round < maximumRounds ? "retry" : "human_review";
  }
  const gateReasons = [
    ...(finalScore < 85 ? [`Nota ponderada ${finalScore}/100 abaixo do mínimo de 85.`] : []),
    ...issues,
  ];
  return finalScriptSchema.parse({
    ...final,
    decision,
    final_score: finalScore,
    rejection_reasons: [...new Set([...final.rejection_reasons, ...gateReasons])],
    retry_directive: {
      ...final.retry_directive,
      required_changes: [
        ...new Set([...final.retry_directive.required_changes, ...gateReasons]),
      ],
    },
  });
}
