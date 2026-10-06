import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { DailySummary, SuggestionCreate, SuggestionResult, VoiceNote } from "../api/agent.generated";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export function DailyBriefing({ projectId, onRun }: { projectId: string; onRun: (id: string) => void }) {
  const [date, setDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["agent-summary", projectId, date, timezone], enabled: !!date && !!timezone,
    queryFn: () => api<DailySummary>(`/projects/${projectId}/agent/summary?date=${date}&timezone=${encodeURIComponent(timezone)}`),
    refetchInterval: 5000 });
  return <section className="daily-summary agent-briefing" aria-label="AI daily briefing">
    <div><h2>AI daily briefing</h2><p>Important saved updates and decisions, with their sources.</p></div>
    <div className="row"><label>Summary date<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>Summary timezone<input value={timezone} onChange={e => setTimezone(e.target.value)} /></label>
      <button className="btn" disabled={busy || !date || !timezone} onClick={async () => {
        setBusy(true); setError("");
        try { await api(`/projects/${projectId}/agent/summary/refresh`, { method: "POST", json: { date, timezone } });
          await cache.invalidateQueries({ queryKey: ["agent-summary", projectId] });
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Generating briefing…" : "Refresh AI briefing"}</button></div>
    {(error || query.error) && <p role="alert">{error || query.error?.message}</p>}
    {query.data && <div className="stack">
      {query.data.status !== "available" && <p role="status">{query.data.reason}</p>}
      {query.data.statements.map(statement => <article key={statement.event_ids.join(":")}>
        <p>{statement.text}</p><small>Source events: {statement.event_ids.map(id => `#${id}`).join(", ")}</small>
        {statement.run_ids.map(id => <button className="btn" key={id} onClick={() => onRun(id)}>Open source assessment</button>)}
      </article>)}
      {query.data.status === "available" && <small>{query.data.reason}</small>}
    </div>}
  </section>;
}

export function NoteSuggestions({ projectId, modelId, elementIds, text, disabled, onText, onElements }: {
  projectId: string; modelId: string | null; elementIds: string[]; text: string; disabled: boolean;
  onText: (text: string) => void; onElements: (ids: string[]) => void;
}) {
  const [kind, setKind] = useState<SuggestionCreate["kind"]>("note");
  const [result, setResult] = useState<{ signature: string; value: SuggestionResult } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const signature = JSON.stringify([projectId, modelId, elementIds, text, kind]);
  const visible = result?.signature === signature ? result.value : null;
  return <div className="stack">
    <div className="row"><label>Suggestion type<select value={kind} onChange={e => setKind(e.target.value as SuggestionCreate["kind"])} disabled={disabled}>
      <option value="note">Update wording</option><option value="location">Work components</option><option value="evidence_request">Evidence request</option>
    </select></label><button type="button" className="btn" disabled={disabled || busy || !modelId || text.length > 2000}
      onClick={async () => {
        const revision = crypto.randomUUID(); setBusy(true); setError("");
        try {
          const value = await api<SuggestionResult>(`/projects/${projectId}/agent/suggestions`, { method: "POST",
            json: { kind, input_revision: revision, text, model_version_id: modelId, element_ids: elementIds } });
          if (value.input_revision !== revision) throw new Error("Suggestion draft changed; request again");
          setResult({ signature, value });
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? "Drafting suggestions…" : "Suggest update"}</button></div>
    {error && <p role="alert">{error}</p>}
    {visible?.status === "unavailable" && <p role="status">{visible.reason}</p>}
    {visible?.suggestions.map((item, i) => <div className="agent-suggestion" key={i}>
      <p>{item.text}</p><small>{item.reason} · Editable draft; confirm it describes your actual work.</small>
      <button type="button" className="btn" disabled={disabled} onClick={() => {
        if (kind === "location") onElements(item.element_ids); else onText(item.text);
        setResult(null);
      }}>Use suggestion</button>
    </div>)}
  </div>;
}

function AudioPlayback({ note }: { note: VoiceNote }) {
  const audio = useRef<HTMLAudioElement>(null);
  const original = useQuery({ queryKey: ["agent-audio", note.id], queryFn: () => api<Blob>(note.original_url.replace(/^\/api/, "")) });
  useEffect(() => {
    if (!original.data || !audio.current) return;
    const url = URL.createObjectURL(original.data);
    audio.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [original.data]);
  return <>{original.error && <p role="alert">{original.error.message}</p>}
    <audio ref={audio} controls aria-label="Original voice recording" /></>;
}

function TranscriptEditor({ note, onText, canUseText }: { note: VoiceNote; onText: (text: string) => void; canUseText: boolean }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [text, setText] = useState(note.text || ""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const author = note.actor_id === user!.id;
  return <div className="stack">
    <label>Transcript<textarea value={text} readOnly={!author} maxLength={5000} onChange={e => setText(e.target.value)} /></label>
    <details><summary>Original transcript</summary><p>{note.original_text}</p></details>
    {error && <p role="alert">{error}</p>}
    <div className="row">{author && <button type="button" className="btn" disabled={busy || !text.trim() || text === note.text}
      onClick={async () => { setBusy(true); setError("");
        try { await api(`/agent/voice/${note.id}`, { method: "PATCH", json: { text, expected_revision: note.revision } });
          await cache.invalidateQueries({ queryKey: ["agent-voice", note.project_id] });
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>Save transcript correction</button>}
      <button type="button" className="btn" disabled={!canUseText || !text.trim()} onClick={() => onText(text)}>Use transcript in update</button></div>
    <small>{note.model} · Worker statement; photos and review still supply installation evidence.</small>
  </div>;
}

export function VoiceCapture({ projectId, zoneId, trade, canSubmit, onText }: {
  projectId: string; zoneId: string; trade: string; canSubmit: boolean; onText: (text: string) => void;
}) {
  const cache = useQueryClient();
  const notes = useQuery({ queryKey: ["agent-voice", projectId], queryFn: () => api<VoiceNote[]>(`/projects/${projectId}/agent/voice`), refetchInterval: 3000 });
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null), [key, setKey] = useState(() => crypto.randomUUID());
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [recording, setRecording] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => {
    active.current = false;
    if (recorder.current) { recorder.current.onstop = null; if (recorder.current.state === "recording") recorder.current.stop(); }
    stream.current?.getTracks().forEach(track => track.stop());
  }; }, []);
  const note = notes.data?.find(item => item.id === selected) || null;
  const startRecording = async () => {
    setError(""); setBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("Recording unavailable in this browser; upload a saved audio file.");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const chosen = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(media, chosen ? { mimeType: chosen } : undefined);
      recorder.current = capture;
      const chunks: BlobPart[] = [];
      let bytes = 0;
      capture.ondataavailable = event => {
        bytes += event.data.size;
        if (bytes > 8 * 1024 * 1024) {
          setError("Recording reached the size limit and stopped. Review the retained audio before submitting.");
          if (capture.state === "recording") capture.stop();
        } else if (event.data.size) chunks.push(event.data);
      };
      capture.onstop = () => {
        media.getTracks().forEach(track => track.stop());
        if (!active.current) return;
        const mime = capture.mimeType.split(";")[0];
        setFile(new File(chunks, `daily-update.${mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm"}`, { type: mime }));
        setKey(crypto.randomUUID()); setRecording(false);
      };
      setCapturedAt(new Date().toISOString()); capture.start(1000); setRecording(true);
    } catch (e) { stream.current?.getTracks().forEach(track => track.stop()); setError((e as Error).message); }
    finally { if (active.current) setBusy(false); }
  };
  return <section className="stack agent-voice" aria-label="Voice updates">
    <h3>Voice updates</h3>
    {canSubmit && <>
      <label>Recorded voice<input type="file" accept="audio/*,.m4a,.wav,.mp3,.ogg,.webm" disabled={busy || recording}
        onChange={e => { setFile(e.target.files?.[0] || null); setCapturedAt(null); setKey(crypto.randomUUID()); }} /></label>
      <div className="row"><button type="button" className="btn" disabled={busy || !zoneId}
        onClick={() => { if (recording) recorder.current?.stop(); else void startRecording(); }}>{recording ? "Stop recording" : "Record voice"}</button>
        <button type="button" className="btn" disabled={busy || recording || !file || !zoneId} onClick={async () => {
          setBusy(true); setError("");
          try {
            if (file!.size > 8 * 1024 * 1024) throw new Error("Recording must be at most 8 MiB.");
            const encoded = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]);
              reader.onerror = () => reject(new Error("Could not read the recording")); reader.readAsDataURL(file!);
            });
            const fallback = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm" };
            const extension = file!.name.split(".").pop()?.toLowerCase() as keyof typeof fallback;
            const rawMime = file!.type.split(";")[0] || fallback[extension];
            const mime = rawMime === "audio/mp3" ? "audio/mpeg" : rawMime === "audio/x-wav" ? "audio/wav" : rawMime;
            const saved = await api<VoiceNote>(`/projects/${projectId}/agent/voice`, { method: "POST", headers: { "Idempotency-Key": `${key}:${zoneId}:${trade}` },
              json: { zone_id: zoneId, trade, filename: file!.name, mime_type: mime, captured_at: capturedAt, audio_base64: encoded } });
            setSelected(saved.id); setFile(null); setKey(crypto.randomUUID());
            await cache.invalidateQueries({ queryKey: ["agent-voice", projectId] });
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}>{busy ? "Saving recording…" : "Transcribe recording"}</button></div>
      {file && <p>{file.name} · {Math.ceil(file.size / 1024)} KiB</p>}
    </>}
    {(error || notes.error) && <p role="alert">{error || notes.error?.message}</p>}
    <label>Saved voice updates<select value={selected || ""} onChange={e => setSelected(e.target.value || null)}>
      <option value="">Select a recording</option>{notes.data?.map(item => <option key={item.id} value={item.id}>
        {item.filename} · {item.status} · {new Date(item.created_at).toLocaleString()}</option>)}
    </select></label>
    {note && <><p role="status">Transcription: {note.status}</p><AudioPlayback note={note} />
      {note.error && <p role="alert">{note.error.message}</p>}
      {note.status === "completed" && <TranscriptEditor key={`${note.id}:${note.revision}`} note={note} onText={onText} canUseText={canSubmit} />}</>}
  </section>;
}
