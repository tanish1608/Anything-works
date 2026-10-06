import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import {
  can,
  type Building,
  type ElementInfo,
  type ModelVersion,
} from "../api/types";
import { ImportPanel } from "./ModelPage";
import { useProject } from "./ProjectLayout";

/** Import → review → activate. Draft geometry never silently becomes the field baseline. */
export default function ProjectSetupPage() {
  const { project } = useProject(),
    qc = useQueryClient();
  const [chosen, setChosen] = useState(""),
    [confirmedVersion, setConfirmedVersion] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const versions = useQuery({
    queryKey: ["versions", project.id],
    queryFn: () => api<ModelVersion[]>(`/projects/${project.id}/models`),
  });
  const version =
    versions.data?.find((v) => v.id === chosen) ||
    versions.data?.find((v) => v.status === "draft") ||
    versions.data?.find((v) => v.is_current);
  const tree = useQuery({
    queryKey: ["tree", project.id],
    queryFn: () => api<Building[]>(`/projects/${project.id}/tree`),
  });
  const elements = useQuery({
    queryKey: ["setup-elements", project.id, version?.id],
    queryFn: () =>
      api<ElementInfo[]>(
        `/projects/${project.id}/elements?version=${version!.id}`,
      ),
    enabled: !!version,
  });
  const confirmed = confirmedVersion === version?.id;
  const editable = can.editStructure(project.my_role);
  const approve = async () => {
    if (!version || !confirmed || !editable) return;
    setBusy(true);
    setError("");
    try {
      await api(`/models/${version.id}/approve`, {
        method: "POST",
        json: {
          message:
            "Model structure and work locations reviewed during project setup.",
        },
      });
      await qc.invalidateQueries();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const es = elements.data || [],
    levels = tree.data?.flatMap((b) => b.levels) || [];
  const unlocated = es.filter((e) => !e.level_id || !e.zone_id).length;
  return (
    <div className="page stack">
      <h1>Set up your project model</h1>
      <section className="panel stack">
        <h2>1. Upload the design</h2>
        <p>
          Import IFC files for architecture, structure and building systems.
          Each import creates a draft revision. Your existing approved model
          remains active while you review it.
        </p>
        {editable ? (
          <ImportPanel
            projectId={project.id}
            onDone={(id) => {
              setChosen(id);
              qc.invalidateQueries({ queryKey: ["versions", project.id] });
              qc.invalidateQueries({ queryKey: ["tree", project.id] });
            }}
          />
        ) : (
          <p>A project manager must upload and approve the model.</p>
        )}
      </section>
      {(versions.error || tree.error || elements.error) && (
        <p role="alert">
          {(versions.error || tree.error || elements.error)?.message}
        </p>
      )}
      <section className="panel stack">
        <h2>2. Review the structure and locations</h2>
        {versions.isPending ? (
          <p>Loading revisions…</p>
        ) : !version ? (
          <p>Upload your first IFC to continue.</p>
        ) : (
          <>
            <label>
              Review revision
              <select
                value={version.id}
                onChange={(e) => setChosen(e.target.value)}
              >
                {versions.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    v{v.number} · {v.status} · {v.message}
                  </option>
                ))}
              </select>
            </label>
            <p>
              {es.length} components ·{" "}
              {new Set(es.map((e) => e.level_id).filter(Boolean)).size} levels ·{" "}
              {new Set(es.map((e) => e.zone_id).filter(Boolean)).size} linked
              spaces.
            </p>
            {unlocated > 0 && (
              <p>
                {unlocated} components have incomplete level or room
                associations. Keep them unassigned until their location is
                confirmed; these counts do not imply capture coverage.
              </p>
            )}
            {levels
              .filter((l) => es.some((e) => e.level_id === l.id))
              .map((l) => (
                <details key={l.id}>
                  <summary>
                    {l.name} · {es.filter((e) => e.level_id === l.id).length}{" "}
                    components
                  </summary>
                  <ul>
                    {l.zones
                      .filter((z) => es.some((e) => e.zone_id === z.id))
                      .map((z) => (
                        <li key={z.id}>
                          {z.name} ·{" "}
                          {es.filter((e) => e.zone_id === z.id).length}{" "}
                          components
                        </li>
                      ))}
                  </ul>
                </details>
              ))}
            <Link to={`/p/${project.id}/model?version=${version.id}`}>
              Inspect draft in 3D and model-derived 2D plans →
            </Link>
            <Link to={`/p/${project.id}/drawings`}>
              Upload and review the approved drawing sheets →
            </Link>
            <p className="muted">
              A model-derived plan is a geometry projection. Approved drawing
              sheets are managed separately.
            </p>
          </>
        )}
      </section>
      <section className="panel stack">
        <h2>3. Activate the reviewed baseline</h2>
        {version?.status === "draft" && editable ? (
          <>
            <label className="row">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) =>
                  setConfirmedVersion(e.target.checked ? version.id : null)
                }
              />
              I reviewed this revision's geometry, levels, spaces and work
              locations.
            </label>
            <button
              className="primary"
              disabled={!confirmed || busy || !elements.data || !es.length}
              onClick={approve}
            >
              {busy ? "Approving…" : "Approve model baseline"}
            </button>
          </>
        ) : (
          <p>
            {version?.is_current
              ? "The approved baseline is active."
              : "Select and review a draft revision before activating it."}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
      <section className="panel stack">
        <h2>4. Start daily updates</h2>
        <p>
          Select a room and the components worked on, attach photos and notes,
          then submit. The update retains its model revision and component IDs.
          Claims await review; acceptance updates progress and all model views.
          The planned AI agent will use this same handoff.
        </p>
        <div className="row">
          <Link to={`/p/${project.id}/people`}>Set up your team →</Link>
          {versions.data?.some((v) => v.is_current) && (
            <>
              <Link to={`/field/${project.id}`}>Open field capture →</Link>
              <Link to={`/p/${project.id}/home`}>Go to Home →</Link>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
