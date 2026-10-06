import { BrandMark } from "../branding/BrandMark";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, tokenStore } from "../api/client";
import type { Project } from "../api/types";
import { Icon } from "../studio/Icon";
import ProjectScene from "../viewer/ProjectScene";
import {
  loadAuthorizedLayer,
  loadAuthorizedModel,
} from "../viewer/authorizedModel";
import {
  loadPublicProject,
  type ModelDataset,
  type PublicProjectId,
} from "../viewer/modelData";
import { DISCIPLINE_COLORS } from "../viewer/colors";
import { exteriorWall, roofElement } from "../viewer/envelope";
import {
  PUBLIC_PROPERTIES,
  projectUrl,
  safeReturnUrl,
  propertyFacts,
  type PropertyChoice,
} from "./propertyCatalog";
import "./showroom.css";

export default function ProjectShowroom({ current }: { current: string }) {
  const location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const selectedId = params.get("preview") || current;
  const returnTo = safeReturnUrl(params.get("returnTo"), current);
  const [session, setSession] = useState(0);
  const [catalog, setCatalog] = useState<{
    session: number;
    projects: PropertyChoice[];
    error?: string;
  } | null>(null);
  const [loaded, setLoaded] = useState<{
    key: string;
    model: ModelDataset;
  } | null>(null);
  const [failure, setFailure] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [rotating, setRotating] = useState(
    () => !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  const [visibleTab, setVisibleTab] = useState(
    document.visibilityState === "visible",
  );
  useEffect(() => tokenStore.subscribe(() => setSession((n) => n + 1)), []);
  useEffect(() => {
    const update = () => setVisibleTab(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const reduce = () => {
      if (motion?.matches) setRotating(false);
    };
    motion?.addEventListener("change", reduce);
    return () => {
      document.removeEventListener("visibilitychange", update);
      motion?.removeEventListener("change", reduce);
    };
  }, []);
  useEffect(() => {
    if (!tokenStore.get()) return;
    let alive = true;
    api<Project[]>("/projects")
      .then((projects) => {
        if (alive)
          setCatalog({
            session,
            projects: projects.map((p) => ({
              id: `api:${p.id}`,
              name: p.name,
              address: p.address,
              private: true,
              description:
                "Your team's project. Preview the approved source model, then open its building workspace.",
            })),
          });
      })
      .catch((e) => {
        if (alive) setCatalog({ session, projects: [], error: e.message });
      });
    return () => {
      alive = false;
    };
  }, [session]);
  const properties = useMemo(
    () => [
      ...PUBLIC_PROPERTIES,
      ...(tokenStore.get() && catalog?.session === session
        ? catalog.projects
        : []),
    ],
    [catalog, session],
  );
  const selected = properties.find((p) => p.id === selectedId);
  const selectedIndex = Math.max(
    0,
    properties.findIndex((p) => p.id === selectedId),
  );
  const pageStart = Math.floor(selectedIndex / 4) * 4;
  const page = properties.slice(pageStart, pageStart + 4);
  const key = `${selectedId}:${selected?.private ? session : "public"}:${retry}`;
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const request = selected.private
      ? loadAuthorizedModel(selected.id.slice(4), null, true).then(
          (r) => r.model,
        )
      : loadPublicProject(selected.id as PublicProjectId);
    request
      .then((model) => {
        if (alive) setLoaded({ key, model });
      })
      .catch((e) => {
        if (alive) setFailure({ key, message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [key, selected]);
  const model = loaded?.key === key ? loaded.model : null;
  const error = failure?.key === key ? failure.message : "";
  const facts = model ? propertyFacts(model) : null;
  const shown = useMemo(
    () =>
      new Set(
        model?.elements
          .filter((e) => exteriorWall(e) !== true && !roofElement(e))
          .map((e) => e.id) || [],
      ),
    [model],
  );
  const colors = useMemo(
    () =>
      new Map(
        model?.elements.map((e) => [
          e.id,
          e.discipline === "architecture"
            ? "#c6d4e1"
            : e.discipline === "structure"
              ? "#9cb3c8"
              : DISCIPLINE_COLORS[e.discipline] || "#8699ac",
        ]) || [],
      ),
    [model],
  );
  const choose = (id: string) => {
    setRotating(
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    );
    const next = new URLSearchParams(location.search);
    next.set("preview", id);
    navigate(`/?${next}`, { replace: true });
  };
  const step = (delta: number) => {
    const index = properties.findIndex((p) => p.id === selectedId);
    choose(
      properties[
        (Math.max(0, index) + delta + properties.length) % properties.length
      ].id,
    );
  };
  const open = () => {
    if (!model || !selected) return;
    const next = new URLSearchParams(
      new URL(projectUrl(selected.id), "https://workspace.invalid").search,
    );
    if (selected.private && !model.layers.length) next.set("panel", "import");
    navigate(next.size ? `/?${next}` : "/");
  };
  return (
    <main
      className="project-showroom"
      aria-label="Choose building project"
      onKeyDown={(e) => {
        if (
          ["INPUT", "TEXTAREA", "SELECT"].includes(
            (e.target as HTMLElement).tagName,
          )
        )
          return;
        if (e.key === "Escape") {
          e.preventDefault();
          navigate(returnTo);
        }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          step(e.key === "ArrowRight" ? 1 : -1);
        }
      }}
    >
      <header className="showroom-header">
        <a
          className="showroom-brand"
          href={returnTo}
          onClick={(e) => {
            e.preventDefault();
            navigate(returnTo);
          }}
        >
          <BrandMark size={30} />
          Placeholder <span>AI</span>
        </a>
        <div className="showroom-header-actions">
          <button onClick={() => navigate("/?panel=import")}>
            <Icon name="plus" size={16} /> Add project
          </button>
          <button onClick={() => navigate(returnTo)}>
            <Icon name="close" size={17} /> Back to building
          </button>
        </div>
      </header>
      <div className="showroom-hero">
        <section
          className="showroom-model"
          aria-label="Property model preview"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              setRotating((v) => !v);
            }
          }}
        >
          <div className="showroom-stage-label">
            <span>
              {String(
                Math.max(
                  0,
                  properties.findIndex((p) => p.id === selectedId),
                ) + 1,
              ).padStart(2, "0")}
            </span>
            <small>BUILDING PREVIEW</small>
          </div>
          {model?.layers.length ? (
            <ProjectScene
              key={`${selectedId}:${model.version}`}
              data={model}
              visible={shown}
              colors={colors}
              markers={NO_MARKERS}
              direction="overview"
              background="#101b2a"
              orbitFit
              autoRotate={rotating && visibleTab}
              onInteraction={() => setRotating(false)}
              loader={selected?.private ? loadAuthorizedLayer : undefined}
            />
          ) : (
            <div
              className="showroom-model-status"
              role={error ? "alert" : "status"}
            >
              <Icon name="building" size={44} />
              <p>
                {error
                  ? "This model couldn't load."
                  : model
                    ? "Your model starts here."
                    : selected
                      ? "Preparing your building…"
                      : tokenStore.get() && catalog?.session !== session
                        ? "Loading your projects…"
                        : "This project is not available to this account."}
              </p>
              <small>
                {error ||
                  (model
                    ? "Upload and review IFC to give this project its 3D context."
                    : "")}
              </small>
              {error && (
                <button onClick={() => setRetry((n) => n + 1)}>
                  Retry preview
                </button>
              )}
            </div>
          )}
          <small className="showroom-orbit-hint">
            Drag to explore · interaction pauses rotation · Space toggles
            rotation
          </small>
        </section>
        <section
          className="showroom-property"
          aria-label="Property description"
          aria-live="polite"
        >
          <span className="showroom-property-type">
            {selected?.private
              ? "YOUR TEAM'S PROJECT"
              : selected?.category || "PROJECT"}
          </span>
          <h1>{selected?.name || "Project unavailable"}</h1>
          <p>{selected?.description}</p>
          {selected?.address && (
            <p className="showroom-address">
              <Icon name="pin" size={15} />
              {selected.address}
            </p>
          )}
          {facts && (
            <dl className="showroom-facts">
              <div>
                <dt>Source levels</dt>
                <dd>{facts.levels}</dd>
              </div>
              <div>
                <dt>Source spaces</dt>
                <dd>{facts.rooms}</dd>
              </div>
              <div>
                <dt>
                  {selected?.private ? "Visible components" : "Components"}
                </dt>
                <dd>{facts.components.toLocaleString()}</dd>
              </div>
              {facts.units > 0 && (
                <div>
                  <dt>Reviewed units</dt>
                  <dd>{facts.units}</dd>
                </div>
              )}
            </dl>
          )}
          <button className="showroom-open" disabled={!model} onClick={open}>
            {selected?.private && model && !model.layers.length
              ? "Set up building model"
              : "Open project"}
            <Icon name="arrow" size={18} />
          </button>
          <p className="showroom-source-note">
            {selected?.private
              ? "Private source geometry. Access follows your project membership."
              : "Public IFC reference. Field updates and decisions in this sample stay on your device."}
          </p>
          {model && (
            <details className="showroom-source">
              <summary>Model source</summary>
              <p>{model.source.attribution}</p>
              <small>
                {model.source.license} · {model.source.revision.slice(0, 12)}
              </small>
            </details>
          )}
        </section>
      </div>
      <section className="showroom-collection" aria-label="Building collection">
        <div className="showroom-collection-heading">
          <span>
            {properties.length <= 4
              ? `${properties.length} buildings`
              : `${pageStart + 1}–${Math.min(pageStart + 4, properties.length)} of ${properties.length} buildings`}
          </span>
          <div>
            {properties.length > 4 && (
              <>
                <button
                  aria-label="Previous project page"
                  onClick={() =>
                    choose(
                      properties[
                        (pageStart - 4 + Math.ceil(properties.length / 4) * 4) %
                          (Math.ceil(properties.length / 4) * 4)
                      ].id,
                    )
                  }
                >
                  <Icon
                    name="chevron"
                    className="showroom-previous"
                    size={18}
                  />
                </button>
                <button
                  aria-label="Next project page"
                  onClick={() =>
                    choose(
                      properties[
                        pageStart + 4 >= properties.length ? 0 : pageStart + 4
                      ].id,
                    )
                  }
                >
                  <Icon name="chevron" size={18} />
                </button>
              </>
            )}
            <button aria-label="Previous project" onClick={() => step(-1)}>
              <Icon name="chevron" className="showroom-previous" size={18} />
            </button>
            <button aria-label="Next project" onClick={() => step(1)}>
              <Icon name="chevron" size={18} />
            </button>
          </div>
        </div>
        <div className="showroom-project-strip">
          {page.map((p) => (
            <button
              className={`showroom-project-card ${selectedId === p.id ? "selected" : ""}`}
              key={p.id}
              aria-label={`Preview ${p.name}`}
              aria-pressed={selectedId === p.id}
              onClick={() => choose(p.id)}
            >
              <div className="showroom-card-model">
                {p.thumbnail ? (
                  <img src={p.thumbnail} alt="" />
                ) : (
                  <Icon name="building" size={43} />
                )}
              </div>
              <div className="showroom-card-title">
                <strong>{p.name}</strong>
                <small>
                  {selectedId === p.id
                    ? "Selected preview"
                    : p.private
                      ? "Private project"
                      : "Source model"}
                </small>
              </div>
            </button>
          ))}
        </div>
        {catalog?.session === session && catalog.error && (
          <p className="showroom-catalog-error" role="alert">
            Your connected project list couldn't load: {catalog.error}{" "}
            <button onClick={() => setSession((n) => n + 1)}>
              Retry project list
            </button>
          </p>
        )}
        <p className="showroom-footnote">
          The hero loads real model meshes. Collection silhouettes summarize
          source component bounds; they do not show field completion.
        </p>
      </section>
    </main>
  );
}
const NO_MARKERS: [] = [];
