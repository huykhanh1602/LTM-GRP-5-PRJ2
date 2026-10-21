export function createTournamentScheduler({
  events,
  tournaments,
  tournamentService,
  logger = console,
} = {}) {
  if (!events?.on) throw new Error('Scheduler cần event bus.');
  if (!tournaments?.findByMatchId) throw new Error('Scheduler cần tournament repository.');
  if (!tournamentService?.reportMatch) throw new Error('Scheduler cần tournament service.');

  let unsubscribe = null;

  function start() {
    if (unsubscribe) return;
    unsubscribe = events.on('MATCH_FINISHED', async (event) => {
      try {
        const link = await tournaments.findByMatchId(event.matchId);
        if (!link) return;

        await tournamentService.reportMatch(link.tournamentId, {
          matchId: event.matchId,
          outcome: event.result?.outcome ?? event.outcome,
          reason: event.result?.reason ?? event.reason ?? null,
        });
      } catch (error) {
        logger.error?.({
          event: 'tournament_scheduler_failed',
          matchId: event.matchId,
          error: error.message,
          code: error.code,
        });
      }
    });
  }

  function stop() {
    unsubscribe?.();
    unsubscribe = null;
  }

  return { start, stop };
}
