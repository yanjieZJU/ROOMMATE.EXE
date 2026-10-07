import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { RoommateApp } from "./roommate/RoommateApp";
import "./styles/roommate.css";

const root = document.getElementById("root");
if (!root) throw new Error("缺少 ROOMMATE.EXE 根节点");

function Bootstrap() {
  const [dayDurationMs, setDayDurationMs] = useState(90_000);
  useEffect(() => {
    void fetch("/api/health").then((response) => response.json()).then((health: { simulationDayDurationMs?: number }) => {
      if (Number.isInteger(health.simulationDayDurationMs) && (health.simulationDayDurationMs ?? 0) > 0) setDayDurationMs(health.simulationDayDurationMs!);
    }).catch(() => undefined);
  }, []);
  return <RoommateApp dayDurationMs={dayDurationMs} />;
}

createRoot(root).render(<StrictMode><Bootstrap /></StrictMode>);
