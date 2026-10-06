import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { ChatCreate, ChatResult } from "../api/agent.generated";
import { Icon } from "../studio/Icon";
import { readPhoto } from "./photoInput";
import type { Photo } from "./state";
import "./project-copilot.css";

type CopilotAction = "capture" | "issues" | "team" | "activity";
type CopilotStatus = "ready" | "thinking" | "listening" | "attention";
const statusLabels: Record<CopilotStatus, string> = { ready: "Ready for input", thinking: "Thinking", listening: "Listening", attention: "Needs attention" };
type Context = { projectName?: string; page: ChatCreate["page"]; label: string; displayContext: string; onAction?: (action: CopilotAction) => void; onAttachPhotos?: (photos: Photo[], note: string) => void; renderCoordination?: (note: string, close: () => void) => ReactNode; onFieldCapture?: () => void };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

export default function ProjectCopilot(context: Context) {
  const [open, setOpen] = useState(false), [activated, setActivated] = useState(false);
  const [status, setStatus] = useState<CopilotStatus>("ready");
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const move = (x: number, y: number) => {
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) setPosition({ x: Math.max(12, Math.min(x, window.innerWidth - rect.width - 12)), y: Math.max(12, Math.min(y, window.innerHeight - rect.height - 12)) });
  };
  useEffect(() => {
    const resize = () => { if (position) move(position.x, position.y); };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [position]);
  const [photos, setPhotos] = useState<Photo[]>([]), [preparing, setPreparing] = useState(false), [attachmentError, setAttachmentError] = useState("");
  const photoInput = useRef<HTMLInputElement>(null);
  const pickPhotos = () => photoInput.current?.click();
  const attach = async (files: File[]) => {
    if (!files.length) return;
    setPreparing(true); setAttachmentError("");
    try {
      if (photos.length + files.length > 6) throw new Error("Use up to six photos per update.");
      const added = await Promise.all(files.map(readPhoto));
      setPhotos(existing => [...existing, ...added]);
    } catch (e) { setAttachmentError((e as Error).message); }
    finally { setPreparing(false); }
  };
  return <section className={`project-copilot ${open ? "is-open" : ""}`} aria-label="Project Copilot">
    <input ref={photoInput} className="project-copilot-sr-only" type="file" accept="image/*" multiple aria-label="Attach work photos" disabled={preparing}
      onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void attach(files); }} />
    <div hidden={!open} ref={windowRef} id="project-copilot-body" className="project-copilot-window" style={position ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
      <div className="project-copilot-window-head"><div className="project-copilot-brand" role="button" tabIndex={0} aria-label="Move Project Copilot" title="Drag to move · arrow keys when focused"
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); const rect = windowRef.current!.getBoundingClientRect(); drag.current = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (drag.current) move(drag.current.left + event.clientX - drag.current.x, drag.current.top + event.clientY - drag.current.y); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => { const offsets: Record<string, [number, number]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }; const offset = offsets[event.key]; if (!offset) return; event.preventDefault(); const rect = windowRef.current!.getBoundingClientRect(); move(rect.left + offset[0], rect.top + offset[1]); }}>
        <span className="project-copilot-avatar"><img src="/project-copilot-avatar.png" alt="Project Copilot" /><i className="project-copilot-status" data-status={status} role="img" aria-label={statusLabels[status]} title={statusLabels[status]} /></span><div><strong>Placeholder AI</strong><span>Project Copilot</span></div></div>
        <button className="project-copilot-icon-button" aria-label="Close Project Copilot" title="Minimize chat" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button></div>
      <Conversation key={context.projectName || "current"} {...context}
        photos={photos} preparing={preparing} attachmentError={attachmentError} pickPhotos={pickPhotos} onStatusChange={setStatus}
        removePhoto={id => setPhotos(existing => existing.filter(photo => photo.id !== id))}
        savePhotos={note => { try { context.onAttachPhotos?.(photos, note); setPhotos([]); setOpen(false); } catch (e) { setAttachmentError((e as Error).message); } }} />
    </div>
    <button className="project-copilot-fab" aria-label={open ? "Minimize Project Copilot" : "Open Project Copilot"} aria-expanded={open} aria-controls="project-copilot-body"
      onClick={() => { setActivated(true); setOpen(value => !value); }}>
      <strong>Project Copilot</strong><span>{open ? "Close" : "Open"}</span>
    </button>
    {!activated && <span className="project-copilot-fab-dot" aria-hidden="true" />}
  </section>;
}

