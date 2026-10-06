import { useEffect, useRef, useState } from "react";
import { api, tokenStore, type Tokens } from "../api/client";
import type { Job, ModelVersion, Project, User } from "../api/types";

/** Real server onboarding, kept inside the same building workspace. Public samples need no account. */
export default function ProjectImportPanel({
  projectId,
  versionId,
  onOpen,
  onPublic,
}: {
  projectId?: string;
  versionId?: string;
  onOpen: (id: string, version?: string) => void;
  onPublic: () => void;
}) {
  const [session, setSession] = useState(() => !!tokenStore.get());
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [register, setRegister] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [reviewedVersion, setReviewedVersion] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(() =>
    projectId && tokenStore.get()
      ? localStorage.getItem(`ew-import-job:${projectId}`)
      : null,
  );
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(
    () =>
      tokenStore.subscribe((t) => {
        setSession(!!t);
        if (!t) {
          setUser(null);
          setProjects([]);
          setVersions([]);
        }
      }),
    [],
  );
  useEffect(() => {
    if (!session) return;
    let active = true;
    Promise.all([api<User>("/auth/me"), api<Project[]>("/projects")])
      .then(([u, p]) => {
        if (active) {
          setUser(u);
          setProjects(p);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session]);
  useEffect(() => {
    if (!session || !projectId) return;
    let active = true;
    api<ModelVersion[]>(`/projects/${projectId}/models`)
      .then((v) => {
        if (active) setVersions(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [session, projectId, versionId]);
  // Leaving the panel stops polling, not the server job; its ID can be resumed on return.
  useEffect(() => {
    if (!jobId || !projectId || !session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const job = await api<Job>(`/jobs/${jobId}`);
        if (!active) return;
        if (job.status === "failed")
          throw Error(job.error?.split("\n")[0] || "Model conversion failed.");
        if (job.status === "done") {
          const version = job.result?.version_id;
          if (typeof version !== "string")
            throw Error("Import finished without a model revision.");
          localStorage.removeItem(`ew-import-job:${projectId}`);
          setJobId(null);
          setBusy("");
          onOpen(projectId, version);
          return;
        }
        setBusy(
          job.status === "queued"
            ? "Model queued for conversion…"
            : "Converting geometry and extracting rooms…",
        );
        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (active) {
          setError((e as Error).message);
          setBusy("");
          setJobId(null);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [jobId, projectId, session, onOpen]);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy("");
    }
  };
  const current = projects.find((p) => p.id === projectId);
  const version =
    versions.find((v) => v.id === versionId) ||
    versions.find((v) => v.is_current);
  const editable = current && ["owner", "pm"].includes(current.my_role);
  return (
    <>
      <div className="world-panel-intro">
        <span className="world-eyebrow">PROJECT & MODEL SETUP</span>
        <h2>Your building, from its source.</h2>
        <p>
          Create a project, upload IFC, inspect the draft in this canvas and
          explicitly approve the reference.
        </p>
      </div>
      {!session ? (
        <>
          <p className="world-muted">
            Public samples stay open without sign-in. A private project needs an
            account so its model files remain scoped to your team.
          </p>
          <form
            className="world-update-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run("Connecting…", async () => {
                const tokens = await api<Tokens>(
                  register ? "/auth/register" : "/auth/login",
                  {
                    method: "POST",
                    json: { email, password, ...(register ? { name } : {}) },
                  },
                );
                tokenStore.set(tokens);
                setPassword("");
              });
            }}
          >
            {register && (
              <label>
                Your name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? "new-password" : "current-password"}
              />
            </label>
            <button className="world-primary" disabled={!!busy}>
              {register ? "Create account" : "Connect account"}
            </button>
            <button
              type="button"
              className="world-text-action"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Use an existing account"
                : "Create an account instead"}
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="world-section-heading">
            <span>{user?.name || "Connected account"}</span>
            <button
              disabled={!!busy || !!jobId}
              onClick={() =>
                void run("Disconnecting…", async () => {
                  const token = tokenStore.get();
                  try {
                    if (token)
                      await api("/auth/logout", {
                        method: "POST",
                        json: { refresh_token: token.refresh_token },
                      });
                  } finally {
                    tokenStore.set(null);
                    onPublic();
                  }
                })
              }
            >
              Disconnect
            </button>
          </div>
          <label className="world-import-select">
            Your projects
            <select
              aria-label="Connected project"
              value={projectId || ""}
              disabled={!!busy || !!jobId}
              onChange={(e) => e.target.value && onOpen(e.target.value)}
            >
              <option value="">Choose a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <details className="world-source-details" open={!projectId}>
            <summary>Create a project</summary>
            <form
              className="world-update-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run("Creating project…", async () => {
                  const p = await api<Project>("/projects", {
                    method: "POST",
                    json: {
                      name: projectName.trim(),
                      address: address.trim() || null,
                    },
                  });
                  onOpen(p.id);
                });
              }}
            >
              <label>
                Project name
                <input
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>
              <label>
                Site address (optional)
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <button
                className="world-primary"
                disabled={!!busy || !projectName.trim()}
              >
                Create project
              </button>
            </form>
          </details>
          {projectId && (
            <>
              <h3>{current?.name || "Selected project"}</h3>
              {editable && (
                <form
                  className="world-update-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("Uploading IFC…", async () => {
                      if (
                        !files.length ||
                        files.some(
                          (f) =>
                            !f.name.toLowerCase().endsWith(".ifc") ||
                            f.size > 300 * 1024 * 1024,
                        )
                      )
                        throw Error("Choose IFC files, up to 300 MB each.");
                      const body = new FormData();
                      files.forEach((f) => body.append("files", f));
                      body.append("message", message);
                      const job = await api<Job>(
                        `/projects/${projectId}/models/import`,
                        { method: "POST", body },
                      );
                      localStorage.setItem(
                        `ew-import-job:${projectId}`,
                        job.id,
                      );
                      setJobId(job.id);
                    });
                  }}
                >
                  <label>
                    IFC model files
                    <input
                      type="file"
                      accept=".ifc"
                      multiple
                      disabled={!!busy || !!jobId}
                      onChange={(e) =>
                        setFiles(Array.from(e.target.files || []))
                      }
                    />
                  </label>
                  <label>
                    Revision note
                    <input
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Issued for construction — revision B"
                    />
                  </label>
                  <p className="world-muted">
                    IFC only for now. New geometry remains a draft; the approved
                    reference stays active until approval.
                  </p>
                  <button
                    className="world-primary"
                    disabled={!files.length || !!busy || !!jobId}
                  >
                    Upload as draft
                  </button>
                </form>
              )}
              <section className="world-detail-section">
                <h3>Model revisions</h3>
                {!versions.length && <p>No model yet. Upload IFC to begin.</p>}
                {versions.map((v) => (
                  <button
                    className="world-location-row"
                    key={v.id}
                    disabled={!!busy || !!jobId}
                    onClick={() => onOpen(projectId, v.id)}
                    aria-pressed={version?.id === v.id}
                  >
                    <span>
                      <strong>
                        Revision {v.number} · {v.status}
                        {v.is_current ? " · current reference" : ""}
                      </strong>
                      <small>{v.message}</small>
                    </span>
                  </button>
                ))}
              </section>
              {version?.status === "draft" && editable && (
                <form
                  className="world-update-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("Approving reference…", async () => {
                      await api(`/models/${version.id}/approve`, {
                        method: "POST",
                        json: {
                          message:
                            "Source structure and geometry reviewed in building workspace",
                        },
                      });
                      onOpen(projectId);
                    });
                  }}
                >
                  <h3>Review before approval</h3>
                  <p>
                    Inspect levels, room boundaries, systems and scale in 3D and
                    2D. Unassigned components remain unassigned; room codes
                    alone do not establish units.
                  </p>
                  <label className="world-checkbox">
                    <input
                      type="checkbox"
                      checked={reviewedVersion === version.id}
                      onChange={(e) =>
                        setReviewedVersion(e.target.checked ? version.id : null)
                      }
                    />
                    I reviewed this source structure and geometry.
                  </label>
                  <button
                    className="world-primary"
                    disabled={reviewedVersion !== version.id || !!busy}
                  >
                    Approve as project reference
                  </button>
                </form>
              )}
              <p className="world-muted">
                This connects server model onboarding. Field work records,
                capture and decisions for private projects are not connected
                yet.
              </p>
            </>
          )}
        </>
      )}
      {(busy || jobId) && (
        <p role="status">{busy || "Checking model conversion…"}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
