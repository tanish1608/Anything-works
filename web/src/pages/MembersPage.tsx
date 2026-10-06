import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import {
  can,
  ROLE_LABEL,
  type Building,
  type Member,
  type Role,
  type Trade,
} from "../api/types";
import { useProject } from "./ProjectLayout";
import PeopleDirectory from "../components/PeopleDirectory";

export default function MembersPage() {
  const { project } = useProject();
  const manage = can.manageMembers(project.my_role);
  const qc = useQueryClient();
  const key = ["members", project.id];
  const {
    data: members,
    error: membersError,
    isPending: membersPending,
  } = useQuery({
    queryKey: key,
    queryFn: () => api<Member[]>(`/projects/${project.id}/members`),
  });
  const { data: trades } = useQuery({
    queryKey: ["trades"],
    queryFn: () => api<Trade[]>("/trades"),
  });
  const { data: tree } = useQuery({
    queryKey: ["tree", project.id],
    queryFn: () => api<Building[]>(`/projects/${project.id}/tree`),
  });
  const zones =
    tree?.flatMap((b) =>
      b.levels.flatMap((l) =>
        l.zones.map((z) => ({
          ...z,
          label: `${b.name} › ${l.name} › ${z.name}`,
        })),
      ),
    ) ?? [];
  const zoneName = (id: string) =>
    zones.find((z) => z.id === id)?.name ?? id.slice(0, 8);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("trade");
  const [selTrades, setSelTrades] = useState<string[]>([]);
  const [selZones, setSelZones] = useState<string[]>([]);
  const [allZones, setAllZones] = useState(true);

  const add = useMutation({
    mutationFn: () =>
      api(`/projects/${project.id}/members`, {
        method: "POST",
        json: {
          email,
          role,
          trades: role === "trade" ? selTrades : [],
          zone_ids: role === "trade" && !allZones ? selZones : null,
        },
      }),
    onSuccess: () => {
      setEmail("");
      setSelTrades([]);
      setSelZones([]);
      qc.invalidateQueries({ queryKey: key });
    },
  });
  const patch = useMutation({
    mutationFn: ({ id, json }: { id: string; json: unknown }) =>
      api(`/projects/${project.id}/members/${id}`, { method: "PATCH", json }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/projects/${project.id}/members/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const err = add.error || patch.error || remove.error;

  const toggle = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate();
  };

  return (
    <div className="page stack">
      <h1>People</h1>
      <p className="muted">Project contacts, teams and access scope.</p>
      {membersError && <p role="alert">{membersError.message}</p>}
      {membersPending && <p>Loading people…</p>}
      <PeopleDirectory
        people={(members || []).map((m) => ({
          id: m.id,
          name: m.user.name,
          email: m.user.email,
          team:
            m.role === "trade"
              ? m.trades.join(" / ") || "Trade team"
              : m.role === "viewer"
                ? "Observers"
                : "Project leadership",
          role: ROLE_LABEL[m.role],
          scope:
            m.role === "trade"
              ? m.zone_ids === null
                ? "All zones"
                : m.zone_ids.map(zoneName).join(", ") || "No zones"
              : "Project-wide access",
        }))}
      />
      {manage && (
        <details className="stack">
          <summary>Manage project access</summary>
          {err && (
            <div className="error" role="alert">
              {(err as Error).message}
            </div>
          )}
          <div className="panel" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Scope</th>
                  {manage && <th />}
                </tr>
              </thead>
              <tbody>
                {members?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.user.name}
                      <div className="muted">{m.user.email}</div>
                    </td>
                    <td>
                      {manage ? (
                        <select
                          aria-label={`Role for ${m.user.name}`}
                          value={m.role}
                          onChange={(e) =>
                            patch.mutate({
                              id: m.id,
                              json: { role: e.target.value },
                            })
                          }
                        >
                          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLE_LABEL[m.role]
                      )}
                    </td>
                    <td>
                      {m.role === "trade" ? (
                        <>
                          <div>
                            {m.trades.length ? (
                              m.trades.join(", ")
                            ) : (
                              <span className="muted">no trades</span>
                            )}
                          </div>
                          <div className="muted">
                            {m.zone_ids === null
                              ? "All zones"
                              : m.zone_ids.map(zoneName).join(", ") ||
                                "No zones"}
                          </div>
                        </>
                      ) : (
                        <span className="muted">Everything</span>
                      )}
                    </td>
                    {manage && (
                      <td>
                        <button
                          className="small danger"
                          onClick={() =>
                            window.confirm(`Remove ${m.user.name}?`) &&
                            remove.mutate(m.id)
                          }
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {manage && (
            <form
              className="panel stack"
              onSubmit={submit}
              style={{ maxWidth: 640 }}
            >
              <h2>Add someone</h2>
              <p className="muted" style={{ margin: 0 }}>
                They need to have signed up first. Email invitations come later.
              </p>
              <div className="row">
                <label className="grow">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {role === "trade" && (
                <>
                  <fieldset
                    className="row"
                    style={{ border: "none", padding: 0 }}
                  >
                    <legend className="muted" style={{ fontSize: 12 }}>
                      Trades
                    </legend>
                    {trades?.map((t) => (
                      <label
                        key={t.code}
                        className="row"
                        style={{ flexDirection: "row", color: "var(--text)" }}
                      >
                        <input
                          type="checkbox"
                          checked={selTrades.includes(t.code)}
                          onChange={() =>
                            toggle(selTrades, t.code, setSelTrades)
                          }
                        />
                        {t.name}
                      </label>
                    ))}
                  </fieldset>
                  <label
                    className="row"
                    style={{ flexDirection: "row", color: "var(--text)" }}
                  >
                    <input
                      type="checkbox"
                      checked={allZones}
                      onChange={(e) => setAllZones(e.target.checked)}
                    />{" "}
                    All zones
                  </label>
                  {!allZones && (
                    <div
                      className="stack"
                      style={{ gap: 4, maxHeight: 200, overflow: "auto" }}
                    >
                      {zones.map((z) => (
                        <label
                          key={z.id}
                          className="row"
                          style={{ flexDirection: "row", color: "var(--text)" }}
                        >
                          <input
                            type="checkbox"
                            checked={selZones.includes(z.id)}
                            onChange={() => toggle(selZones, z.id, setSelZones)}
                          />
                          {z.label}
                        </label>
                      ))}
                      {zones.length === 0 && (
                        <span className="muted">No zones yet.</span>
                      )}
                    </div>
                  )}
                </>
              )}
              <div>
                <button className="primary" disabled={add.isPending}>
                  Add to project
                </button>
              </div>
            </form>
          )}
        </details>
      )}
    </div>
  );
}
