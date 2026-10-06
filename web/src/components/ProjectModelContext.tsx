import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Issue } from "../api/types";
import ProjectScene, { type SceneFocus } from "../viewer/ProjectScene";
import {
  loadAuthorizedModel,
  loadAuthorizedLayer,
} from "../viewer/authorizedModel";
import { visibleIds, colorMap } from "../viewer/filters";
import type { Timeline } from "../lib/replay";
import { stateAt } from "../lib/replay";
import { ifcPointToViewer } from "../viewer/spatialMath";
import "../workspace/operations.css";

export interface ModelFocus {
  id: string;
  elements: string[];
  zone?: string | null;
  modelVersionId?: string;
}
export default function ProjectModelContext({
  projectId,
  issues,
  selected,
  onSelect,
  focus,
  focusToken = 0,
  history,
  showNavigation = true,
  records,
  onElementSelect,
}: {
  projectId: string;
  issues: Issue[];
  selected: Issue | null;
  onSelect: (id: string) => void;
  focus?: ModelFocus | null;
  focusToken?: number;
  history?: { at: number; timeline: Timeline };
  showNavigation?: boolean;
  records?: { id: string; modelVersionId: string; elementIds: string[] }[];
  onElementSelect?: (elementId: string) => void;
}) {
  const [overviewToken, setOverviewToken] = useState<number | null>(null);
  const overview = overviewToken === focusToken;
  const version = selected?.model_version_id || focus?.modelVersionId || null;
  const q = useQuery({
    queryKey: ["home-model", projectId, version],
    queryFn: () => loadAuthorizedModel(projectId, version),
  });
  const model = q.data?.model;
  const projection = useMemo(() => {
    if (!model) return null;
    const elements = history
      ? stateAt(history.timeline, model.elements, history.at).map((e) => ({
          ...e,
          status: e.status as (typeof model.elements)[number]["status"],
          completion_basis: e.completion_basis,
        }))
      : model.elements;
    const current = issues.filter(
      (i) =>
        i.model_version_id === model.version &&
        (!history || Date.parse(i.created_at) <= history.at),
    );
    const linked =
      selected?.model_version_id === model.version
        ? elements.find((e) => e.id === selected.element_id)
        : null;
    const ids = focus
      ? elements
          .filter(
            (e) =>
              focus.elements.includes(e.id) ||
              (!!focus.zone && e.zone_id === focus.zone),
          )
          .map((e) => e.id)
      : [];
    const camera: SceneFocus | null = overview
      ? null
      : selected &&
          selected.model_version_id === model.version &&
          selected.anchor
        ? {
            element: linked?.id || null,
            point: selected.anchor,
            token: focusToken,
          }
        : linked
          ? { element: linked.id, token: focusToken }
          : ids.length
            ? { element: ids[0], elements: ids, token: focusToken }
            : null;
    const visible = visibleIds(elements, {
      disciplines: new Set(elements.map((e) => e.discipline)),
      levelId: null,
      zoneId: null,
      interior: true,
      hideRoof: true,
      revealed: camera?.element,
    });
    const open = new Set(
      current
        .filter((i) => ["open", "in_progress"].includes(i.status))
        .map((i) => i.element_id),
    );
    const colors = colorMap(
      elements.map((e) => ({
        ...e,
        open_issues: history
          ? e.open_issues
          : open.has(e.id)
            ? Math.max(1, e.open_issues)
            : e.open_issues,
      })),
      true,
    );
    const issueMarkers = current
      .filter((i) => i.anchor && (!i.element_id || visible.has(i.element_id)))
      .map((i) => ({
        id: i.id,
        elementId: i.element_id || undefined,
        position: i.anchor!,
        color: i.id === selected?.id ? "#1b3325" : "#71877d",
      }));
    const markers = records ? records.flatMap(record => {
      if (record.modelVersionId !== model.version) return [];
      const linkedElement = elements.find(element => record.elementIds.includes(element.id) && visible.has(element.id) && element.bbox);
      const box = linkedElement?.bbox;
      if (!linkedElement || !box || box.length !== 6 || !box.every(Number.isFinite)) return [];
      return [{ id: record.id, elementId: linkedElement.id,
        position: ifcPointToViewer([(box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2]),
        color: record.id === focus?.id ? "#1b3325" : "#71877d" }];
    }) : issueMarkers;
    return { colors, visible, markers, camera, current };
  }, [model, history, issues, selected, focus, focusToken, overview, records]);
  const note = selected
    ? projection?.camera
      ? selected.anchor && selected.model_version_id === model?.version
        ? "Issue location"
        : "Linked component · exact issue point not recorded"
      : "This issue has no confirmed location on the displayed model."
    : focus
      ? projection?.camera
        ? "Update location · linked model components"
        : "This update has no confirmed model location."
      : "Entire building · select a pin to separate floors and focus its location.";
  return (
    <section className="home-model" aria-label="Project model">
      <div className="home-model-host">
        {model?.version && projection && (
          <ProjectScene
            data={model}
            visible={projection.visible}
            colors={projection.colors}
            markers={projection.markers}
            focus={projection.camera}
            expanded={!!projection.camera}
            loader={loadAuthorizedLayer}
            onMarker={(id) => {
              setOverviewToken(null);
              onSelect(id);
            }}
            onSelect={(id) => {
              if (id && onElementSelect) {
                setOverviewToken(null);
                onElementSelect(id);
                return;
              }
              const issue = projection.current.find((i) => i.element_id === id);
              if (issue) {
                setOverviewToken(null);
                onSelect(issue.id);
              }
            }}
          />
        )}
      </div>
      <div className="home-model-top">
        <span>
          {q.data?.manifest.version
            ? `Model v${q.data.manifest.version.number}`
            : "Project model"}
        </span>
        {showNavigation && <Link
          to={`/p/${projectId}/model${selected ? `?issue=${selected.id}` : ""}`}
        >
          Open model ↗
        </Link>}
      </div>
      {q.error && (
        <div className="model-fallback" role="alert">
          {q.error.message}
        </div>
      )}
      {q.isPending && (
        <div className="model-fallback">Loading project model…</div>
      )}
      {!q.isPending && !q.error && !model?.version && (
        <div className="model-fallback">
          <p>No approved model yet.</p>
          {showNavigation && <Link to={`/p/${projectId}/setup`}>
            Upload and review your first model →
          </Link>}
        </div>
      )}
      <div className="home-model-bottom">
        <span>{overview ? "Entire building" : note}</span>
        <button
          onClick={() => {
            setOverviewToken(focusToken);
            onSelect("");
          }}
          aria-label="Fit project model"
        >
          Entire building
        </button>
      </div>
    </section>
  );
}
