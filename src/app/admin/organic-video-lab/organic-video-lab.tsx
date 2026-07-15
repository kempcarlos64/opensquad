"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { FinalScript, ScriptCandidate } from "@/lib/domain";

type SelectOption = {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  previewImageUrl?: string;
};

type CandidateRow = {
  id: string;
  agentType: string;
  version: number;
  model: string;
  latencyMs: number;
  estimatedCost: number;
  outputJson: ScriptCandidate | null;
  errorMessage: string | null;
};

type Job = {
  id: string;
  status: string;
  providerVideoId: string | null;
  storedSourcePath: string | null;
  finalVideoPath: string | null;
  srtPath: string | null;
  errorMessage: string | null;
  estimatedCost: number;
  actualCost: number | null;
};

type AuditEvent = {
  id: string;
  eventType: string;
  payloadJson: Record<string, unknown> | null;
  createdAt: string;
};

type Project = {
  id: string;
  title: string;
  status: string;
  finalScriptJson: FinalScript | null;
  createdAt: string;
};

type ProjectDetail = {
  project: Project;
  candidates: CandidateRow[];
  convergence: Array<{ version: number; decision: string; outputJson: FinalScript }>;
  jobs: Job[];
  events: AuditEvent[];
};

type HistoryResponse = { projects: Project[] };

const initialForm = {
  title: "Conteúdo Besorah — consistência sem improviso",
  objective: "Mostrar como transformar conhecimento em conteúdo orgânico consistente",
  audience: "Profissionais liberais e especialistas que vendem conhecimento",
  offer: "um laboratório que organiza o briefing, o roteiro e a produção do vídeo",
  tone: "Confiante, natural, didático",
  duration: "30",
  cta: "Conheça o Besorah e transforme sua próxima ideia em conteúdo.",
  sourcePatterns: "Gancho direto com uma dor reconhecível\nContraste entre improviso e processo",
  allowedClaims: "O usuário revisa o roteiro antes da geração\nO modo mock não consome créditos HeyGen",
  forbiddenClaims: "Garantia de resultados\nNúmeros de clientes não comprovados",
};

const agentLabels: Record<string, { eyebrow: string; name: string; accent: string }> = {
  retention: { eyebrow: "ROTEIRISTA A", name: "Gancho & retenção", accent: "amber" },
  conversion: { eyebrow: "ROTEIRISTA B", name: "Marca & conversão", accent: "blue" },
  naturalness: { eyebrow: "ROTEIRISTA C", name: "Naturalidade", accent: "mint" },
};

