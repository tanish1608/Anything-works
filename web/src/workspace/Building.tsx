import { lazy, Suspense } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import Spatial from "./Spatial";

const BimLabPage = lazy(() => import("../pages/BimLabPage"));

export default function Building() {
  const [params] = useSearchParams();
  // Older work-item links retain their fictional project location.
  const workflow = params.get("view") === "workflow" || params.has("unit");
  return (
    <>
      {workflow && (
        <div className="building-project-tabs" aria-label="Building project">
          <NavLink
            className={!workflow ? "btn primary" : "btn"}
            to="/demo/building"
          >
            Imported duplex · detailed BIM
          </NavLink>
          <NavLink
            className={workflow ? "btn primary" : "btn"}
            to="/demo/building?view=workflow"
          >
            Daily workflow · illustrated building
          </NavLink>
        </div>
      )}
      {workflow ? (
        <Spatial />
      ) : (
        <Suspense fallback={<p>Loading detailed building…</p>}>
          <BimLabPage embedded />
        </Suspense>
      )}
    </>
  );
}
