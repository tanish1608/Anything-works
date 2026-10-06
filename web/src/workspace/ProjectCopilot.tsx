import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import { Icon } from "../studio/Icon";
import { useWorkspace } from "./context";
import { readPhoto } from "./photoInput";
import { locationLabel } from "./projectState";
import { sampleContext } from "./copilotContext";
import type { Photo, WorkItem } from "./state";
import "./project-copilot.css";

/** Project Copilot: answers questions from visible work records and turns chat photos into a daily update.
 * Ported from the codex/design-iteration-2 copilot. It never changes records itself: photo updates are
 * submitted only after the person confirms the work item and location, through the normal update path. */
type ChatResult = {
  input_revision: string;
  status: "available" | "unavailable";
  message: string;
  suggested_questions: string[];
  work_ids: string[];
  sources: string[];
};
type Message =
  | { kind: "user"; text: string; photos?: Photo[] }
  | { kind: "assistant"; text: string; sources?: string[]; questions?: string[] }
  | { kind: "handoff"; photos: Photo[]; note: string; suggested: string[]; done?: { work: string; at: string } };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const clip = (value: string | undefined, n = 140) => (value || "").slice(0, n);

export default function ProjectCopilot({
  selectedWorkId,
  page,
  onOpenRecord,
}: {
  selectedWorkId: string | null;
  page: string;
  onOpenRecord: (id: string) => void;
}) {
  const { state, model, commit, online, connected, canCapture } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const project = model.source.apiProjectId;
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, busy]);
  useEffect(() => () => recognition.current?.stop(), []);
  const candidates = useMemo(() => (canCapture ? state.items : []), [canCapture, state.items]);

  const attach = async (files: File[]) => {
    if (!files.length) return;
    setError("");
    try {
      if (photos.length + files.length > 6) throw Error("Use up to six photos per update.");
      const added = await Promise.all(files.map(readPhoto));
      setPhotos((existing) => [...existing, ...added]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const ask = async (question: string, attachments: number): Promise<ChatResult | null> => {
    const body = {
      input_revision: crypto.randomUUID(),
      message: question,
      page,
      history: messages
        .filter((m): m is Extract<Message, { kind: "user" | "assistant" }> => m.kind !== "handoff")
        .slice(-8)
        .map((m) => ({ role: m.kind, text: m.text.slice(0, 2000) })),
      attachments,
      selected_work_id: selectedWorkId,
      ...(project
        ? {}
        : { display_context: sampleContext(state, selectedWorkId || undefined), candidate_work_ids: candidates.map((i) => i.id) }),
    };
    try {
      const result = await api<ChatResult>(project ? `/projects/${project}/copilot/chat` : "/copilot/public-chat", {
        method: "POST",
        json: body,
      });
      return result.input_revision === body.input_revision ? result : null;
    } catch (e) {
      setError((e as Error).message || "Copilot is unavailable.");
      return null;
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const question = text.trim();
    if (busy || (!question && !photos.length)) return;
    const attached = photos;
    setBusy(true);
    setError("");
    setText("");
    setPhotos([]);
    setMessages((m) => [...m, { kind: "user", text: question || `${attached.length} photo(s)`, photos: attached }]);
    const result = await ask(question || "Here are photos of today's work.", attached.length);
    const valid = new Set(candidates.map((i) => i.id));
    if (result?.status === "available")
      setMessages((m) => [...m, { kind: "assistant", text: result.message, sources: result.sources, questions: result.suggested_questions }]);
    else if (result) setMessages((m) => [...m, { kind: "assistant", text: result.message }]);
    if (attached.length) {
      // Photo updates work without the AI: the person still picks and confirms the work item.
      const suggested = (result?.work_ids || []).filter((id) => valid.has(id));
      if (selectedWorkId && valid.has(selectedWorkId) && !suggested.includes(selectedWorkId)) suggested.push(selectedWorkId);
      setMessages((m) => [...m, { kind: "handoff", photos: attached, note: question, suggested }]);
    }
    setBusy(false);
  };

  const submit = async (index: number, work: WorkItem, note: string) => {
    const handoff = messages[index] as Extract<Message, { kind: "handoff" }>;
    const draft = {
      item: work.id,
      clientId: crypto.randomUUID(),
      photos: handoff.photos,
      note: note.trim() || "Photo update from Project Copilot",
      claim: "",
      step: 3,
    };
    if (await commit({ type: "submit", draft, offline: !online, sample: false })) {
      setMessages((m) =>
        m.map((x, i) => (i === index && x.kind === "handoff" ? { ...x, done: { work: work.id, at: new Date().toISOString() } } : x)),
      );
      return true;
    }
    return false;
  };

  const toggleVoice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Recognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Recognition) {
      setError("Voice input is not available in this browser. You can type instead.");
      return;
    }
    const recorder = new Recognition();
    recorder.lang = "en-US";
    recorder.interimResults = false;
    recorder.onresult = (e) =>
      setText((value) => `${value} ${Array.from(e.results).map((r) => r[0].transcript).join(" ")}`.trim());
    recorder.onerror = () => {
      setError("Voice input could not start. Check microphone access or type instead.");
      setListening(false);
    };
    recorder.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = recorder;
    setListening(true);
    recorder.start();
  };

  return (
    <section className={`project-copilot ${open ? "is-open" : ""}`} aria-label="Project Copilot">
      <input
        ref={fileInput}
        className="project-copilot-sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        aria-label="Attach work photos"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          void attach(files);
        }}
      />
      {open && (
        <div className="project-copilot-window" id="project-copilot-body">
          <header className="project-copilot-head">
            <div>
              <strong>Project Copilot</strong>
              <span>{project ? "Your project records" : "Sample project · browser records"}</span>
            </div>
            <button aria-label="Close Project Copilot" onClick={() => setOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div ref={log} className="project-copilot-log" role="log" aria-label="Copilot conversation" aria-live="polite">
            {!messages.length && (
              <div className="project-copilot-empty">
                <p>Ask about this project, or send photos of today's work.</p>
                <div className="project-copilot-prompts">
                  {["What needs my attention today?", "What evidence is missing?", "Summarize open issues"].map((q) => (
                    <button key={q} onClick={() => setText(q)}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) =>
              m.kind === "handoff" ? (
                <Handoff key={i} message={m} candidates={candidates} canCapture={canCapture}
                  connected={!!connected} onSubmit={(work, note) => submit(i, work, note)} onOpenRecord={onOpenRecord} />
              ) : (
                <article key={i} className={`project-copilot-message ${m.kind}`}>
                  <strong>{m.kind === "user" ? "You" : "Placeholder AI"}</strong>
                  <p>{m.text}</p>
                  {m.kind === "user" && !!m.photos?.length && (
                    <div className="project-copilot-thumbs">
                      {m.photos.map((p) => <img key={p.id} src={p.url} alt={p.name} />)}
                    </div>
                  )}
                  {m.kind === "assistant" && (
                    <>
                      <small>Suggestions only · no records changed</small>
                      {!!m.sources?.length && (
                        <div className="project-copilot-sources">
                          {m.sources.map((s) => {
                            const id = s.replace(/^work:/, "");
                            const item = state.items.find((x) => x.id === id);
                            return item ? <button key={s} onClick={() => onOpenRecord(id)}>{item.title}</button> : null;
                          })}
                        </div>
                      )}
                      {!!m.questions?.length && (
                        <div className="project-copilot-prompts">
                          {m.questions.map((q) => <button key={q} onClick={() => setText(q)}>{q}</button>)}
                        </div>
                      )}
                    </>
                  )}
                </article>
              ),
            )}
            {busy && <p className="project-copilot-thinking" role="status">Thinking…</p>}
            {error && <p role="alert">{error}</p>}
          </div>
          <form className="project-copilot-composer" onSubmit={(e) => void send(e)}>
            {photos.length > 0 && (
              <div className="project-copilot-thumbs" aria-label="Attached photos">
                {photos.map((p) => (
                  <figure key={p.id}>
                    <img src={p.url} alt={p.name} />
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setPhotos((x) => x.filter((y) => y.id !== p.id))}>
                      <Icon name="close" size={12} />
                    </button>
                  </figure>
                ))}
              </div>
            )}
            <textarea
              aria-label="Message Placeholder AI"
              rows={2}
              maxLength={2000}
              value={text}
              placeholder={photos.length ? "What did you do? e.g. Installed the outlet boxes in the kitchen" : "Ask anything…"}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="project-copilot-tools">
              <button type="button" aria-label="Attach photo" title={canCapture ? "Attach photos" : "Your role cannot submit photos"}
                disabled={busy || !canCapture} onClick={() => fileInput.current?.click()}>
                <Icon name="camera" size={18} />
              </button>
              <button type="button" aria-label={listening ? "Stop voice input" : "Voice input"} aria-pressed={listening} disabled={busy} onClick={toggleVoice}>
                <Icon name="mic" size={18} />
              </button>
              <span>{listening ? "Listening…" : ""}</span>
              <button type="submit" className="project-copilot-send" aria-label="Send" disabled={busy || (!text.trim() && !photos.length)}>
                <Icon name="arrow" size={18} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>
          </form>
        </div>
      )}
      <button className="project-copilot-fab" aria-label={open ? "Close Project Copilot" : "Open Project Copilot"} aria-expanded={open}
        aria-controls="project-copilot-body" onClick={() => setOpen((v) => !v)}>
        <Icon name="spark" size={18} />
        <strong>Copilot</strong>
      </button>
    </section>
  );
}

function Handoff({
  message,
  candidates,
  canCapture,
  connected,
  onSubmit,
  onOpenRecord,
}: {
  message: Extract<Message, { kind: "handoff" }>;
  candidates: WorkItem[];
  canCapture: boolean;
  connected: boolean;
  onSubmit: (work: WorkItem, note: string) => Promise<boolean>;
  onOpenRecord: (id: string) => void;
}) {
  const { state } = useWorkspace();
  const [work, setWork] = useState(message.suggested[0] || "");
  const [note, setNote] = useState(message.note);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const item = candidates.find((i) => i.id === work);
  if (message.done) {
    const sent = state.items.find((i) => i.id === message.done!.work);
    // The newest server job for this work's current update; local samples have no AI check.
    const job = state.assessmentJobs?.find((j) => j.item === message.done!.work && j.update === sent?.update);
    const ai = job?.ai;
    return (
      <article className="project-copilot-message assistant project-copilot-handoff">
        <strong>Placeholder AI</strong>
        <p>
          {message.photos.length} photo(s) sent to <b>{sent?.title}</b>.{" "}
          {connected ? "The update is in your outbox until the server confirms it." : "Saved in this browser's sample project."}
        </p>
        {ai?.status === "completed" && ai.suggestion && (
          <p>AI check: {ai.suggestion.outcome.replace(/_/g, " ")}. {clip(ai.suggestion.reason, 220)} The project manager decides.</p>
        )}
        {(ai?.status === "queued" || ai?.status === "running") && <p>AI check in progress…</p>}
        <button onClick={() => onOpenRecord(message.done!.work)}>Open work record</button>
      </article>
    );
  }
  if (!canCapture)
    return (
      <article className="project-copilot-message assistant">
        <p>Your role can't submit photo updates for this project.</p>
      </article>
    );
  return (
    <article className="project-copilot-message assistant project-copilot-handoff" aria-label="Send photos as a daily update">
      <strong>Send as a daily update</strong>
      <label>
        Work item
        <select value={work} onChange={(e) => { setWork(e.target.value); setConfirmed(false); }}>
          <option value="">Choose the work these photos show</option>
          {message.suggested.length > 0 && (
            <optgroup label="Suggested">
              {message.suggested.map((id) => {
                const i = candidates.find((x) => x.id === id);
                return i ? <option key={id} value={id}>{i.title} · {locationLabel(i)}</option> : null;
              })}
            </optgroup>
          )}
          <optgroup label="All work you can update">
            {candidates.filter((i) => !message.suggested.includes(i.id)).map((i) => (
              <option key={i.id} value={i.id}>{i.title} · {locationLabel(i)}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <label>
        What changed?
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {item && (
        <label className="project-copilot-confirm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          These photos are of {item.title} at {locationLabel(item)}.
        </label>
      )}
      <button
        className="project-copilot-submit"
        disabled={!item || !confirmed || !note.trim() || saving}
        onClick={async () => {
          setSaving(true);
          try { await onSubmit(item!, note); } finally { setSaving(false); }
        }}
      >
        Submit update
      </button>
      <small>Goes to the project manager for review{connected ? " and an AI check" : ""}. Your claim is not approval.</small>
    </article>
  );
}
