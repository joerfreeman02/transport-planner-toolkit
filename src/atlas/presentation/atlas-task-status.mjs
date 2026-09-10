const PHASE_LABELS = Object.freeze({
  'finding-stops': 'Finding nearby stops',
  'routing-stops': 'Routing stops',
  'checking-timetables': 'Checking timetables',
  'reconciling-evidence': 'Reconciling timetable evidence',
  'preparing-assessment': 'Preparing assessment',
  complete: 'Complete',
  idle: 'Ready to check nearby bus stops'
});

export function formatAtlasTaskStatus({ phase = 'idle', detail = '', completed = null, total = null, waiting = false } = {}) {
  const label = PHASE_LABELS[phase] || 'Working';
  if (phase === 'idle') return label;
  if (phase === 'complete') return detail ? label + ' — ' + detail : label;
  const hasProgress = Number.isFinite(Number(completed)) && Number.isFinite(Number(total)) && Number(total) > 0;
  const progress = hasProgress ? ' — ' + Number(completed) + ' of ' + Number(total) : '';
  const waitText = waiting ? ' — Waiting briefly for the timetable source request allowance…' : '';
  const detailText = detail && !waiting ? ' — ' + String(detail).trim() : '';
  return label + progress + (waitText || detailText);
}

export function createAtlasTaskStatus({ messageElement, regionElement = null } = {}) {
  let state = Object.freeze({ phase: 'idle', detail: '', completed: null, total: null, waiting: false });
  const render = () => {
    if (messageElement) messageElement.textContent = formatAtlasTaskStatus(state);
    if (regionElement) {
      regionElement.dataset.phase = state.phase;
      regionElement.setAttribute('aria-busy', state.phase !== 'idle' && state.phase !== 'complete' ? 'true' : 'false');
    }
  };
  const update = progress => {
    const next = progress ?? {};
    const phaseChanged = next.phase && next.phase !== state.phase;
    state = Object.freeze({
      ...state,
      ...(phaseChanged ? { detail: '', completed: null, total: null, waiting: false } : {}),
      ...next
    });
    render();
    return state;
  };
  const reset = () => update({ phase: 'idle', detail: '', completed: null, total: null, waiting: false });
  render();
  return Object.freeze({ update, reset, getState: () => state });
}

export { PHASE_LABELS };
