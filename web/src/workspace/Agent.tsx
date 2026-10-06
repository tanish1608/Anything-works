import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ProposedAction, Run, SourceRef } from "../api/agent.generated";
import type { Building, ChecklistItem, Issue, Member, Project, UploadInfo } from "../api/types";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import AuthImage from "../components/AuthImage";
import ProjectModelContext from "../components/ProjectModelContext";
import { DailyBriefing, NoteSuggestions, VoiceCapture } from "./AgentTools";
import "./operations.css";
import "./agent.css";

export default function Agent({ captureOnly = false }: { captureOnly?: boolean }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <QueryClientProvider client={client}><AuthProvider><AgentSession captureOnly={captureOnly} /></AuthProvider></QueryClientProvider>;
}

function AgentSession({ captureOnly }: { captureOnly: boolean }) {
  const auth = useAuth();
  const cache = useQueryClient();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (auth.loading) return <p role="status">Loading your project session…</p>;
  if (auth.user) return <AgentProject key={auth.user.id} captureOnly={captureOnly} signOut={async () => {
    await auth.logout(); cache.clear();
  }} />;
  return <section className="operations-page">
    <div className="operations-heading"><div><p className="operations-kicker">Placeholder AI</p>
      <h1>{captureOnly ? "Field capture" : "Project agent"}</h1><p>Sign in to submit work or review your team's saved assessments.</p></div></div>
    <form className="card card-pad stack agent-login" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { cache.clear(); await auth.login(email, password); } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  </section>;
}

