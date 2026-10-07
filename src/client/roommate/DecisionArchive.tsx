import { selectKeyDecisions } from "../../game/ending/key-decisions";
import type { RoommateSession } from "../../shared/roommate-schemas";

export function DecisionArchive({ session }: { session: RoommateSession }) {
  const decisions = selectKeyDecisions(session);
  return (
    <section className="decision-archive" aria-label="七日关键决策">
      <h2>七日关键决策</h2>
      {decisions.length === 0 ? <p>这一局没有可展示的关键判断。</p> : decisions.map((decision) => (
        <article key={decision.id}>
          <time>{decision.decidedAt}</time>
          <h3>{decision.publicEvent ?? "日常判断"}</h3>
          <p>{decision.facts.map((fact) => fact.text).join("；") || "当时没有更早的相关事实"}</p>
          <ul>{decision.candidates.map((candidate) => <li key={candidate.id}>{candidate.label}：{Math.round((decision.probabilities[candidate.id] ?? 0) * 100)}%</li>)}</ul>
          <strong>Jev 选择：{decision.candidates.find((candidate) => candidate.id === decision.selectedActionId)?.label}</strong>
          <p>后果：{decision.consequences.join("；")}</p>
          {decision.laterReferences.length > 0 && <small>后来再次影响：{decision.laterReferences.join("、")}</small>}
        </article>
      ))}
    </section>
  );
}
