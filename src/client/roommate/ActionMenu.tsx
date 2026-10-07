import type { MacroAction } from "../../shared/roommate-schemas";

export function ActionMenu({ objectLabel, actions, onChoose, onClose }: {
  objectLabel: string;
  actions: MacroAction[];
  onChoose(action: MacroAction): void;
  onClose(): void;
}) {
  return (
    <section className="action-menu" role="dialog" aria-label={`${objectLabel}的可执行动作`}>
      <header><strong>{objectLabel}</strong><button onClick={onClose} aria-label="关闭动作菜单">×</button></header>
      {actions.length === 0 ? <p>现在没有可执行动作。</p> : (
        <div className="action-menu__list">
          {actions.map((action) => (
            <button key={action.id} autoFocus={action === actions[0]} onClick={() => onChoose(action)}>
              <span>{action.label}</span><small>{action.knownCostText}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
