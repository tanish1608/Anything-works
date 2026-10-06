import { useState } from "react";
import { api } from "../api/client";
import { useWorkspace } from "./context";

export default function ConnectedTeam() {
  const { model, connected, canReview } = useWorkspace();
  const [email, setEmail] = useState(""), [role, setRole] = useState("trade"), [trade, setTrade] = useState("hvac");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const add = async () => {
    setBusy(true); setError("");
    try {
      await api(`/projects/${model.source.apiProjectId}/members`, { method: "POST", json: { email, role, trades: role === "trade" ? [trade] : [] } });
      await connected!.refreshMembers(); setEmail("");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    <div className="world-panel-intro"><span className="world-eyebrow">PROJECT TEAM</span><h2>The people behind the work.</h2><p>Actual project members and their permitted trades. Viewers can read; trade members submit assigned work; managers review.</p></div>
    {connected?.members.map((m) => <section key={m.id} className="world-detail-section">
      <h3>{m.user.name}</h3><p>{m.user.email}</p><small>{m.role} · {m.trades.join(", ") || "Project-wide role"}{m.zone_ids !== null ? ` · ${m.zone_ids.length} permitted areas` : ""}</small>
    </section>)}
    {canReview && <form className="world-update-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
      <h3>Add a registered teammate</h3><p>Ask them to create an account from project home first, then add their email here. No invitation email is sent.</p>
      <label>Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Project role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="trade">Trade crew</option><option value="pm">Project manager</option><option value="viewer">Read-only viewer</option></select></label>
      {role === "trade" && <label>Permitted trade<select value={trade} onChange={(e) => setTrade(e.target.value)}>{["architecture", "structure", "framing", "plumbing", "electrical", "hvac", "flooring"].map((t) => <option key={t}>{t}</option>)}</select></label>}
      <p>New trade members can access this trade across the project. Assigned work limits the daily workflow; finer area scopes can be configured through the member API.</p>
      {error && <p role="alert">{error}</p>}<button className="world-primary" disabled={busy}>{busy ? "Adding…" : "Add teammate"}</button>
    </form>}
  </>;
}
