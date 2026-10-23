export const TournamentFormat = Object.freeze({
  SINGLE_ELIMINATION: 'single_elimination',
  ROUND_ROBIN: 'round_robin',
  SWISS: 'swiss',
});

export const TournamentStatus = Object.freeze({
  DRAFT: 'draft',
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const SlotStatus = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
  BYE: 'bye',
});

export const ParticipantMode = Object.freeze({
  INDIVIDUAL: 'INDIVIDUAL',
  TEAM: 'TEAM',
});

export const OUTCOMES = Object.freeze(['a', 'b', 'draw']);

export const TRANSITIONS = Object.freeze({
  draft: ['open', 'cancelled'],
  open: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
});

export function assertTournamentTransition(from, to) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Không thể chuyển tournament từ ${from} sang ${to}`);
  }
}

export function assertOutcome(outcome) {
  if (!OUTCOMES.includes(outcome)) {
    throw new Error(`Outcome không hợp lệ: ${outcome}`);
  }
}

export function getParticipantDisplayName(entry, users, teams) {
  if (entry.team_id) {
    const team = teams?.find(t => t.id === entry.team_id);
    return team?.name ?? entry.team_id;
  }
  const user = users?.find(u => u.id === entry.user_id);
  return user?.display_name ?? entry.user_id;
}
