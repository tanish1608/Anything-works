import { useMemo } from "react";
import { Link } from "react-router-dom";
import ProjectScene from "../viewer/ProjectScene";
import { visibleIds } from "../viewer/filters";
import { useWorkspace } from "./context";
import { projectModel } from "./modelProjection";
import { locationLabel } from "./projectState";
import type { WorkItem } from "./state";

/** Compact presentation of the project's shared model. No page-specific geometry or room aliases. */
export default function WorkflowModel({
  items,
  selected,
  onSelect,
  historical = false,
  focusToken = 0,
}: {
  items: WorkItem[];
  selected: string | null;
  onSelect: (id: string) => void;
  historical?: boolean;
  focusToken?: number;
}) {
  const { model } = useWorkspace();
  const projection = useMemo(
    () => projectModel(model, items, selected),
    [model, items, selected],
  );
  const active = projection.linked.find((i) => i.id === selected);
  const focus = useMemo(
    () =>
      active
        ? { element: active.location!.elements[0], token: focusToken }
        : null,
    [active, focusToken],
  );
  const visible = useMemo(
    () =>
      visibleIds(model.elements, {
        disciplines: new Set(model.layers.map((l) => l.discipline)),
        levelId: null,
        zoneId: null,
        interior: true,
        hideRoof: true,
        revealed: focus?.element,
      }),
    [model, focus?.element],
  );
  return (
    <section
      className="home-model"
      aria-label={historical ? "Historical progress model" : "Project model"}
    >
      <div className="home-model-host">
        <ProjectScene
          data={model}
          visible={visible}
          colors={projection.colors}
          markers={projection.markers}
          focus={focus}
          expanded={!!focus}
          onMarker={onSelect}
          onSelect={(id) => {
            const work = projection.linked.find((i) =>
              i.location!.elements.includes(id || ""),
            );
            if (work) onSelect(work.id);
          }}
        />
      </div>
      <div className="home-model-top">
        <span>{active ? locationLabel(active) : "Entire building"}</span>
        <Link to={`/demo/building${active ? `?work=${active.id}` : ""}`}>
          Open model ↗
        </Link>
      </div>
      <div className="home-model-bottom">
        <span>
          {historical ? "Recorded progress" : "Project model"} ·{" "}
          <a
            href={`https://github.com/${model.source.repository}/tree/${model.source.revision}`}
            title={model.source.attribution}
            target="_blank"
            rel="noreferrer"
          >
            Source · {model.source.license}
          </a>
        </span>
        <button onClick={() => onSelect("")} aria-label="Fit project model">
          Entire building
        </button>
      </div>
    </section>
  );
}
