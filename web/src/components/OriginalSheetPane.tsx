import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Sheet } from "../api/types";

/** Display the authorized original without assuming a scanned PDF is a registered model plan. */
export default function OriginalSheetPane({ sheet }: { sheet: Sheet }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      objectUrl = "";
    api<Blob>(`/sheets/${sheet.id}/file`)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sheet.id]);
  return (
    <div className="model-plan">
      <div className="model-plan-heading">
        <b>{sheet.name} · original file</b>
        <span>
          Uploaded reference. No automatic 3D alignment or construction approval
          is implied.
        </span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !url ? (
        <p>Loading original…</p>
      ) : (
        <>
          {sheet.file_type === "pdf" ? (
            <iframe
              title={`Original plan: ${sheet.name}`}
              src={url}
              style={{ flex: 1, border: 0, minHeight: 400 }}
            />
          ) : (
            <p>
              The original CAD file is available to download. Use the converted
              view for browser navigation.
            </p>
          )}
          <a className="btn" href={url} download={sheet.name}>
            Download original
          </a>
        </>
      )}
    </div>
  );
}
