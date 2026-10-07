import { useState } from "react";

import { classifyLeaseEnding, type LeaseChoice } from "../../game/ending/lease-decision";
import type { RoommateSession } from "../../shared/roommate-schemas";
import { DecisionArchive } from "./DecisionArchive";
import { exportRoommateSession } from "../export/roommate-export";

export function LeaseEnding({ session: initialSession, onChoose }: {
  session: RoommateSession;
  onChoose(choice: LeaseChoice): Promise<RoommateSession>;
}) {
  const [session, setSession] = useState(initialSession);
  const [sealed, setSealed] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [error, setError] = useState<string>();

  const choose = async (choice: LeaseChoice) => {
    setSealed(true);
    setError(undefined);
    try { setSession(await onChoose(choice)); }
    catch (caught) { setSealed(false); setError(caught instanceof Error ? caught.message : "续租判断失败"); }
  };

  if (!session.lease.revealed || !session.lease.playerChoice || !session.lease.jevChoice) {
    return (
      <section className="lease-ending">
        <p className="roommate-kicker">DAY 7 / LEASE DECISION</p>
        <h1>你愿意继续合租吗？</h1>
        <p>你的卡片会先被封存。Jev 完成独立判断后，两张卡同时翻开。</p>
        <div className="lease-actions">
          <button disabled={sealed} onClick={() => void choose("renew")}>选择续租</button>
          <button disabled={sealed} onClick={() => void choose("leave")}>选择搬走</button>
        </div>
        {sealed && <p>你的选择已经封存，正在等待 Jev……</p>}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }

  const ending = classifyLeaseEnding(session.lease.playerChoice, session.lease.jevChoice);
  const label = (choice: LeaseChoice) => choice === "renew" ? "续租" : "搬走";
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportRoommateSession(session)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `roommate-exe-${session.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="lease-ending lease-ending--revealed">
      <div className="lease-cards">
        <article><span>你的选择</span><strong>你的选择：{label(session.lease.playerChoice)}</strong></article>
        <article><span>Jev 的选择</span><strong>Jev 的选择：{label(session.lease.jevChoice)}</strong></article>
      </div>
      <p>{ending.copy}</p>
      <button onClick={() => setArchiveOpen((open) => !open)}>查看七日关键决策</button>
      <button onClick={download}>导出本局 JSON</button>
      {archiveOpen && <DecisionArchive session={session} />}
    </section>
  );
}
