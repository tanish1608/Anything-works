import { useState } from "react";
import { useWorkspace } from "./context";

export default function CopilotAssignment({ selectedId, close }: { selectedId?: string; close: () => void }) {
  const { state, act } = useWorkspace();
  const eligible = state.items.filter(item => !item.dismissed && !["ai", "human"].includes(item.status));
  const [id, setId] = useState(selectedId || eligible[0]?.id || "");
  const work = eligible.find(item => item.id === id);
  const [owner, setOwner] = useState(work?.owner || "");
  const [instruction, setInstruction] = useState(work?.resolution || work?.title || "");
  const [qualified, setQualified] = useState(false);
  const [proposal, setProposal] = useState<{ owner: string; instruction: string; previousOwner: string; modelVersion: string } | null>(null);
  const [notice, setNotice] = useState("");
  const owners = [...new Set(state.items.map(item => item.owner))];
  return <section className="copilot-coordination" aria-label="Assign responsible trade">
    <div className="copilot-coordination-title"><strong>Assign responsible trade</strong><button type="button" onClick={close}>Back to chat</button></div>
    <small>Local demo · saved in this browser.</small>
    <label>Work<select value={id} onChange={event => {
      const next = eligible.find(item => item.id === event.target.value)!;
      setId(next.id); setOwner(next.owner); setInstruction(next.resolution || next.title);
      setQualified(false); setProposal(null); setNotice("");
    }}>{eligible.map(item => <option key={item.id} value={item.id}>{item.id} · {item.title}</option>)}</select></label>
    {!work ? <p>Select unresolved work first.</p> : <>
      <p className="copilot-coordination-context">{work.trade} · {work.unit}{work.due ? ` · deadline ${work.due}` : " · no deadline recorded"}</p>
      <label>Responsible person<select value={owner} onChange={event => { setOwner(event.target.value); setQualified(false); setProposal(null); setNotice(""); }}>
        {owners.map(person => <option key={person} value={person}>{person}{state.items.some(item => item.owner === person && item.trade === work.trade) ? " · recorded in this trade" : ""}</option>)}
      </select></label>
      <label>Task instruction<textarea rows={2} maxLength={2000} value={instruction} onChange={event => { setInstruction(event.target.value); setProposal(null); setNotice(""); }} /></label>
      <label className="copilot-coordination-check"><input type="checkbox" checked={qualified} onChange={event => { setQualified(event.target.checked); setProposal(null); }} />I confirm this person is qualified for this work.</label>
      <button type="button" disabled={!qualified || !instruction.trim()} onClick={() => setProposal({ owner, instruction: instruction.trim(), previousOwner: work.owner, modelVersion: state.modelVersion || "" })}>Review assignment</button>
      {proposal && <div className="copilot-coordination-proposal"><strong>Ready to assign</strong><p>{proposal.instruction}</p><p>{proposal.owner}</p>
        <button type="button" className="copilot-coordination-primary" onClick={() => {
          const saved = act({ type: "assign", id: work.id, owner: proposal.owner, reason: proposal.instruction,
            expectedOwner: proposal.previousOwner, expectedModelVersion: proposal.modelVersion });
          if (saved) { setProposal(null); setNotice("Responsible trade assigned. Completion unchanged."); }
          else setNotice("Assignment was not saved. Check the workspace notice and review the current work.");
        }}>Confirm assignment</button>
      </div>}
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