const eventLabels: Record<string, string> = {
  "project.created": "Briefing criado",
  "scripts.round_started": "Roteiristas iniciados em paralelo",
  "scripts.insufficient_candidates": "Nova rodada solicitada",
  "judge.completed": "Juiz concluiu a convergência",
  "script.edited": "Roteiro final revisado",
  "video.requested": "Vídeo solicitado à HeyGen",
  "video.completed": "Vídeo-base armazenado",
  "video.failed": "Falha na geração do vídeo",
  "render.started": "Acabamento Remotion iniciado",
  "render.completed": "Vídeo final concluído",
  "render.failed": "Falha no acabamento",
  "remotion.render_started": "Acabamento Remotion iniciado",
  "remotion.render_completed": "Vídeo final concluído",
  "remotion.render_failed": "Falha no acabamento",
};

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function assetUrl(key: string | null) {
  if (!key) return null;
  return `/api/organic-video-lab/files/${key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
  return data;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value === 0 ? 2 : 4,
  }).format(value);
}

export function OrganicVideoLab() {
  const [form, setForm] = useState(initialForm);
  const [avatars, setAvatars] = useState<SelectOption[]>([]);
  const [voices, setVoices] = useState<SelectOption[]>([]);
  const [avatarId, setAvatarId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [providerMode, setProviderMode] = useState("mock");
  const [history, setHistory] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [editedScript, setEditedScript] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    const data = await requestJson<HistoryResponse>("/api/organic-video-lab/projects");
    setHistory(data.projects);
  }, []);

  const openProject = useCallback(async (id: string) => {
    setError(null);
    const next = await requestJson<ProjectDetail>(`/api/organic-video-lab/projects/${id}`);
    setDetail(next);
    setEditedScript(next.project.finalScriptJson?.spoken_script ?? "");
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      requestJson<{ avatars: SelectOption[]; voices: SelectOption[]; mode: string }>(
        "/api/organic-video-lab/options",
      ),
      requestJson<HistoryResponse>("/api/organic-video-lab/projects"),
    ]).then(([options, historyData]) => {
        if (!active) return;
        setAvatars(options.avatars);
        setVoices(options.voices);
        setProviderMode(options.mode);
        setAvatarId(options.avatars[0]?.id ?? "");
        setVoiceId(options.voices[0]?.id ?? "");
        setHistory(historyData.projects);
      }).catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Falha ao carregar o laboratório.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!detail || !["video_queued", "video_processing", "rendering"].includes(detail.project.status)) {
      return;
    }
    const job = detail.jobs[0];
    const interval = window.setInterval(() => {
      const refresh = job
        ? requestJson<ProjectDetail>(`/api/organic-video-lab/jobs/${job.id}`).then(setDetail)
        : openProject(detail.project.id);
      void refresh.catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(interval);
  }, [detail, openProject]);

  const latestCandidates = useMemo(() => {
    const version = Math.max(0, ...((detail?.candidates ?? []).map((candidate) => candidate.version)));
    return (detail?.candidates ?? []).filter((candidate) => candidate.version === version);
  }, [detail]);

  const currentJob = detail?.jobs[0];
  const baseVideo = assetUrl(currentJob?.storedSourcePath ?? null);
  const finalVideo = assetUrl(currentJob?.finalVideoPath ?? null);
  const srtUrl = assetUrl(currentJob?.srtPath ?? null);
  const totalCost = useMemo(() => {
    const scripts = (detail?.candidates ?? []).reduce((sum, row) => sum + row.estimatedCost, 0);
    const judge = (detail?.convergence ?? []).reduce(
      (sum, row) => sum + ("estimatedCost" in row ? Number(row.estimatedCost) : 0),
      0,
    );
    return scripts + judge + (currentJob?.actualCost ?? currentJob?.estimatedCost ?? 0);
  }, [currentJob, detail]);

  function change(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function generateScripts() {
    if (!avatarId || !voiceId) {
      setError("Selecione avatar e voz antes de iniciar.");
      return;
    }
    setBusy("scripts");
    setError(null);
    try {
      const created = await requestJson<ProjectDetail>("/api/organic-video-lab/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          avatarId,
          voiceId,
          brief: {
            objective: form.objective,
            audience: form.audience,
            offer: form.offer,
            tone: form.tone.split(",").map((tone) => tone.trim()).filter(Boolean),
            duration_seconds: Number(form.duration),
            cta: form.cta,
            source_patterns: lines(form.sourcePatterns).map((description) => ({ description })),
            allowed_claims: lines(form.allowedClaims),
            forbidden_claims: lines(form.forbiddenClaims),
            brand_context: {
              company: "Besorah",
              positioning: "Conhecimento transformado em conteúdo orgânico profissional.",
            },
            language: "pt-BR",
          },
        }),
      });
      setDetail(created);
      const generated = await requestJson<ProjectDetail>(
        `/api/organic-video-lab/projects/${created.project.id}/scripts`,
        { method: "POST" },
      );
      setDetail(generated);
      setEditedScript(generated.project.finalScriptJson?.spoken_script ?? "");
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao gerar roteiros.");
    } finally {
      setBusy(null);
    }
  }

  async function saveScript() {
    if (!detail?.project.finalScriptJson) return;
    setBusy("save");
    setError(null);
    try {
      const updated = await requestJson<ProjectDetail>(
        `/api/organic-video-lab/projects/${detail.project.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            finalScript: { ...detail.project.finalScriptJson, spoken_script: editedScript },
          }),
        },
      );
      setDetail(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function generateVideo() {
    if (!detail) return;
    setBusy("video");
    setError(null);
    try {
      const updated = await requestJson<ProjectDetail>(
        `/api/organic-video-lab/projects/${detail.project.id}/video`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            avatarId,
            voiceId,
            retryFailed: currentJob?.status === "failed",
          }),
        },
      );
      setDetail(updated);
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao gerar o vídeo-base.");
    } finally {
      setBusy(null);
    }
  }

  async function finalizeVideo() {
    if (!detail) return;
    setBusy("render");
    setError(null);
    try {
      const updated = await requestJson<ProjectDetail>(
        `/api/organic-video-lab/projects/${detail.project.id}/render`,
        { method: "POST" },
      );
      setDetail(updated);
      await refreshHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha no acabamento Remotion.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelVideo() {
    if (!currentJob) return;
    setBusy("cancel");
    setError(null);
    try {
      const updated = await requestJson<ProjectDetail>(
        `/api/organic-video-lab/jobs/${currentJob.id}/cancel`,
        { method: "POST" },
      );
      setDetail(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancelamento indisponível.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="Besorah Organic Content Engine">
          <div className="brand-mark">B</div>
          <div><strong>BESORAH</strong><span>ORGANIC CONTENT ENGINE</span></div>
        </div>
        <div className="topbar-actions">
          <span className={`mode-pill ${providerMode === "mock" ? "is-mock" : "is-live"}`}>
            <i /> {providerMode === "mock" ? "MODO MOCK · 0 CRÉDITOS" : "HEYGEN REAL ATIVO"}
          </span>
          <span className="cost-pill">Custo desta sessão <strong>{formatMoney(totalCost)}</strong></span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <span className="section-kicker">LABORATÓRIO 01 · VÍDEO VERTICAL</span>
          <h1>Da ideia ao vídeo.<br /><em>Com método, não improviso.</em></h1>
          <p>Três perspectivas criativas, um juiz de convergência e um acabamento profissional — em um fluxo que você controla.</p>
        </div>
        <div className="hero-metric" aria-label="Fluxo de produção">
          <span>BRIEF</span><b>→</b><span>3 AGENTES</span><b>→</b><span>JUIZ</span><b>→</b><span>HEYGEN</span><b>→</b><span>REMOTION</span>
        </div>
      </section>

      {error ? (
        <div className="error-banner" role="alert">
          <span><strong>Algo precisa de atenção.</strong> {error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar mensagem">×</button>
        </div>
      ) : null}

      <section className="workspace-grid">
        <div className="brief-panel panel">
          <div className="panel-heading"><span>01</span><div><p>ENTRADA</p><h2>Briefing estratégico</h2></div></div>
          <div className="form-grid">
            <label className="field full"><span>Título do projeto</span><input value={form.title} onChange={(event) => change("title", event.target.value)} /></label>
            <label className="field full"><span>Objetivo do vídeo</span><textarea rows={2} value={form.objective} onChange={(event) => change("objective", event.target.value)} /></label>
            <label className="field"><span>Público</span><input value={form.audience} onChange={(event) => change("audience", event.target.value)} /></label>
            <label className="field"><span>Duração</span><select value={form.duration} onChange={(event) => change("duration", event.target.value)}><option value="20">20 segundos</option><option value="30">30 segundos</option><option value="45">45 segundos</option><option value="60">60 segundos</option></select></label>
            <label className="field full"><span>Oferta / mecanismo</span><textarea rows={2} value={form.offer} onChange={(event) => change("offer", event.target.value)} /></label>
            <label className="field"><span>Tom (separado por vírgulas)</span><input value={form.tone} onChange={(event) => change("tone", event.target.value)} /></label>
            <label className="field"><span>CTA</span><input value={form.cta} onChange={(event) => change("cta", event.target.value)} /></label>
            <label className="field full"><span>Padrões de referência · um por linha</span><textarea rows={2} value={form.sourcePatterns} onChange={(event) => change("sourcePatterns", event.target.value)} /></label>
            <details className="advanced full"><summary>Alegações e segurança factual</summary><div className="form-grid"><label className="field"><span>Alegações permitidas</span><textarea rows={3} value={form.allowedClaims} onChange={(event) => change("allowedClaims", event.target.value)} /></label><label className="field"><span>Alegações proibidas</span><textarea rows={3} value={form.forbiddenClaims} onChange={(event) => change("forbiddenClaims", event.target.value)} /></label></div></details>
            <label className="field"><span>Avatar</span><select value={avatarId} onChange={(event) => setAvatarId(event.target.value)}>{avatars.map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.name}</option>)}</select></label>
            <label className="field"><span>Voz</span><select value={voiceId} onChange={(event) => setVoiceId(event.target.value)}>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}{voice.language ? ` · ${voice.language}` : ""}</option>)}</select></label>
          </div>
          <button className="primary-action" type="button" onClick={() => void generateScripts()} disabled={busy !== null || !avatarId || !voiceId} data-testid="generate-scripts">
            <span>{busy === "scripts" ? "Os agentes estão trabalhando…" : "Gerar três roteiros"}</span><b>↗</b>
          </button>
          <p className="helper" aria-live="polite">{busy === "scripts" ? "Roteiristas executados em paralelo; o juiz entra assim que houver candidatos válidos." : "O modo mock executa o fluxo completo sem consumir APIs externas."}</p>
        </div>

        <aside className="history-panel panel">
          <div className="panel-heading compact"><span>↺</span><div><p>ARQUIVO</p><h2>Histórico</h2></div></div>
          <div className="history-list">
            {history.length === 0 ? <p className="empty-copy">Seu primeiro projeto aparecerá aqui.</p> : history.map((project) => (
              <button type="button" key={project.id} className={detail?.project.id === project.id ? "history-item active" : "history-item"} onClick={() => void openProject(project.id)}>
                <span className={`status-dot status-${project.status}`} /><span><strong>{project.title}</strong><small>{new Date(project.createdAt).toLocaleString("pt-BR")} · {project.status.replaceAll("_", " ")}</small></span><b>›</b>
              </button>
            ))}
          </div>
        </aside>
      </section>

      <section className="results-section" aria-live="polite">
        <div className="section-heading"><span>02</span><div><p>CONSELHO CRIATIVO</p><h2>Três perspectivas. Uma direção.</h2></div><div className="section-rule" /></div>
        {latestCandidates.length === 0 ? (
          <div className="empty-state"><span>03</span><h3>Os roteiros chegam aqui</h3><p>Preencha o briefing e convoque o conselho criativo para comparar as três abordagens lado a lado.</p></div>
        ) : (
          <div className="candidate-grid" data-testid="candidate-grid">
            {(["retention", "conversion", "naturalness"] as const).map((agent) => {
              const row = latestCandidates.find((candidate) => candidate.agentType === agent);
              const label = agentLabels[agent]!;
              if (!row?.outputJson) return <article className="candidate-card failed" key={agent}><div className={`candidate-stripe ${label.accent}`} /><p>{label.eyebrow}</p><h3>{label.name}</h3><strong>Agente indisponível nesta rodada</strong><small>{row?.errorMessage ?? "A execução não retornou um resultado válido."}</small></article>;
              const candidate = row.outputJson;
              const average = Object.values(candidate.scores).reduce((sum, score) => sum + score, 0) / 7;
              return (
                <article className="candidate-card" key={agent} data-testid={`candidate-${agent}`}>
                  <div className={`candidate-stripe ${label.accent}`} />
                  <div className="candidate-meta"><span>{label.eyebrow}</span><b>{average.toFixed(1)}</b></div>
                  <h3>{label.name}</h3><h4>“{candidate.hook}”</h4><p>{candidate.spoken_script}</p>
                  <div className="score-bars">{Object.entries(candidate.scores).slice(0, 4).map(([name, score]) => <div key={name}><span>{name}</span><i><b style={{ width: `${score * 10}%` }} /></i><strong>{score.toFixed(1)}</strong></div>)}</div>
                  <footer><span>{row.model}</span><span>{row.latencyMs} ms</span><span>{formatMoney(row.estimatedCost)}</span></footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {detail?.project.finalScriptJson ? (
        <section className="decision-grid">
          <div className="judge-panel panel" data-testid="judge-panel">
            <div className="judge-seal"><span>J</span></div><div className="judge-copy"><p>JUIZ DE CONVERGÊNCIA</p><h2>{detail.project.finalScriptJson.decision === "approved" ? "Roteiro aprovado" : "Revisão humana necessária"}</h2><p>O juiz preservou os elementos compatíveis e descartou alegações sem sustentação.</p><div className="judge-scores"><div><strong>{detail.project.finalScriptJson.final_score}</strong><span>nota final</span></div><div><strong>{detail.project.finalScriptJson.agreement_score}%</strong><span>convergência</span></div><div><strong>{detail.convergence.length}</strong><span>rodada(s)</span></div></div></div>
            <ul className="selected-elements">{detail.project.finalScriptJson.selected_elements.map((item) => <li key={`${item.agent}-${item.element}`}><span>✓</span><div><strong>{item.element}</strong><p>{item.rationale}</p></div></li>)}</ul>
          </div>
          <div className="editor-panel panel">
            <div className="editor-heading"><div><p>ROTEIRO FINAL</p><h2>Sua palavra é a última.</h2></div><span>{editedScript.length} caracteres</span></div>
            <textarea aria-label="Editor do roteiro final" value={editedScript} onChange={(event) => setEditedScript(event.target.value)} rows={12} data-testid="final-script-editor" />
            <div className="editor-actions"><button type="button" className="secondary-action" onClick={() => void saveScript()} disabled={busy !== null}>{busy === "save" ? "Salvando…" : "Salvar revisão"}</button><button type="button" className="primary-action compact-action" onClick={() => void generateVideo()} disabled={busy !== null || editedScript.length < 20} data-testid="generate-video"><span>{busy === "video" ? "Gerando vídeo-base…" : currentJob?.status === "failed" ? "Reprocessar no HeyGen" : "Gerar no HeyGen"}</span><b>▶</b></button></div>
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="production-section">
          <div className="section-heading"><span>03</span><div><p>PRODUÇÃO</p><h2>Do render ao arquivo final.</h2></div><div className="section-rule" /></div>
          <div className="production-grid">
            <div className="timeline-panel panel"><h3>Linha do tempo</h3><ol>{detail.events.map((event, index) => <li key={event.id} className={index === detail.events.length - 1 ? "current" : "done"}><i>{index === detail.events.length - 1 ? "•" : "✓"}</i><span><strong>{eventLabels[event.eventType] ?? event.eventType}</strong><small>{new Date(event.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</small></span></li>)}</ol>{currentJob && ["pending", "processing", "queued"].includes(currentJob.status) ? <button type="button" className="text-action" onClick={() => void cancelVideo()} disabled={busy !== null}>Cancelar, se suportado</button> : null}</div>
            <div className="video-stage panel"><div className="stage-heading"><div><p>VÍDEO-BASE</p><h3>HeyGen</h3></div><span>{currentJob?.status ?? "aguardando"}</span></div>{baseVideo ? <video controls playsInline src={baseVideo} data-testid="base-video" /> : <div className="video-placeholder"><span>H</span><p>O vídeo-base aparecerá aqui.</p></div>}<button type="button" className="secondary-action full-action" onClick={() => void finalizeVideo()} disabled={!baseVideo || busy !== null}>{busy === "render" ? "Remotion está finalizando…" : "Finalizar com Remotion"}</button></div>
            <div className="video-stage final-stage panel"><div className="stage-heading"><div><p>MASTER 9:16</p><h3>Vídeo final</h3></div><span>{finalVideo ? "1080 × 1920 · 30 fps" : "aguardando"}</span></div>{finalVideo ? <video controls playsInline src={finalVideo} data-testid="final-video" /> : <div className="video-placeholder warm"><span>B</span><p>Legendas, marca e CTA entram nesta etapa.</p></div>}<div className="download-row"><a className={!finalVideo ? "download-action disabled" : "download-action"} href={finalVideo ?? "#"} download>Baixar MP4 <b>↓</b></a><a className={!srtUrl ? "download-action ghost disabled" : "download-action ghost"} href={srtUrl ?? "#"} download>Baixar SRT</a></div></div>
          </div>
          {currentJob?.errorMessage ? <p className="job-error" role="alert">{currentJob.errorMessage}</p> : null}
        </section>
      ) : null}

      <footer className="site-footer"><span>BESORAH ORGANIC VIDEO LAB · MVP</span><span>API primeiro · revisão humana · nenhum crédito no mock</span></footer>
    </main>
  );
}
