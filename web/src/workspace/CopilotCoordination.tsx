import { useEffect, useState } from "react";
import { useWorkspace } from "./context";
import { availableSlots, parseCalendar, type BusyTime } from "./calendarSnapshot";
import type { CoordinationTask } from "./coordination";

const localTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const displayTime = (value: string) => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function CopilotCoordination({ selectedId, note, close }: { selectedId?: string; note: string; close: () => void }) {
  const { state, act } = useWorkspace();
  const [id, setId] = useState(selectedId || state.items.find(item => !item.dismissed && !["ai", "human"].includes(item.status))?.id || "");
  const work = state.items.find(item => item.id === id);
  const owners = [...new Set(state.items.map(item => item.owner))];
  const [owner, setOwner] = useState(work?.owner || ""), [instruction, setInstruction] = useState(note.trim() || work?.resolution || work?.title || "");
  const [minutes, setMinutes] = useState(60), [prerequisites, setPrerequisites] = useState("");
  const [tomorrow] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(8, 0, 0, 0); return date; });
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const [start, setStart] = useState(localTime(tomorrow)), [end, setEnd] = useState(localTime(new Date(tomorrow.getTime() + 9 * 3600_000)));
  const [coverage, setCoverage] = useState(false), [qualified, setQualified] = useState(false);
  const [slots, setSlots] = useState<BusyTime[]>([]), [slot, setSlot] = useState<BusyTime | null>(null);
  const [proposal, setProposal] = useState<{ task: Omit<CoordinationTask, "createdAt">; expectedOwner: string } | null>(null);
  const [reply, setReply] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const calendar = state.coordination?.calendars.find(value => value.owner === owner);
  const resetProposal = () => { setSlots([]); setSlot(null); setProposal(null); setNotice(""); };
  const attempt = (operation: () => void) => { try { setError(""); operation(); } catch (failure) { setError((failure as Error).message); } };
  const followUps = state.coordination?.followUps.filter(value => value.workId === id) || [];
  return <section className="copilot-coordination" aria-label="Coordinate work">
    <div className="copilot-coordination-title"><strong>Plan & follow up</strong><button type="button" onClick={close}>Back to chat</button></div>
    <small>Local demo · saved on this browser. External messages are not sent.</small>
    <label>Work<select value={id} onChange={event => {
      const selected = state.items.find(item => item.id === event.target.value)!;
      setId(selected.id); setOwner(selected.owner); setInstruction(selected.resolution || selected.title);
      setQualified(false); setCoverage(false); setPrerequisites(""); resetProposal();
    }}>{state.items.filter(item => !item.dismissed && !["ai", "human"].includes(item.status)).map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
    {!work ? <p>Select unresolved work first.</p> : <>
      <p className="copilot-coordination-context">{work.trade} · {work.unit}{work.due ? ` · deadline ${displayTime(work.due)}` : ""}</p>
      <label>Task instruction<textarea rows={2} maxLength={2000} value={instruction} onChange={event => { setInstruction(event.target.value); resetProposal(); }} /></label>
      <label>Responsible person<select value={owner} onChange={event => { setOwner(event.target.value); setQualified(false); setCoverage(false); resetProposal(); }}>
        {owners.map(person => <option key={person} value={person}>{person}{state.items.some(item => item.owner === person && item.trade === work.trade) ? " · recorded in this trade" : ""}</option>)}
      </select></label>
      <label className="copilot-coordination-check"><input type="checkbox" checked={qualified} onChange={event => { setQualified(event.target.checked); setProposal(null); }} />I confirm this person is qualified for this work.</label>
      <div className="copilot-coordination-times"><label>Earliest start<input type="datetime-local" value={start} onChange={event => { setStart(event.target.value); setCoverage(false); resetProposal(); }} /></label>
        <label>Latest end<input type="datetime-local" value={end} onChange={event => { setEnd(event.target.value); setCoverage(false); resetProposal(); }} /></label></div>
      <label>Duration (minutes)<input type="number" min={15} max={480} step={15} value={minutes} onChange={event => { setMinutes(Number(event.target.value)); resetProposal(); }} /></label>
      <label>Prerequisites<textarea rows={2} maxLength={1000} placeholder="Access, material, another trade's confirmation…" value={prerequisites} onChange={event => { setPrerequisites(event.target.value); setProposal(null); }} /></label>
      <details className="copilot-calendar"><summary>{calendar ? `Calendar: ${calendar.filename}` : "Connect calendar export"}</summary>
        <p>Export .ics events for the window above. Only busy times are retained; event titles are discarded. UTC/local, non-recurring exports are supported.</p>
        <label className="copilot-coordination-check"><input type="checkbox" checked={coverage} onChange={event => setCoverage(event.target.checked)} />The export includes all commitments for this person in this window.</label>
        <label>Calendar file<input type="file" accept=".ics,text/calendar" disabled={!coverage} onChange={event => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
          if (file.size > 1_000_000) { setError("Use an export smaller than 1 MB."); return; }
          void file.text().then(text => attempt(() => {
            const imported = { owner, filename: file.name, importedAt: new Date().toISOString(), start: new Date(start).toISOString(), end: new Date(end).toISOString(), busy: parseCalendar(text) };
            if (!act({ type: "calendar-import", calendar: imported, coverageConfirmed: coverage })) throw Error("Calendar could not be saved. Check the workspace notice.");
            resetProposal(); setNotice("Calendar imported. Find a time below.");
          })).catch(() => setError("Could not read this calendar file."));
        }} /></label>
        {calendar && <p>Imported {displayTime(calendar.importedAt)} · {calendar.busy.length} busy events · snapshot, not live sync.</p>}
      </details>
      <button type="button" className="copilot-coordination-primary" onClick={() => attempt(() => {
        const result = availableSlots(calendar, new Date(start).toISOString(), new Date(end).toISOString(), minutes,
          state.coordination?.tasks.filter(task => task.owner === owner && task.workId !== id) || []);
        const fitting = result.filter(value => !work.due || !Number.isFinite(Date.parse(work.due)) || Date.parse(value.end) <= Date.parse(work.due));
        setSlots(fitting); setSlot(fitting[0] || null); setProposal(null);
        if (!fitting.length) throw Error("No slot fits these commitments and the recorded deadline. Change the window or duration.");
      })}>Find a time</button>
      {!!slots.length && <fieldset><legend>Available in confirmed snapshot</legend>{slots.map(value => <label className="copilot-coordination-check" key={value.start}>
        <input type="radio" name="coordination-slot" checked={value.start === slot?.start} onChange={() => { setSlot(value); setProposal(null); }} />{displayTime(value.start)}–{new Date(value.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </label>)}</fieldset>}
      <button type="button" disabled={!slot || !qualified || !instruction.trim()} onClick={() => {
        if (!slot) return;
        setProposal({ expectedOwner: work.owner, task: { id: crypto.randomUUID(), workId: id, owner, ...slot, minutes,
          instruction: instruction.trim(), prerequisites: prerequisites.trim(), reference: work.reference, modelVersion: state.modelVersion || "" } });
      }}>Review assignment</button>
      {proposal && <div className="copilot-coordination-proposal"><strong>Ready for your confirmation</strong><p>{proposal.task.instruction}</p>
        <p>{proposal.task.owner}<br />{displayTime(proposal.task.start)} · {proposal.task.minutes} minutes</p>
        <p>{proposal.task.prerequisites || "No prerequisites recorded. Confirm site access and materials before work."}</p>
        <button type="button" className="copilot-coordination-primary" onClick={() => attempt(() => {
          const followUp = { id: crypto.randomUUID(), due: proposal.task.end,
            message: `${state.projectName} / ${work.id}: ${proposal.task.instruction}. Please confirm progress and share closure evidence. ${proposal.task.prerequisites ? `Prerequisites: ${proposal.task.prerequisites}` : ""}` };
          if (!act({ type: "coordinate", ...proposal, qualificationConfirmed: qualified, followUp })) throw Error("Assignment was not saved. The calendar or work may have changed; check the workspace notice.");
          setProposal(null); setNotice("Assignment saved. In-app follow-up scheduled; completion unchanged.");
        })}>Confirm assignment & follow-up</button>
      </div>}
    </>}
    {!!followUps.length && <section aria-label="In-app follow-ups"><strong>Follow-ups</strong>{followUps.map(value => <article key={value.id}>
      <small>{value.status === "pending" && Date.parse(value.due) <= clock ? "Due now" : value.status} · {displayTime(value.due)}</small><p>{value.message}</p>
      {value.reply && <p>Recorded reply: {value.reply}</p>}
      {["pending", "escalated"].includes(value.status) && <>
        <label>Recipient reply<textarea rows={2} value={reply} maxLength={2000} onChange={event => setReply(event.target.value)} placeholder="Paste or type the actual reply…" /></label>
        <div className="copilot-coordination-buttons"><button type="button" disabled={!reply.trim()} onClick={() => {
          if (act({ type: "followup", id: value.id, status: "replied", reply })) setReply("");
        }}>Record reply</button><button type="button" onClick={() => act({ type: "followup", id: value.id, status: "cancelled", reply: "" })}>Cancel</button>
          {value.status !== "escalated" && <button type="button" onClick={() => act({ type: "followup", id: value.id, status: "escalated", reply: "Manager attention requested" })}>Escalate</button>}</div>
      </>}
    </article>)}</section>}
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
