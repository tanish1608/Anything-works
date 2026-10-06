import { useState } from "react";
import { useWorkspace } from "./context";
import PeopleDirectory, {
  type DirectoryPerson,
} from "../components/PeopleDirectory";
import "./operations.css";

export const PEOPLE_KEY = "ew-demo-people-v1";
function savedAvailability(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PEOPLE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
export default function People() {
  const { state } = useWorkspace();
  const [availability, setAvailability] = useState(savedAvailability),
    [error, setError] = useState("");
  const leads = [...new Set(state.items.map((i) => i.owner))].map(
    (owner, n) => {
      const [team, name] = owner.split(" · ");
      const work = state.items.filter((i) => i.owner === owner);
      return {
        id: owner,
        name: name || owner,
        team,
        role: `${work[0].trade} lead`,
        email: `${(name || owner).toLowerCase().replaceAll(" ", ".")}@example.com`,
        phone: `+1 (202) 555-01${String(n + 1).padStart(2, "0")}`,
        availability: availability[owner] || "Not set",
        reportsTo: "Sarah Jenkins",
        scope: [...new Set(work.map((i) => `Level ${i.level}`))].join(" · "),
      };
    },
  );
  const people: DirectoryPerson[] = [
    {
      id: "pm",
      name: "Sarah Jenkins",
      team: "Project leadership",
      role: "Project manager",
      email: "sarah.jenkins@example.com",
      phone: "+1 (202) 555-0100",
      availability: availability.pm || "Not set",
    },
    ...leads,
  ];
  const update = (id: string, value: string) => {
    const next = { ...availability, [id]: value };
    try {
      localStorage.setItem(PEOPLE_KEY, JSON.stringify(next));
      setAvailability(next);
      setError("");
    } catch {
      setError("Availability could not be saved. Device storage may be full.");
    }
  };
  return (
    <div className="operations-page">
      <div className="operations-heading">
        <div>
          <p className="operations-kicker">{state.projectName}</p>
          <h1>People</h1>
          <p>Know who owns the work and how to reach them.</p>
        </div>
        <span>{people.length} people</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <PeopleDirectory people={people} fixture onAvailability={update} />
    </div>
  );
}
