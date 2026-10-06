import { useSearchParams } from "react-router-dom";
import SimpleBuilding from "./SimpleBuilding";
import { useWorkspace } from "./context";
export default function Building() {
  const { model, state } = useWorkspace();
  const [params, setParams] = useSearchParams();
  return (
    <SimpleBuilding
      data={model}
      items={state.items}
      selectedWork={params.get("work")}
      onSelectWork={(id) =>
        setParams(id ? { work: id } : {}, { replace: true })
      }
    />
  );
}