function AgentProject({ signOut, captureOnly }: { signOut: () => Promise<void>; captureOnly: boolean }) {
  const { user } = useAuth();
  const projects = useQuery({ queryKey: ["agent-projects", user!.id], queryFn: () => api<Project[]>("/projects") });
  const linkedRunId = new URLSearchParams(window.location.search).get("run");
  const linkedRun = useQuery({ queryKey: ["agent-linked-run", user!.id, linkedRunId], enabled: !!linkedRunId,
    queryFn: () => api<Run>(`/agent/runs/${linkedRunId}`) });
  const [projectId, setProjectId] = useState(() => new URLSearchParams(window.location.search).get("project") || "");
  const activeProjectId = projectId || linkedRun.data?.project_id || "";
  const project = projects.data?.find(p => p.id === activeProjectId);
  return <section className="operations-page">
    <div className="operations-heading"><div><p className="operations-kicker">{user!.name} · connected project</p>
      <h1>{captureOnly ? "Field capture" : "Project agent"}</h1><p>Photos, approved context and review decisions shared with your team.</p></div>
      <button className="btn" onClick={() => void signOut()}>Sign out</button></div>
    {projects.error && <p role="alert">{projects.error.message}</p>}
    {linkedRun.error && <p role="alert">{linkedRun.error.message}</p>}
    <label>Project<select value={activeProjectId} onChange={e => setProjectId(e.target.value)}>
      <option value="">Select a project</option>{projects.data?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    {projects.data?.length === 0 && <p>No project membership yet. Ask your PM to add your account.</p>}
    {project && !captureOnly && <a className="btn" href={`/field-capture?project=${encodeURIComponent(project.id)}`}>Open mobile field capture</a>}
    {project && <AssessmentBoard key={project.id} project={project} captureOnly={captureOnly} />}
  </section>;
}

function AssessmentBoard({ project, captureOnly }: { project: Project; captureOnly: boolean }) {
  const cache = useQueryClient();
  const manager = ["owner", "pm"].includes(project.my_role);
  const writable = manager || project.my_role === "trade";
  const tree = useQuery({ queryKey: ["agent-tree", project.id], queryFn: () => api<Building[]>(`/projects/${project.id}/tree`) });
  const issues = useQuery({ queryKey: ["agent-issues", project.id], queryFn: () => api<Issue[]>(`/projects/${project.id}/issues`) });
  const members = useQuery({ queryKey: ["agent-members", project.id], queryFn: () => api<Member[]>(`/projects/${project.id}/members`) });
  const runs = useQuery({ queryKey: ["agent-runs", project.id], queryFn: () => api<Run[]>(`/projects/${project.id}/agent/runs`), refetchInterval: 3000 });
  const [zone, setZone] = useState(""), [trade, setTrade] = useState(project.my_trades[0] || "plumbing");
  const [ids, setIds] = useState<string[]>([]), [note, setNote] = useState(""), [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(window.location.search).get("run"));
  const [focusIds, setFocusIds] = useState<string[]>([]), [focusToken, setFocusToken] = useState(0);
  const focus = (elements: string[]) => { setFocusIds(elements); setFocusToken(value => value + 1); };
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [reason, setReason] = useState("");
  const [pendingUpload, setPendingUpload] = useState<UploadInfo | null>(null);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const checklist = useQuery({ queryKey: ["agent-checklist", project.id, zone, trade], enabled: !!zone,
    queryFn: () => api<{ model_version_id: string | null; items: ChecklistItem[] }>(`/zones/${zone}/checklist?trade=${encodeURIComponent(trade)}`) });
  const run = runs.data?.find(r => r.id === selected) || null;
  const selectRun = (id: string) => {
    const item = runs.data?.find(candidate => candidate.id === id);
    if (item) { setSelected(id); focus(item.checks.flatMap(check => check.element_ids)); setReason(""); }
  };
  const evidence = useQuery({ queryKey: ["agent-evidence", run?.upload_id], enabled: !!run,
    queryFn: () => api<UploadInfo>(`/uploads/${run!.upload_id}`) });
  const zones = tree.data?.flatMap(b => b.levels.flatMap(l => l.zones)).filter(z =>
    project.my_role !== "trade" || project.my_zone_ids === null || project.my_zone_ids.includes(z.id)) || [];
  const stateFingerprint = runs.data?.map(item => `${item.id}:${item.status}:${item.actions.map(action => action.status).join(",")}`).join(";");
  useEffect(() => {
    void cache.invalidateQueries({ queryKey: ["home-model", project.id] });
    void cache.invalidateQueries({ queryKey: ["agent-checklist", project.id] });
    void cache.invalidateQueries({ queryKey: ["agent-evidence"] });
  }, [cache, project.id, stateFingerprint]);
  const refresh = async () => {
    await Promise.all([cache.invalidateQueries({ queryKey: ["agent-runs", project.id] }),
      cache.invalidateQueries({ queryKey: ["home-model", project.id] }),
      cache.invalidateQueries({ queryKey: ["agent-checklist", project.id] })]);
  };
  const resetDraft = () => { setIds([]); setFiles([]); setNote(""); setPendingUpload(null); setRequestKey(crypto.randomUUID()); };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      if (!checklist.data?.model_version_id) throw new Error("This project needs an approved model before assessment.");
      let up = pendingUpload;
      if (!up) {
        const body = new FormData();
        body.set("zone_id", zone); body.set("trade", trade); body.set("note", note);
        body.set("client_uuid", requestKey); body.set("element_ids", JSON.stringify(ids));
        body.set("model_version_id", checklist.data.model_version_id);
        files.forEach(file => body.append("files", file));
        up = await api<UploadInfo>(`/projects/${project.id}/uploads`, { method: "POST", body });
        setPendingUpload(up);
      }
      const saved = await api<Run>(`/projects/${project.id}/agent/runs`, { method: "POST",
        headers: { "Idempotency-Key": requestKey }, json: { upload_id: up.id, model_version_id: checklist.data.model_version_id } });
      setSelected(saved.id); focus(ids); setPendingUpload(null); setRequestKey(crypto.randomUUID());
      setFiles([]); setNote(""); setIds([]); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const decide = async (action: ProposedAction, decision: "accept" | "reject") => {
    setBusy(true); setError("");
    try {
      await api(`/agent/actions/${action.id}/decision`, { method: "POST",
        headers: { "Idempotency-Key": `${action.id}:${decision}` }, json: { decision, reason,
          fingerprint: action.fingerprint, expected_revision: action.expected_revision } });
      setReason(""); await refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const queryError = tree.error || issues.error || members.error || runs.error || checklist.error || evidence.error;
  return <>
    {!captureOnly && <DailyBriefing projectId={project.id} onRun={selectRun} />}
    {(error || queryError) && <p role="alert">{error || queryError?.message}</p>}
    <div className={captureOnly ? "agent-field-capture" : "agent-layout"}>
      {!captureOnly && <ProjectModelContext projectId={project.id} issues={issues.data || []} selected={null} onSelect={selectRun}
        records={runs.data?.map(item => ({ id: item.id, modelVersionId: item.model_version_id, elementIds: item.checks.flatMap(check => check.element_ids) }))}
        onElementSelect={id => { const item = runs.data?.find(candidate => candidate.checks.some(check => check.element_ids.includes(id))); if (item) selectRun(item.id); }}
        showNavigation={false} focus={selected ? { id: selected, elements: focusIds,
          modelVersionId: run?.model_version_id, zone: focusIds.length ? undefined : evidence.data?.zone_id } : null}
        focusToken={focusToken} />}
      <div className="stack">
        {writable && <form className="card card-pad stack" onSubmit={e => { e.preventDefault(); void submit(); }}>
          <h2>Submit work</h2>
          <label>Location<select value={zone} onChange={e => { setZone(e.target.value); resetDraft(); }} disabled={busy || !!pendingUpload} required>
            <option value="">Select a room or zone</option>{zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select></label>
          <label>Trade<select value={trade} onChange={e => { setTrade(e.target.value); resetDraft(); }} disabled={busy || !!pendingUpload}>
            {(project.my_role === "trade" ? project.my_trades : ["plumbing", "electrical", "hvac", "framing", "flooring", "structure"])
              .map(t => <option key={t} value={t}>{t}</option>)}
          </select></label>
          <fieldset disabled={busy || !!pendingUpload}><legend>Work components</legend>
            {checklist.data?.items.map(item => <label className="agent-component" key={item.id}>
              <input type="checkbox" checked={ids.includes(item.id)} onChange={e => setIds(e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))} />
              {item.name || item.ifc_class}</label>)}
            {zone && checklist.data?.items.length === 0 && <p>No work components for this location and trade.</p>}
          </fieldset>
          <label>Daily update<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={5000} disabled={busy || !!pendingUpload} /></label>
          <NoteSuggestions projectId={project.id} modelId={checklist.data?.model_version_id || null}
            elementIds={ids} text={note} disabled={busy || !!pendingUpload} onText={setNote} onElements={setIds} />
          <label>{captureOnly ? "Photos or scan screenshots" : "Photos"}<input key={requestKey} type="file" accept="image/*" multiple disabled={busy || !!pendingUpload}
            onChange={e => setFiles(Array.from(e.target.files || []))} /></label>
          {captureOnly && <><label>Take site photo<input key={`camera:${requestKey}`} type="file" accept="image/*" capture="environment" disabled={busy || !!pendingUpload} onChange={event => {
            const added = Array.from(event.target.files || []); event.target.value = "";
            if (files.length + added.length > 6) { setError("Use at most six photos per update."); return; }
            setFiles(existing => [...existing, ...added]);
          }} /></label>
            <p>Attach JPEG/PNG photos or screenshots exported by your scanning app. Original LiDAR geometry is not parsed or measured here.</p></>}
          {!!files.length && <div aria-label="Selected evidence">{files.map((file, index) => <p key={`${file.name}:${index}`}>{file.name}
            <button type="button" disabled={busy || !!pendingUpload} aria-label={`Remove ${file.name}`} onClick={() => setFiles(existing => existing.filter((_file, position) => position !== index))}>Remove</button>
          </p>)}</div>}
          <button className="btn btn-primary" disabled={busy || (!pendingUpload && (!files.length || files.length > 6 || !ids.length || ids.length > 40))}>
            {busy ? "Saving…" : pendingUpload ? "Retry assessment for saved update" : "Submit for assessment"}</button>
          {pendingUpload && <p role="status">Your update is received. Retry will reuse the saved photos.</p>}
          {pendingUpload && <button type="button" className="btn" disabled={busy} onClick={resetDraft}>Start a new update</button>}
        </form>}
        <div className="card card-pad"><VoiceCapture projectId={project.id} zoneId={zone} trade={trade}
          canSubmit={writable && !busy && !pendingUpload} onText={text => { if (!pendingUpload) setNote(text); }} /></div>
        <section className="card card-pad stack"><h2>Saved assessments</h2>
          {runs.isPending && <p role="status">Loading assessments…</p>}
          {runs.data?.length === 0 && <p>No assessments yet. A worker can submit the first update.</p>}
          {runs.data?.map(item => <button className="agent-run" key={item.id} aria-pressed={item.id === selected}
            onClick={() => selectRun(item.id)}>
            <span>{new Date(item.created_at).toLocaleString()}</span><strong>{item.status.replaceAll("_", " ")}</strong>
          </button>)}
        </section>
      </div>
    </div>
    {run && <section className="card card-pad stack" aria-label="Assessment detail">
      <div className="operations-heading"><h2>Assessment · {run.status.replaceAll("_", " ")}</h2>
        {["queued", "running", "awaiting_review"].includes(run.status) && writable && <button className="btn" disabled={busy}
          onClick={async () => { setBusy(true); setError(""); try {
            await api(`/agent/runs/${run.id}/cancel`, { method: "POST", headers: { "Idempotency-Key": `${run.id}:cancel` } }); await refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Cancel assessment</button>}</div>
      <p>{run.model ? `${run.model} · ${run.prompt_version}` : "Waiting for supported evidence/context"}</p>
      {run.error && <p role="alert">{run.error.message}</p>}
      <div className="agent-photos">{evidence.data?.photos.map(photo => <AuthImage key={photo.id} src={photo.url} alt="Submitted work evidence" />)}</div>
      {evidence.data?.verifications.filter(item => item.source === "manager" && item.state === "approved").map(item =>
        <p key={item.id}>Human acceptance · {members.data?.find(member => member.user.id === item.confirmed_by)?.user.name || item.confirmed_by} · {item.reason}</p>)}
      {run.checks.map(check => <article className="stack" key={check.id}>
        <button className="agent-run" onClick={() => focus(check.element_ids)}><strong>{check.outcome.replaceAll("_", " ")}</strong><span>Locate in model</span></button>
        <p>{check.observation}</p><ul>{check.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>
        <div className="stack">{check.sources.map((source, i) => <Citation key={`${source.id}:${i}`} source={source} canPreview={manager} />)}</div>
      </article>)}
      {manager && run.status === "awaiting_review" && <label>Review reason<textarea value={reason} maxLength={2000} onChange={e => setReason(e.target.value)} /></label>}
      {run.actions.map(action => <div className="agent-action" key={action.id}><p>{action.kind.replaceAll("_", " ")} · {action.status}</p>
        {manager && run.status === "awaiting_review" && action.status === "proposed" && <div className="row">
          <button className="btn btn-primary" disabled={busy || !reason.trim()} onClick={() => void decide(action, "accept")}>{action.kind === "record_progress" ? "Accept work" : "Request evidence"}</button>
          <button className="btn" disabled={busy || !reason.trim()} onClick={() => void decide(action, "reject")}>Reject proposal</button>
        </div>}</div>)}
    </section>}
  </>;
}

function Citation({ source, canPreview }: { source: SourceRef; canPreview: boolean }) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState<string | null>(null);
  const sheet = source.kind === "drawing" ? /^sheet:([a-f0-9-]{36})\/primitive:/.exec(source.locator || "")?.[1] : null;
  const preview = useQuery({ queryKey: ["agent-drawing-preview", source.id, source.revision], enabled: open && !!sheet && canPreview,
    queryFn: () => api<Blob>(`/sheets/${sheet}/svg`) });
  useEffect(() => {
    if (!preview.data) return;
    const objectUrl = URL.createObjectURL(preview.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [preview.data]);
  return <div className="agent-citation"><small>{source.kind} {source.locator || source.id} · revision {source.revision}</small>
    {canPreview && sheet && <button className="btn" onClick={() => setOpen(value => !value)}>{open ? "Hide drawing" : "View drawing"}</button>}
    {open && <><p>Current drawing preview. Acceptance checks that it still matches this saved source revision.</p>
      {preview.error && <p role="alert">{preview.error.message}</p>}
      {preview.isFetching && <p role="status">Loading drawing…</p>}
      {url && <img src={url} alt="Current source drawing" />}</>}
  </div>;
}