type Message = { role: "user" | "assistant"; text: string; result?: ChatResult };
function Conversation({ photos, preparing, attachmentError, pickPhotos, removePhoto, savePhotos, onStatusChange, ...context }: Context & {
  photos: Photo[]; preparing: boolean; attachmentError: string;
  pickPhotos: () => void; removePhoto: (id: string) => void; savePhotos: (note: string) => void;
  onStatusChange: (status: CopilotStatus) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [coordinating, setCoordinating] = useState(false), [showLatest, setShowLatest] = useState(false);
  const following = useRef(true);
  const current = useRef<string | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const beginCoordination = () => { setCoordinating(true); following.current = true; if (conversation.current) conversation.current.scrollTop = 0; };
  useEffect(() => () => { current.current = null; recognition.current?.stop(); }, []);
  useEffect(() => { onStatusChange(listening ? "listening" : busy || preparing ? "thinking" : error || attachmentError ? "attention" : "ready"); }, [listening, busy, preparing, error, attachmentError, onStatusChange]);
  useEffect(() => { current.current = null; setBusy(false); setError(""); }, [context.displayContext, context.page]);
  useEffect(() => { setText(""); }, [context.page]);
  useLayoutEffect(() => {
    if (following.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight;
    else if (messages.length) setShowLatest(true);
  }, [messages]);
  useLayoutEffect(() => { const input = messageInput.current; if (input) { input.style.height = "auto"; input.style.height = `${Math.min(112, Math.max(36, input.scrollHeight))}px`; } }, [text]);
  const toggleVoice = () => {
    if (listening) { recognition.current?.stop(); return; }
    const Recognition = (window as SpeechWindow).SpeechRecognition || (window as SpeechWindow).webkitSpeechRecognition;
    if (!Recognition) { setError("Voice input is unavailable in this browser. You can still type the update."); return; }
    const recorder = new Recognition(); recorder.lang = "en-US"; recorder.interimResults = false;
    recorder.onresult = event => setText(value => `${value} ${Array.from(event.results).map(result => result[0].transcript).join(" ")}`.trim());
    recorder.onerror = () => { setError("Voice input could not start. Check microphone access or type the update."); setListening(false); };
    recorder.onend = () => { recognition.current = null; setListening(false); };
    recognition.current = recorder; setError(""); setListening(true); recorder.start();
  };
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim() || busy || preparing || photos.length > 0) return;
    const revision = crypto.randomUUID(), question = text.trim(); current.current = revision;
    setBusy(true); setError("");
    const history = messages.slice(-8).map(item => ({ role: item.role, text: item.text.slice(0, 2000) }));
    try {
      const result = await api<ChatResult>("/agent/public-chat", { method: "POST", json: {
        input_revision: revision, message: question, page: context.page, display_context: context.displayContext, history } satisfies ChatCreate });
      if (current.current !== revision) return;
      if (result.input_revision !== revision) throw new Error("Page context changed; ask again");
      if (result.status === "unavailable") { setError(result.message); return; }
      setMessages(items => [...items, { role: "user", text: question }, { role: "assistant", text: result.message, result }]);
      setText("");
    } catch (e) { if (current.current === revision) setError(e instanceof ApiError && e.status === 404
      ? "Chat is missing from the running API. Restart the Anything-works-agent backend and check that the frontend API_URL points to it."
      : (e as Error).message); }
    finally { if (current.current === revision) setBusy(false); }
  };
  return <>
    <div ref={conversation} className="project-copilot-conversation" role="log" tabIndex={0} aria-label="Copilot conversation" aria-live="polite"
      onScroll={event => { const log = event.currentTarget; following.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48; setShowLatest(!following.current); }}>
      {coordinating && context.renderCoordination?.(text, () => setCoordinating(false))}
      {!coordinating && <>
      {!messages.length && <p>How can I help with this project?</p>}
      {messages.map((item, index) => <article key={index} className={`project-copilot-message ${item.role}`}>
        <strong>{item.role === "user" ? "You" : "Placeholder AI"}</strong><p>{item.text}</p>
        {item.result && <><small>{item.result.partial_context ? "Partial context · suggestions only · no records changed" : "No records changed"}</small>
          {!!item.result.sources.length && <details><summary>Sources ({item.result.sources.length})</summary>
            {item.result.sources.map((source, i) => <p key={i}>{source.kind} · {source.locator || source.id} · revision {source.revision}</p>)}</details>}
          <div className="project-copilot-prompts">{context.renderCoordination && <button onClick={beginCoordination}>Plan & follow up</button>}{item.result.suggested_questions.map((question, i) =>
            <button key={i} disabled={busy} onClick={() => setText(question)}>{question}</button>)}</div></>}
      </article>)}
      </>}
      {preparing && <p role="status">Preparing photos…</p>}
      {(error || attachmentError) && <p role="alert">{attachmentError || error}</p>}
    </div>
    {showLatest && <button className="project-copilot-latest" onClick={() => { if (conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; following.current = true; setShowLatest(false); }}>Latest ↓</button>}
    {!coordinating && <div className="project-copilot-input-area">
    <form className="project-copilot-composer" onSubmit={event => void send(event)}>
    {photos.length > 0 && <section className="project-copilot-attachments" aria-label="Attached photos">
      <div className="project-copilot-photo-grid">{photos.map(photo => <figure key={photo.id}>
        <img src={photo.url} alt={photo.name} /><figcaption>{photo.name}<small>Image</small></figcaption>
        <button type="button" aria-label={`Remove ${photo.name}`} onClick={() => removePhoto(photo.id)}><Icon name="close" size={14} /></button>
      </figure>)}</div>
    </section>}
      <label><span className="project-copilot-sr-only">Message Placeholder AI</span><textarea ref={messageInput} aria-label="Message Placeholder AI" rows={1} value={text} maxLength={2000} onChange={e => setText(e.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }}
        placeholder="Ask anything…" disabled={busy} /></label>
      <div className="project-copilot-composer-tools">
        <button type="button" aria-label="Attach photo" title="Attach photo" disabled={busy || preparing} onClick={pickPhotos}><Icon name="plus" size={20} /></button>
        <span className="project-copilot-composer-hint">{listening ? "Listening…" : busy ? "Thinking…" : ""}</span>
        <button type="button" aria-label={listening ? "Stop voice input" : "Voice input"} title={listening ? "Stop voice input" : "Voice input"} aria-pressed={listening} disabled={busy} onClick={toggleVoice}><Icon name="mic" size={18} /></button>
        <button type="submit" aria-label="Send" title="Send message" disabled={busy || preparing || photos.length > 0 || !text.trim()}><Icon name="arrow" size={20} style={{ transform: "rotate(-90deg)" }} /></button>
      </div>
    </form>
    {photos.length > 0 && <div className="project-copilot-photo-handoff"><span>Save photos to the selected work for review.</span><button type="button" disabled={preparing || !context.onAttachPhotos} onClick={() => savePhotos(text)}>Add to daily update</button></div>}
    <div className="project-copilot-actions" aria-label="Copilot quick actions">
      {[
        ["Update", "Prepare a daily site update from this screen", "capture", "report"],
        ["Photo", "What photo should I capture for this work?", "photo", "camera"],
        ["Assign", "Who should own the next step on this work?", "team", "people"],
        ["Progress", "Summarize progress and blockers for the PM", "activity", "activity"],
        ["Approvals", "Which work items are waiting for a human approval?", "issues", "check"],
        ["LiDAR", "How should I use a LiDAR scan for this review?", "", "cube"],
      ].map(([label, prompt, action, icon]) => <button key={label} type="button" disabled={busy || preparing} onClick={() => {
        if (action === "photo") { pickPhotos(); return; }
        if (action === "team" && context.renderCoordination) { beginCoordination(); return; }
        if (label === "LiDAR" && context.onFieldCapture) { context.onFieldCapture(); return; }
        setText(prompt); if (action) context.onAction?.(action as CopilotAction);
      }}><Icon name={icon} size={13} />{label}</button>)}
    </div>
    </div>}
  </>;
}
