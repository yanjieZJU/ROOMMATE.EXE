import type { MacroAction, MemoryFact, RoommateSession } from "../../shared/roommate-schemas";

export interface ArchivedDecision {
  id: string;
  decidedAt: string;
  publicEvent: string | null;
  facts: MemoryFact[];
  candidates: MacroAction[];
  selectedActionId: string;
  probabilities: Record<string, number>;
  confidence: number | null;
  consequences: string[];
  laterReferences: string[];
}

export function selectKeyDecisions(session: RoommateSession, limit = 6): ArchivedDecision[] {
  const important = session.decisions
    .filter((decision) => decision.snapshot.kind === "lease" || decision.snapshot.publicEvent !== null)
    .sort((left, right) => left.decidedAt.localeCompare(right.decidedAt))
    .slice(-limit);
  return important.map((decision) => {
    const selected = decision.snapshot.candidates.find((candidate) => candidate.id === decision.selectedActionId)!;
    const causedFactIds = new Set(session.world.facts.filter((fact) => fact.sourceActionId === decision.selectedActionId).map((fact) => fact.id));
    const laterReferences = session.decisions
      .filter((later) => later.decidedAt > decision.decidedAt && later.snapshot.relevantFacts.some((fact) => causedFactIds.has(fact.id)))
      .map((later) => later.id);
    return {
      id: decision.id,
      decidedAt: decision.decidedAt,
      publicEvent: decision.snapshot.publicEvent,
      facts: structuredClone(decision.snapshot.relevantFacts),
      candidates: structuredClone(decision.snapshot.candidates),
      selectedActionId: decision.selectedActionId,
      probabilities: structuredClone(decision.probabilities),
      confidence: decision.confidence,
      consequences: [...selected.factTemplates],
      laterReferences,
    };
  });
}
