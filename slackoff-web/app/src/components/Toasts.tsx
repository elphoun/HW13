import { useApp } from '../state/AppState';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <button key={t.id} className="toast" onClick={() => dismissToast(t.id)}>
          <span className="toast-emoji">{t.emoji}</span>
          <span><b>{t.title}</b>{t.body && <small>{t.body}</small>}</span>
        </button>
      ))}
    </div>
  );
}
