export function PauseOverlay({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <section className="pause-overlay" role="alert">
      <strong>ROOMMATE.EXE 暂停</strong>
      <p>{message}</p>
      <button className="primary" onClick={onRetry}>重试连接 Jev</button>
    </section>
  );
}
