import { useState } from "react";
import "./people.css";

export interface DirectoryPerson {
  id: string;
  name: string;
  team: string;
  role: string;
  email?: string;
  phone?: string;
  availability?: string;
  reportsTo?: string;
  scope?: string;
}
export default function PeopleDirectory({
  people,
  fixture = false,
  onAvailability,
}: {
  people: DirectoryPerson[];
  fixture?: boolean;
  onAvailability?: (id: string, value: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [team, setTeam] = useState("all"),
    [view, setView] = useState("directory");
  const groups = [...new Set(people.map((p) => p.team))];
  const filtered = people.filter(
    (p) =>
      (team === "all" || p.team === team) &&
      `${p.name} ${p.team} ${p.role} ${p.email || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="people-directory">
      <div className="people-tools">
        <label>
          Find someone
          <input
            aria-label="Find people"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, team or trade"
          />
        </label>
        <label>
          Team
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">All teams</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <div
          className="people-view-switch"
          role="group"
          aria-label="People view"
        >
          <button
            aria-pressed={view === "directory"}
            onClick={() => setView("directory")}
          >
            Directory
          </button>
          <button
            aria-pressed={view === "teams"}
            onClick={() => setView("teams")}
          >
            Teams & hierarchy
          </button>
        </div>
      </div>
      {fixture && (
        <p className="people-source">
          Fictional team and contact details. Availability is a local demo
          setting.
        </p>
      )}
      {view === "teams" && (
        <p className="people-source">
          {fixture
            ? "Sample reporting structure: project manager → trade leads."
            : "Grouped by project role and trade. Reporting lines and crew membership are not recorded yet."}
        </p>
      )}
      <div className={view === "teams" ? "people-teams" : "people-cards"}>
        {(view === "teams"
          ? groups.filter((g) => filtered.some((p) => p.team === g))
          : ["all"]
        ).map((g) => (
          <section key={g} className={view === "teams" ? "people-team" : ""}>
            {view === "teams" && <h2>{g}</h2>}
            <div
              className={
                view === "teams" ? "people-team-members" : "people-cards-inner"
              }
            >
              {filtered
                .filter((p) => g === "all" || p.team === g)
                .map((p) => (
                  <article className="person-card" key={p.id}>
                    <div className="person-header">
                      <span className="person-avatar">
                        {p.name
                          .split(" ")
                          .map((s) => s[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <h3>{p.name}</h3>
                        <p>{p.role}</p>
                      </div>
                    </div>
                    <p className="person-team">{p.team}</p>
                    {p.reportsTo && (
                      <p className="person-detail">Reports to {p.reportsTo}</p>
                    )}
                    {p.scope && <p className="person-detail">{p.scope}</p>}
                    <div className="person-contacts">
                      {p.email ? (
                        <a href={`mailto:${p.email}`}>{p.email}</a>
                      ) : (
                        <span>Email not recorded</span>
                      )}
                      {p.phone && (
                        <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}>
                          {p.phone}
                        </a>
                      )}
                    </div>
                    {onAvailability ? (
                      <label>
                        Availability
                        <select
                          aria-label={`Availability for ${p.name}`}
                          value={p.availability || "Not set"}
                          onChange={(e) => onAvailability(p.id, e.target.value)}
                        >
                          {[
                            "Not set",
                            "On site",
                            "Available remotely",
                            "Away",
                            "Back tomorrow",
                          ].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <p className="person-availability">
                        Availability: {p.availability || "Not recorded"}
                      </p>
                    )}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
      {!filtered.length && <p>No people match your search.</p>}
    </div>
  );
}
