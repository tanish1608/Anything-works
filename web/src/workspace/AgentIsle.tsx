import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { ChatCreate, ChatResult } from "../api/agent.generated";
import type { Project } from "../api/types";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { Icon } from "../studio/Icon";
import "./agent-isle.css";

type Context = { projectName?: string; page: ChatCreate["page"]; label: string; displayContext: string };

export default function AgentIsle(context: Context) {
  const [open, setOpen] = useState(false), [activated, setActivated] = useState(false);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return <section className={`agent-isle ${open ? "is-open" : ""}`} aria-label="Agent Isle">
    {open && <div id="agent-isle-body" className="agent-isle-window">
      <div className="agent-isle-window-head"><div className="agent-isle-brand"><img src="/design-assets/works-beaver.jpg" alt="" /><div><strong>Placeholder AI</strong><span>{context.projectName || "Current project"}</span></div><b>Active</b></div>
        <button className="agent-isle-icon-button" aria-label="Close Agent Isle" onClick={() => setOpen(false)}><Icon name="close" size={16} /></button></div>
      <QueryClientProvider client={client}><AuthProvider><Connection {...context} /></AuthProvider></QueryClientProvider>
    </div>}
    <button className="agent-isle-fab" aria-expanded={open} aria-controls="agent-isle-body"
      onClick={() => { setActivated(true); setOpen(value => !value); }}>
      <strong>Agent Isle</strong><span>{open ? "Close" : "Ask AI"}</span>
    </button>
    {!activated && <span className="agent-isle-fab-dot" aria-hidden="true" />}
  </section>;
}

function Connection(context: Context) {
  const auth = useAuth(), cache = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [projectId, setProjectId] = useState("");
  const projects = useQuery({ queryKey: ["isle-projects", auth.user?.id], enabled: !!auth.user,
    queryFn: () => api<Project[]>("/projects") });
  const selectedProjectId = projectId || projects.data?.[0]?.id || "";
  if (auth.loading) return <p role="status">Opening Agent Isle…</p>;
  if (!auth.user) return <>
    <Conversation key={`public:${context.page}:${context.displayContext}`} {...context} publicMode onConnect={() => setShowConnect(true)} />
    {showConnect && <form className="agent-isle-connect" aria-label="Connect Agent Isle" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { cache.clear(); await auth.login(email, password); } catch (e) { setError((e as Error).message); }
      finally { setBusy(false); }
    }}>
      <p>Connect project records for scoped issues, model status and citations.</p>
      <div className="agent-isle-connect-fields"><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button disabled={busy}>{busy ? "Connecting…" : "Connect"}</button></div>
      {error && <p role="alert">{error}</p>}
    </form>}
  </>;
  const project = projects.data?.find(item => item.id === selectedProjectId);
  return <>
    <div className="agent-isle-context"><span>Connected records</span>
      <label>Project<select aria-label="Connected project" value={selectedProjectId} onChange={e => setProjectId(e.target.value)}>
        {projects.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button onClick={async () => { await auth.logout(); cache.clear(); setProjectId(""); }}>Sign out</button>
    </div>
    {projects.error && <p role="alert">{projects.error.message}</p>}
    {project && <Conversation key={`${auth.user.id}:${project.id}:${context.page}:${context.displayContext}`} project={project} {...context} />}
  </>;
}

type Message = { role: "user" | "assistant"; text: string; result?: ChatResult };
function Conversation({ project, publicMode = false, onConnect, ...context }: Context & { project?: Project; publicMode?: boolean; onConnect?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]), [text, setText] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const current = useRef<string | null>(null);
  useEffect(() => () => { current.current = null; }, []);
  const send = async (event: FormEvent) => {
    event.preventDefault(); if (!text.trim() || busy) return;
    const revision = crypto.randomUUID(), question = text.trim(); current.current = revision;
    setBusy(true); setError("");
    const history = messages.slice(-8).map(item => ({ role: item.role, text: item.text.slice(0, 2000) }));
    try {
      const path = publicMode ? "/agent/public-chat" : `/projects/${project!.id}/agent/chat`;
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
    <div className="agent-isle-status"><span className="agent-isle-status-dot" />{publicMode ? `${context.projectName || "Current project"} · using this screen` : `${context.projectName || "Connected project"} · connected records`}
      {publicMode && onConnect && <button onClick={onConnect}>Connect project records</button>}</div>
    <div className="agent-isle-conversation" role="log" aria-label="Agent conversation" aria-live="polite">
      {!messages.length && <p>What needs attention here? Ask for next steps, evidence to collect, or help understanding a work issue.</p>}
      {messages.map((item, index) => <article key={index} className={`agent-isle-message ${item.role}`}>
        <strong>{item.role === "user" ? "You" : "Placeholder AI"}</strong><p>{item.text}</p>
        {item.result && <><small>{item.result.partial_context ? "Partial context · suggestions only · no records changed" : "No records changed"}</small>
          {!!item.result.sources.length && <details><summary>Sources ({item.result.sources.length})</summary>
            {item.result.sources.map((source, i) => <p key={i}>{source.kind} · {source.locator || source.id} · revision {source.revision}</p>)}</details>}
          <div className="agent-isle-prompts">{item.result.suggested_questions.map((question, i) =>
            <button key={i} disabled={busy} onClick={() => setText(question)}>{question}</button>)}</div></>}
      </article>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <form className="agent-isle-composer" onSubmit={event => void send(event)}>
      <label>Ask Agent Isle<input autoComplete="off" value={text} maxLength={2000} onChange={e => setText(e.target.value)}
        placeholder={`Ask about ${context.label.toLowerCase()}…`} disabled={busy} /></label>
      <button type="submit" disabled={busy || !text.trim()}>{busy ? "Thinking…" : "Send"}</button>
      <button type="button" disabled={busy || !messages.length} onClick={() => { setMessages([]); setText(""); setError(""); }}>Clear</button>
    </form>
  </>;
}
