import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { ChatCreate, ChatResult } from "../api/agent.generated";
import { Icon } from "../studio/Icon";
import "./project-copilot.css";

type CopilotAction = "capture" | "issues" | "team" | "activity";
type Context = { projectName?: string; page: ChatCreate["page"]; label: string; displayContext: string; onAction?: (action: CopilotAction) => void };
type SpeechRecognitionLike = { lang: string; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = Window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };

export default function ProjectCopilot(context: Context) {
  const [open, setOpen] = useState(false), [activated, setActivated] = useState(false);
  return <section className={`project-copilot ${open ? "is-open" : ""}`} aria-label="Project Copilot">
    {open && <div id="project-copilot-body" className="project-copilot-window">
      <div className="project-copilot-window-head"><div className="project-copilot-brand"><img src="/project-copilot-avatar.png" alt="Project Copilot" /><div><strong>Placeholder AI</strong><span>Project Copilot</span></div><b>Active</b></div>
        <button className="project-copilot-icon-button" aria-label="Close Project Copilot" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button></div>
      <Conversation key={`public:${context.page}:${context.displayContext}`} {...context} publicMode />
    </div>}
    <button className="project-copilot-fab" aria-expanded={open} aria-controls="project-copilot-body"
      onClick={() => { setActivated(true); setOpen(value => !value); }}>
      <strong>Project Copilot</strong><span>{open ? "Close" : "Open"}</span>
    </button>
    {!activated && <span className="project-copilot-fab-dot" aria-hidden="true" />}
  </section>;
}

type Message = { role: "user" | "assistant"; text: string; result?: ChatResult };
function Conversation({ publicMode = false, ...context }: Context & { publicMode?: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const current = useRef<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  useEffect(() => () => { current.current = null; recognition.current?.stop(); }, []);
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
    event.preventDefault(); if (!text.trim() || busy) return;
    const revision = crypto.randomUUID(), question = text.trim(); current.current = revision;
    setBusy(true); setError("");
    const history = messages.slice(-8).map(item => ({ role: item.role, text: item.text.slice(0, 2000) }));
    try {
      const path = publicMode ? "/agent/public-chat" : "/agent/public-chat";
      const result = await api<ChatResult>(path, { method: "POST", json: {
        input_revision: revision, message: question, page: context.page, display_context: context.displayContext, history } satisfies ChatCreate });
      if (current.current !== revision) return;
      if (result.input_revision !== revision) throw new Error("Page context changed; ask again");
      if (result.status === "unavailable") { setError(result.message); return; }
      setMessages(items => [...items.slice(-6), { role: "user", text: question }, { role: "assistant", text: result.message, result }]);
      setText("");
    } catch (e) { if (current.current === revision) setError((e as Error).message); }
    finally { if (current.current === revision) setBusy(false); }
  };
  return <>
    <div className="project-copilot-conversation" role="log" aria-label="Copilot conversation" aria-live="polite">
      {!messages.length && <>
        <p>What needs attention here? Ask for next steps, evidence to collect, or help understanding a work issue.</p>
        <div className="project-copilot-actions" aria-label="Copilot quick actions">
          <span>Quick actions</span>
          {[
            ["Daily update", "Prepare a daily site update from this screen", "capture"],
            ["Inspect photo", "What photo should I capture for this work?", "capture"],
            ["Assign work", "Who should own the next step on this work?", "team"],
            ["Progress review", "Summarize progress and blockers for the PM", "activity"],
            ["Review approvals", "Which work items are waiting for a human approval?", "issues"],
            ["LiDAR scan", "How should I use a LiDAR scan for this review?", ""],
          ].map(([label, prompt, action]) => <button key={label} type="button" onClick={() => { setText(prompt); if (action) context.onAction?.(action as CopilotAction); }}>{label}</button>)}
        </div>
      </>}
      {messages.map((item, index) => <article key={index} className={`project-copilot-message ${item.role}`}>
        <strong>{item.role === "user" ? "You" : "Placeholder AI"}</strong><p>{item.text}</p>
        {item.result && <><small>{item.result.partial_context ? "Partial context · suggestions only · no records changed" : "No records changed"}</small>
          {!!item.result.sources.length && <details><summary>Sources ({item.result.sources.length})</summary>
            {item.result.sources.map((source, i) => <p key={i}>{source.kind} · {source.locator || source.id} · revision {source.revision}</p>)}</details>}
          <div className="project-copilot-prompts">{item.result.suggested_questions.map((question, i) =>
            <button key={i} disabled={busy} onClick={() => setText(question)}>{question}</button>)}</div></>}
      </article>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <form className="project-copilot-composer" onSubmit={event => void send(event)}>
      <label><span className="project-copilot-sr-only">Message Placeholder AI</span><input aria-label="Message Placeholder AI" autoComplete="off" value={text} maxLength={2000} onChange={e => setText(e.target.value)}
        placeholder="Ask about this project…" disabled={busy} /></label>
      <button type="button" aria-label={listening ? "Stop voice input" : "Voice input"} title={listening ? "Stop voice input" : "Voice input"} disabled={busy} onClick={toggleVoice}><Icon name="mic" size={15} /></button>
      <button type="submit" disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send"}</button>
      <button type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setText(""); setError(""); }}>Clear</button>
    </form>
  </>;
}
