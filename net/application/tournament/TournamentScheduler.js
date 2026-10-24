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
  const submissionTimers = new Map();

  function start() {
    if (unsubscribe) return;

    const matchFinishedUnsub = events.on('MATCH_FINISHED', async (event) => {
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

    // Lắng nghe sự kiện mở cửa sổ nộp bot theo vòng
    const submissionOpenedUnsub = events.on('ROUND_SUBMISSION_OPENED', async (event) => {
      const key = `${event.tournamentId}:round_${event.roundNo}`;
      // Hủy timer cũ nếu có
      const existing = submissionTimers.get(key);
      if (existing) clearTimeout(existing);

      const now = Date.now();
      const deadline = new Date(event.deadline).getTime();
      const delay = Math.max(0, deadline - now);

      logger.info?.({
        event: 'submission_window_opened',
        tournamentId: event.tournamentId,
        roundNo: event.roundNo,
        deadline: event.deadline,
        delayMs: delay,
      });

      if (delay <= 0) {
        // Deadline đã qua, đóng ngay
        try {
          await tournamentService.closeSubmissionWindow(event.tournamentId);
        } catch (error) {
          logger.error?.({ event: 'close_submission_window_failed', tournamentId: event.tournamentId, error: error.message });
        }
        return;
      }

      const timer = setTimeout(async () => {
        submissionTimers.delete(key);
        try {
          await tournamentService.closeSubmissionWindow(event.tournamentId);
        } catch (error) {
          logger.error?.({ event: 'close_submission_window_failed', tournamentId: event.tournamentId, error: error.message });
        }
      }, delay);

      submissionTimers.set(key, timer);
    });

    const interval = setInterval(async () => {
      try {
        const list = await tournaments.list({ status: 'open' });
        for (const t of list) {
          const startsAt = t.config?.scheduled_at ?? t.startsAt ?? t.config?.startsAt;
          if (startsAt && new Date(startsAt) <= new Date()) {
            await tournamentService.start(t.id);
          }
        }
      } catch (error) {
        logger.error?.({ event: 'tournament_scheduler_check_failed', error: error.message });
      }
    }, 60000);

    unsubscribe = () => {
      matchFinishedUnsub();
      submissionOpenedUnsub();
      clearInterval(interval);
      // Dọn timer nộp bot
      for (const timer of submissionTimers.values()) clearTimeout(timer);
      submissionTimers.clear();
    };
  }

  function stop() {
    unsubscribe?.();
    unsubscribe = null;
  }

  return { start, stop };
}
