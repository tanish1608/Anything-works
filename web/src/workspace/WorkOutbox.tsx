import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useState } from "react";
import { useWorkspace } from "./context";
import { discardUpdate, saveDraft } from "./workflowQueue";
import { readPhoto } from "./photoInput";

export default function WorkOutbox() {
  const navigate = useNavigate();
  const { connected, act, model, state } = useWorkspace();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  if (!connected) return null;
  const restore = async (id: string) => {
    const queued = connected.queue.find((u) => u.client_uuid === id);
    if (!queued || !connected.snapshot) return;
    setBusy(true); setError("");
    try {
      if (!state.items.some((i) => i.id === queued.work_id)) throw Error("This work is no longer assigned to you. Ask the project manager to restore access; the queued photos are retained.");
      const draft = { item: queued.work_id, note: queued.note, claim: queued.claim, step: 1,
        clientId: crypto.randomUUID(), photos: await Promise.all(queued.files.map((f) => readPhoto(new File([f.blob], f.name, { type: f.blob.type })))) };
      await saveDraft(connected.snapshot.user.id, model.source.apiProjectId!, draft);
      act({ type: "draft", draft });
      await discardUpdate(id); await connected.refresh();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    {connected.notifications.length > 0 && <details className="world-detail-section">
      <summary>Team updates ({connected.notifications.length})</summary>
      {connected.notifications.slice(0, 8).map((n) => <button className="world-text-action" key={n.id} onClick={async () => {
        try { await api(`/notifications/${n.id}/read`, { method: "POST" }); await connected.refresh(); if (n.link?.startsWith("/?")) navigate(n.link); }
        catch (e) { setError((e as Error).message); }
      }}>{n.title}<small>{n.body}</small></button>)}
    </details>}
    {connected.error && <div className="world-note" role="alert"><p>Shared records couldn't refresh: {connected.error}. Saved server records remain visible.</p><button onClick={() => void connected.refresh()}>Retry records</button></div>}
    {connected.queue.length > 0 && <section className="world-detail-section" aria-label="Your upload outbox">
      <h3>Your upload outbox</h3>
      {connected.queue.map((u) => <div key={u.client_uuid} className="world-note"><p><b>{u.state === "failed" ? "Needs attention" : u.state === "sending" ? "Sending" : "Queued on this device"}</b><br />{u.note}<br />{u.error || "No server receipt yet. This does not mark work complete."}</p>
        {u.state === "failed" && <button disabled={busy} onClick={() => void restore(u.client_uuid)}>Restore photos as draft</button>}
      </div>)}
      <button disabled={busy} onClick={() => void connected.sync()}>Retry pending uploads</button>
      <p className="world-muted">Failed updates keep their photos. Restore a draft, reconfirm the latest model location and submit again.</p>
      {error && <p role="alert">{error}</p>}
    </section>}
  </>;
}
