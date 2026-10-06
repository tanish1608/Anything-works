import { locationLabel } from "./projectState";
import { useRef, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Icon } from "../studio/Icon";
import { Button, Card, CheckTable, Chip, Heading } from "./components";
import { ASSETS, type Draft } from "./state";
import { useWorkspace } from "./context";

import { readPhoto } from "./photoInput";

export function Capture() {
  const { state, act, online } = useWorkspace(),
    [params] = useSearchParams(),
    navigate = useNavigate();
  const requested = state.items.find((i) => i.id === params.get("item"));
  const [draft, setDraft] = useState<Draft>(() =>
    state.draft && (!requested || requested.id === state.draft.item)
      ? state.draft
      : {
          item: requested?.id || "ELEC-406",
          note: "",
          claim: "",
          photos: [],
          step: 1,
        },
  );
  const [simulateOffline, setSimulateOffline] = useState(false),
    [sampleRun, setSampleRun] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    item = state.items.find((i) => i.id === draft.item) || state.items[0];
  const update = (value: Partial<Draft>) => {
    const next = { ...draft, ...value };
    if (act({ type: "draft", draft: next })) setDraft(next);
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      if (draft.photos.length + files.length > 6)
        throw new Error("Use up to six photos per demo update.");
      const photos = await Promise.all(Array.from(files).map(readPhoto));
      update({ photos: [...draft.photos, ...photos] });
      setSampleRun(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const addSample = () => {
    if (draft.photos.length >= 6) {
      setError("Use up to six photos per demo update.");
      return;
    }
    update({
      photos: [
        ...draft.photos,
        {
          id: crypto.randomUUID(),
          sample: true,
          url: ASSETS + (item.image || "wall-unit-406.jpg"),
          name: "Generated sample image",
        },
      ],
    });
  };
  const submit = () => {
    if (
      act({
        type: "submit",
        draft,
        offline: !online || simulateOffline,
        sample: sampleRun,
      })
    )
      navigate(`/result/${item.id}`);
  };
  return (
    <>
      <Heading
        eyebrow="Mobile · worker / foreman"
        title="Daily update capture"
        sub="Location, guided photos and a short note. Save a draft or submit with clear evidence gaps."
        action={
          <Link className="btn" to="/work">
            Back to work
          </Link>
        }
      />
      <div className="capture-layout">
        <div className="capture-device card">
          <div className="phone-bar">
            <Icon name="camera" />
            <div className="grow">
              <b>
                {draft.step === 1
                  ? "Where and what"
                  : draft.step === 2
                    ? "Photos & note"
                    : "Review your update"}
              </b>
              <p className="xs muted">Step {draft.step} of 3 · local demo</p>
            </div>
            <Chip status={online && !simulateOffline ? "proc" : "review"}>
              {online && !simulateOffline ? "Online" : "Offline simulation"}
            </Chip>
          </div>
          <div className="capture-body stack">
            <div className="steps">
              {[1, 2, 3].map((s) => (
                <span key={s} className={draft.step >= s ? "on" : ""} />
              ))}
            </div>
            {draft.step === 1 ? (
              <>
                <label>
                  Location and work item
                  <select
                    value={draft.item}
                    onChange={(e) => {
                      update({
                        item: e.target.value,
                        photos: [],
                        claim: "",
                        note: "",
                      });
                      setSampleRun(false);
                    }}
                  >
                    {state.items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {locationLabel(i)} · {i.title}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="inset stack">
                  <div className="row">
                    <Icon name="pin" />
                    <b>{locationLabel(item)}</b>
                  </div>
                  <p className="small muted">
                    Location confirmed by your selection. No QR scan is
                    simulated.
                  </p>
                  <Link to={`/building?work=${item.id}`}>
                    Confirm location in the project model →
                  </Link>
                  <small>
                    Component {item.location?.elements[0]} · baseline{" "}
                    {item.location?.version.slice(0, 7)}
                  </small>
                </div>
                <Card title="What the plan shows">
                  <div className="card-pad stack">
                    <b>{item.reference}</b>
                    <p className="small">{item.scope}</p>
                    <p className="xs muted">
                      Capture context and close-ups of the linked component.
                      Photos are not registered to the model, and exact
                      measurements are not inferred.
                    </p>
                  </div>
                </Card>
                <div className="inset">
                  <p className="small">
                    <b>Assigned to</b>
                    <br />
                    {item.owner}
                  </p>
                </div>
              </>
            ) : draft.step === 2 ? (
              <>
                <div className="inset stack">
                  <b>Needed for this check</b>
                  <div className="row small">
                    <Icon name="camera" />
                    <span>
                      Full context view of the work and its surrounding area
                    </span>
                  </div>
                  <div className="row small">
                    <Icon name="eye" />
                    <span>
                      {item.id === "ELEC-406"
                        ? "Full context of the linked receptacle and its mounting surface"
                        : "Close-up of the condition being reported"}
                    </span>
                  </div>
                  <p className="xs muted">
                    Unseen areas remain unknown. You can submit partial
                    coverage.
                  </p>
                </div>
                <div className="shot-grid">
                  {draft.photos.map((p) => (
                    <div className="shot" key={p.id}>
                      <img src={p.url} alt={p.name} />
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() =>
                          update({
                            photos: draft.photos.filter((v) => v.id !== p.id),
                          })
                        }
                      >
                        <Icon name="close" size={15} />
                      </button>
                      <span>{p.sample ? "Sample" : "Uploaded"}</span>
                    </div>
                  ))}
                </div>
                <input
                  type="file"
                  ref={input}
                  accept="image/*"
                  multiple
                  capture="environment"
                  aria-label="Attach photos"
                  onChange={(e) => void addPhotos(e.target.files)}
                  className="capture-file"
                />
                <div className="row">
                  <Button
                    icon="camera"
                    kind="primary"
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    {busy ? "Preparing photos…" : "Take / choose photos"}
                  </Button>
                  <Button disabled={busy} onClick={addSample}>
                    Use sample image
                  </Button>
                </div>
                <label>
                  Note
                  <textarea
                    rows={3}
                    value={draft.note}
                    onChange={(e) => update({ note: e.target.value })}
                    placeholder="What was done? What remains? Any concerns?"
                  />
                </label>
                <label>
                  Your status (optional)
                  <select
                    value={draft.claim}
                    onChange={(e) => update({ claim: e.target.value })}
                  >
                    <option value="">Not specified</option>
                    <option>Started</option>
                    <option>Partial</option>
                    <option>Done</option>
                  </select>
                </label>
                <p className="xs muted">
                  Your claim is stored separately. It cannot complete work by
                  itself.
                </p>
              </>
            ) : (
              <>
                <div className="inset stack">
                  <b>
                    {locationLabel(item)} · {item.title}
                  </b>
                  <p className="small">
                    {draft.photos.length} photos ·{" "}
                    {draft.claim
                      ? `You said: ${draft.claim}`
                      : "No completion claim"}
                  </p>
                  <p className="small muted">
                    {draft.note || "No note added."}
                  </p>
                  <b className="small">Reference: {item.reference}</b>
                </div>
                <div className="shot-grid">
                  {draft.photos.map((p) => (
                    <div key={p.id} className="shot">
                      <img src={p.url} alt={p.name} />
                    </div>
                  ))}
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={sampleRun}
                    disabled={
                      !draft.photos.length ||
                      draft.photos.some((p) => !p.sample)
                    }
                    onChange={(e) => setSampleRun(e.target.checked)}
                  />
                  Run the labeled sample check
                </label>
                <p className="xs muted">
                  Sample images can demonstrate a fixture outcome. Your uploaded
                  photos are saved locally and await human review; no live AI
                  runs here.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={simulateOffline}
                    onChange={(e) => setSimulateOffline(e.target.checked)}
                  />
                  Simulate an offline submission
                </label>
              </>
            )}
            {error && (
              <p className="red-text small" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="phone-foot">
            <div className="row">
              {draft.step > 1 && (
                <Button onClick={() => update({ step: draft.step - 1 })}>
                  Back
                </Button>
              )}
              {draft.step < 3 ? (
                <Button
                  kind="primary lg grow"
                  disabled={busy || (draft.step === 2 && !draft.photos.length)}
                  onClick={() => update({ step: draft.step + 1 })}
                >
                  {draft.step === 1 ? "Next: photos" : "Review update"}
                  <Icon name="arrow" size={16} />
                </Button>
              ) : (
                <Button
                  kind="primary lg grow"
                  disabled={busy || !draft.photos.length}
                  onClick={submit}
                >
                  Submit update
                  <Icon name="arrow" size={16} />
                </Button>
              )}
            </div>
            <p className="xs muted">
              Drafts save on this device. Nothing is received or checked until
              submission.
            </p>
          </div>
        </div>
        <aside className="stack-lg capture-aside">
          <Card title="My updates">
            <div className="card-pad stack">
              {state.items
                .filter((i) => i.update || i.processing === "queued")
                .slice(0, 8)
                .map((i) => (
                  <Link
                    key={i.id}
                    className="inset row between"
                    to={`/result/${i.id}`}
                  >
                    <span className="small">
                      <b>{locationLabel(i)}</b>
                      <br />
                      {i.update}
                    </span>
                    <Chip
                      status={i.processing === "queued" ? "proc" : i.status}
                    >
                      {i.processing === "queued"
                        ? "On this phone · queued"
                        : undefined}
                    </Chip>
                  </Link>
                ))}
              {state.items.some((i) => i.processing === "queued") && (
                <Button
                  kind="primary"
                  disabled={!online}
                  onClick={() => {
                    act({ type: "sync" });
                    setSimulateOffline(false);
                  }}
                >
                  Sync queued updates to demo review
                </Button>
              )}
            </div>
          </Card>
          <Card title="Capture first">
            <div className="card-pad stack">
              <p className="small muted">
                No 3D navigation is required. Choose the correct work item and
                capture the relevant views.
              </p>
              <p className="xs muted">
                This local demo has no server upload. The connected field app
                has the existing backend and offline upload queue.
              </p>
              <Link className="btn" to="/field">
                Open connected field app
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}
export function Result() {
  const { id } = useParams(),
    { state, online, act } = useWorkspace(),
    item = state.items.find((i) => i.id === id);
  if (!item)
    return (
      <Heading
        eyebrow="Submission"
        title="Update not found"
        action={<Link to="/capture">New update</Link>}
      />
    );
  const queued = item.processing === "queued";
  const title = queued
    ? "Saved on this device"
    : item.status === "evidence"
      ? "One more view needed"
      : item.status === "ai"
        ? "AI-checked complete"
        : item.status === "issue"
          ? "Correction submitted for review"
          : item.status === "failed"
            ? "Analysis could not finish"
            : "Your update is in review";
  return (
    <>
      <Heading
        eyebrow={`Submission result · ${item.update || item.id}`}
        title={title}
        sub={`${locationLabel(item)} · ${item.title}`}
        action={
          <Link className="btn" to={`/capture?item=${item.id}`}>
            Add another photo
          </Link>
        }
      />
      <div className="grid g-3-2">
        <div className="stack-lg">
          <Card title="What changed">
            <div className="card-pad stack">
              <Chip status={queued ? "proc" : item.status}>
                {queued ? "Queued · not received" : undefined}
              </Chip>
              <p>
                {queued
                  ? "The update exists only on this device. It has not been received by a server or checked."
                  : item.detail || `Progress: ${item.progress}`}
              </p>
              {item.claimed && (
                <span className="chip tag">Worker claim: {item.claimed}</span>
              )}
              <p className="small muted">
                {item.status === "ai"
                  ? `Supported scope: ${item.scope}. Human acceptance and inspection remain separate.`
                  : "The completion claim does not override missing evidence or an open issue."}
              </p>
              {queued && (
                <Button
                  disabled={!online}
                  kind="primary"
                  onClick={() => act({ type: "sync" })}
                >
                  Move queued update to local demo review
                </Button>
              )}
              <Link
                className="btn"
                to={
                  item.issue
                    ? `/issue/${item.id}`
                    : `/review/${item.id}`
                }
              >
                Open full record <Icon name="arrow" size={15} />
              </Link>
            </div>
          </Card>
          {!queued && <CheckTable item={item} />}
        </div>
        <aside className="stack-lg">
          <Card title="Not covered by this result">
            <div className="card-pad stack">
              <p className="small">{item.limits}</p>
              <Chip
                status={item.inspection === "Not recorded" ? "none" : "inspect"}
              >
                {item.inspection}
              </Chip>
              <p className="xs muted">
                Formal inspection is never inferred from a progress result.
              </p>
            </div>
          </Card>
          <Card title="Your evidence">
            <div className="card-pad shot-grid">
              {item.photos.slice(-6).map((p) => (
                <div className="shot" key={p.id}>
                  <img src={p.url} alt={p.name} />
                  <span>{p.sample ? "Sample" : "Uploaded"}</span>
                </div>
              ))}
            </div>
          </Card>
          <Link className="btn" to={`/building?work=${item.id}`}>
            See work in 3D <Icon name="cube" size={16} />
          </Link>
        </aside>
      </div>
    </>
  );
}
