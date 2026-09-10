const PHASE_LABELS = Object.freeze({
  'finding-stops': 'Finding nearby stops',
  'routing-stops': 'Routing stops',
  'checking-timetables': 'Checking timetables',
  'reconciling-evidence': 'Reconciling timetable evidence',
  'preparing-assessment': 'Preparing assessment',
  complete: 'Complete',
  partial: 'Partial — review evidence',
  unavailable: 'Assessment unavailable',
  idle: 'Ready to check nearby bus stops'
});
const PHASE_NUMBERS = Object.freeze({ 'finding-stops': 1, 'routing-stops': 2, 'checking-timetables': 3, 'reconciling-evidence': 4, 'preparing-assessment': 5 });

export function formatAtlasTaskStatus({ phase = 'idle', detail = '', completed = null, total = null, waiting = false } = {}) {
  const label = PHASE_LABELS[phase] || 'Working';
  if (phase === 'idle') return label;
  if (phase === 'complete') return label;
  if (phase === 'partial' || phase === 'unavailable') return detail ? label + ' — ' + detail : label;
  const hasProgress = Number.isFinite(Number(completed)) && Number.isFinite(Number(total)) && Number(total) > 0;
  const progress = hasProgress ? ' — ' + Number(completed) + ' of ' + Number(total) : '';
  const waitText = waiting ? ' — Waiting briefly for the timetable source request allowance…' : '';
  const detailText = detail && !waiting ? ' — ' + String(detail).trim() : '';
  const stage = PHASE_NUMBERS[phase] ? `Step ${PHASE_NUMBERS[phase]} of 5 · ` : '';
  return stage + label + progress + (waitText || detailText);
}

export function createAtlasTaskStatus({ messageElement, regionElement = null, progressElement = null, countElement = null } = {}) {
  let state = Object.freeze({ phase: 'idle', detail: '', completed: null, total: null, waiting: false });
  const render = () => {
    if (messageElement) messageElement.textContent = formatAtlasTaskStatus(state);
    const measurable = Number.isFinite(Number(state.completed)) && Number.isFinite(Number(state.total)) && Number(state.total) > 0;
    if (progressElement) {
      progressElement.hidden = state.phase === 'idle' || state.phase === 'complete' || state.phase === 'partial' || state.phase === 'unavailable';
      progressElement.max = measurable ? Number(state.total) : 1;
      if (measurable) {
        progressElement.value = Math.max(0, Math.min(Number(state.completed), Number(state.total)));
        progressElement.setAttribute('aria-valuetext', `${Number(state.completed)} of ${Number(state.total)}`);
        progressElement.dataset.progressMode = 'determinate';
      } else {
        progressElement.removeAttribute('value');
        progressElement.removeAttribute('aria-valuetext');
        progressElement.dataset.progressMode = 'indeterminate';
      }
    }
    if (countElement) countElement.textContent = measurable ? `${Number(state.completed)} of ${Number(state.total)}` : '';
    if (regionElement) {
      regionElement.dataset.phase = state.phase;
      regionElement.dataset.waiting = state.waiting ? 'true' : 'false';
      regionElement.setAttribute('aria-busy', !['idle', 'complete', 'partial', 'unavailable'].includes(state.phase) ? 'true' : 'false');
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

export { PHASE_LABELS, PHASE_NUMBERS };
