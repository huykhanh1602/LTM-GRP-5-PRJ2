// ============================================================
// Chuẩn hoá dữ liệu giải đấu từ Backend -> mô hình UI
// Chấp nhận cả camelCase (net/domain) và snake_case (API JSON).
// ============================================================

export const FORMAT = Object.freeze({
  SINGLE_ELIMINATION: "single_elimination",
  ROUND_ROBIN: "round_robin",
  SWISS: "swiss",
});

export const STATUS_LABELS = {
  draft: "Bản nháp",
  open: "Đang mở đăng ký",
  in_progress: "Đang diễn ra",
  completed: "Đã kết thúc",
  cancelled: "Đã hủy",
};

const STATUS_HINTS = {
  draft: "BTC đang hoàn thiện thể lệ và cấu hình luật thi đấu",
  open: "Đăng ký đang mở — nộp bot trước khi giải khóa để chắc chắn có suất",
  in_progress: "Giải đang diễn ra — bot đã được khóa và kết quả cập nhật realtime",
  completed: "Giải đã kết thúc — toàn bộ replay vẫn xem lại được",
  cancelled: "Giải đấu đã bị Ban Tổ Chức hủy",
};

const STATUS_NOTICES = {
  draft: "Giải chưa mở đăng ký. Bạn có thể lưu nháp bot để chuẩn bị trước.",
  open: "Đăng ký đang mở. Bạn có thể nộp lại bot trước khi BTC khóa danh sách.",
  in_progress: "Bot đã được khóa để đảm bảo công bằng. Theo dõi trực tiếp ở bảng nhánh.",
  completed: "Giải đã khép lại. Bạn có thể xem lại toàn bộ replay của các trận.",
  cancelled: "Giải đã bị hủy. Kết quả trước đó không được tính.",
};

const COUNTDOWN_LABELS = {
  draft: "Dự kiến mở đăng ký sau",
  open: "Khởi tranh sau",
  in_progress: "Trận kế tiếp sau",
  completed: null,
  cancelled: null,
};

export const DEFAULT_RULES = [
  "Bot phải viết bằng Python 3.11, Node.js 20 hoặc C++17.",
  "Thời gian suy nghĩ tối đa 500ms mỗi nước đi.",
  "Không được đọc file hệ thống hoặc gọi mạng trong lúc thi đấu.",
  "Kết quả do server chấm, BTC là trọng tài cuối cùng.",
];

const SLOT_STATUS_MAP = {
  live: "running",
  playing: "running",
  running: "running",
  in_progress: "running",
  done: "done",
  finished: "done",
  ended: "done",
  complete: "done",
  completed: "done",
  ready: "ready",
  scheduled: "ready",
  upcoming: "ready",
  pending: "pending",
  waiting: "pending",
  bye: "bye",
};

// ── Helpers cơ bản ─────────────────────────────────────────
function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function pickId(...values) {
  const value = firstDefined(...values);
  return value === undefined ? null : String(value);
}

export function normalizeStatus(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (key === "ongoing" || key === "active" || key === "running") return "in_progress";
  if (key === "upcoming" || key === "pending_registration") return "open";
  if (key === "cancelled" || key === "canceled") return "cancelled";
  return STATUS_LABELS[key] ? key : "draft";
}

export function normalizeFormat(value) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (key.includes("round") || key === "rr") return FORMAT.ROUND_ROBIN;
  if (key.includes("swiss")) return FORMAT.SWISS;
  return FORMAT.SINGLE_ELIMINATION;
}

export function normalizeSlotStatus(value, context = {}) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (SLOT_STATUS_MAP[key]) return SLOT_STATUS_MAP[key];
  if (context.winnerId) return "done";
  if (context.participantAId && context.participantBId) {
    return context.matchId ? "running" : "ready";
  }
  return "pending";
}

// Đọc tỉ số từ nhiều dạng payload khác nhau
export function readScore(raw = {}) {
  const source = raw.score ?? raw.scores ?? raw.result?.score;
  if (Array.isArray(source)) {
    return { a: toNumber(source[0]), b: toNumber(source[1]) };
  }
  const container = source && typeof source === "object" ? source : {};
  const a = firstDefined(
    container.a,
    container.a_score,
    container.scoreA,
    container.participantA,
    container.participant_a,
    raw.scoreA,
    raw.score_a,
    raw.score_a_total,
  );
  const b = firstDefined(
    container.b,
    container.b_score,
    container.scoreB,
    container.participantB,
    container.participant_b,
    raw.scoreB,
    raw.score_b,
    raw.score_b_total,
  );
  if (a === undefined && b === undefined) return null;
  return { a: toNumber(a), b: toNumber(b) };
}

// ── Entries ────────────────────────────────────────────────
export function normalizeEntries(rawEntries = [], bracketParticipants = []) {
  const list = Array.isArray(rawEntries) && rawEntries.length
    ? rawEntries
    : Array.isArray(bracketParticipants)
      ? bracketParticipants
      : [];

  return list.map((raw = {}, index) => {
    const displayName = firstDefined(raw.displayName, raw.display_name, raw.username, raw.name);
    const id = pickId(raw.userId, raw.user_id, raw.id, raw.entryId, raw.entry_id) ?? `participant-${index + 1}`;
    const teamName = firstDefined(
      raw.teamName,
      raw.team_name,
      raw.botName,
      raw.bot_name,
      displayName,
      `Bot ${index + 1}`,
    );
    return {
      id,
      teamName,
      botName: firstDefined(raw.botName, raw.bot_name, raw.filename, `${teamName}.py`),
      owner: firstDefined(raw.owner, displayName, ""),
      rating: toNumber(firstDefined(raw.rating, raw.elo), 1000),
      seed: toNumber(firstDefined(raw.seed, index + 1), index + 1),
      avatar: firstDefined(raw.avatar, raw.avatarUrl, raw.avatar_url, "/icons.png"),
    };
  });
}

export function createEntryMap(entries = []) {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

export function resolveEntry(entryMap, id) {
  if (!id) return null;
  if (entryMap?.get) return entryMap.get(String(id)) ?? null;
  return null;
}

// ── Bracket ────────────────────────────────────────────────
export function normalizeSlot(raw = {}, roundIndex = 0, matchIndex = 0) {
  const participantAId = pickId(
    raw.participantAId,
    raw.participant_a_id,
    raw.playerAId,
    raw.player_a_id,
    raw.a,
  );
  const participantBId = pickId(
    raw.participantBId,
    raw.participant_b_id,
    raw.playerBId,
    raw.player_b_id,
    raw.b,
  );
  const matchId = pickId(raw.matchId, raw.match_id);
  const winnerId = pickId(raw.winnerId, raw.winner_id);
  const score = readScore(raw);

  return {
    matchKey:
      pickId(raw.matchKey, raw.match_key, raw.slotKey, raw.slot_key) ??
      `r${roundIndex}m${matchIndex}`,
    roundIndex: toNumber(firstDefined(raw.roundIndex, raw.round_index), roundIndex),
    matchIndex: toNumber(firstDefined(raw.matchIndex, raw.match_index), matchIndex),
    participantAId,
    participantBId,
    winnerId,
    matchId,
    replayId: pickId(raw.replayId, raw.replay_id),
    score,
    replayCount: toNumber(firstDefined(raw.replayCount, raw.replay_count), 0),
    startedAt: firstDefined(raw.startedAt, raw.started_at, null),
    status: normalizeSlotStatus(raw.status, {
      winnerId,
      participantAId,
      participantBId,
      matchId,
    }),
  };
}

// rounds: [[slot, ...], ...] | { rounds } | null
export function normalizeRounds(rawBracket) {
  const rounds = Array.isArray(rawBracket) ? rawBracket : rawBracket?.rounds;
  if (!Array.isArray(rounds) || rounds.length === 0) return null;

  return rounds.map((matches, roundIndex) => {
    const list = Array.isArray(matches) ? matches : [];
    return list.map((match, matchIndex) => normalizeSlot(match, roundIndex, matchIndex));
  });
}

// Tên vòng động theo số vòng còn lại (không hardcode 8 đội)
export function getRoundLabels(roundCount, format = FORMAT.SINGLE_ELIMINATION) {
  if (!roundCount || roundCount < 1) return [];
  if (normalizeFormat(format) === FORMAT.ROUND_ROBIN) {
    return Array.from({ length: roundCount }, (_, index) => `Vòng ${index + 1}`);
  }

  const names = new Map([
    [1, "Chung kết"],
    [2, "Bán kết"],
    [3, "Tứ kết"],
    [4, "Vòng 1/8"],
    [5, "Vòng 1/16"],
  ]);

  return Array.from({ length: roundCount }, (_, index) => {
    const remaining = roundCount - index;
    return names.get(remaining) ?? `Vòng loại ${index + 1}`;
  });
}

// ── Standings ──────────────────────────────────────────────
export function normalizeStandings(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row = {}, index) => ({
      entryId: pickId(row.entryId, row.entry_id, row.userId, row.user_id),
      played: toNumber(firstDefined(row.played, row.matches_played)),
      wins: toNumber(row.wins),
      losses: toNumber(row.losses),
      draws: toNumber(firstDefined(row.draws, row.draw_count)),
      points: toNumber(row.points),
      eloDelta: firstDefined(row.eloDelta, row.elo_delta, null),
      headToHeadPoints: toNumber(firstDefined(row.headToHeadPoints, row.head_to_head_points)),
      status: firstDefined(row.status, row.stage, ""),
      rank: toNumber(firstDefined(row.rank, index + 1), index + 1),
    }))
    .filter((row) => row.entryId);
}

// Tính bảng điểm từ bracket (fallback khi API chưa trả standings)
export function computeStandingsFromRounds(rounds = [], entries = [], options = {}) {
  const { championId = null, status = "in_progress" } = options;
  const table = new Map(
    entries.map((entry) => [
      entry.id,
      {
        entryId: entry.id,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points: 0,
        eloDelta: null,
        headToHeadPoints: 0,
        status: "Chưa đấu",
      },
    ]),
  );

  for (const slot of rounds.flat()) {
    if (slot.status !== "done" || !slot.participantAId || !slot.participantBId) continue;
    const a = table.get(slot.participantAId);
    const b = table.get(slot.participantBId);
    if (!a || !b) continue;

    a.played += 1;
    b.played += 1;

    if (!slot.winnerId) {
      a.draws += 1;
      b.draws += 1;
      a.points += 1;
      b.points += 1;
    } else if (slot.winnerId === a.entryId) {
      a.wins += 1;
      a.points += 3;
      b.losses += 1;
    } else {
      b.wins += 1;
      b.points += 3;
      a.losses += 1;
    }
  }

  return [...table.values()]
    .map((row) => ({
      ...row,
      status:
        row.entryId === championId
          ? "Vô địch"
          : row.played === 0
            ? "Chưa đấu"
            : status === "completed"
              ? "Hoàn tất"
              : "Đang đấu",
    }))
    .sort((x, y) => y.points - x.points || y.wins - x.wins || x.losses - y.losses);
}

// ── Feed ───────────────────────────────────────────────────
function formatClock(value) {
  if (!value) return "—";
  const iso = toIso(value);
  if (!iso) return String(value);
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

export function buildFeedFromRounds(rounds = [], labels = []) {
  const rows = [];

  rounds.forEach((matches, roundIndex) => {
    for (const slot of matches) {
      if (slot.status !== "done" && slot.status !== "running") continue;
      if (!slot.participantAId && !slot.participantBId) continue;
      rows.push({
        id: slot.matchId ?? slot.matchKey,
        matchId: slot.matchId,
        matchKey: slot.matchKey,
        round: labels[roundIndex] ?? `Vòng ${roundIndex + 1}`,
        status: slot.status === "running" ? "live" : "done",
        startedAt: formatClock(slot.startedAt),
        a: slot.participantAId,
        b: slot.participantBId,
        score: slot.score,
        winnerId: slot.winnerId,
        replayId: slot.replayId,
        isFinal: roundIndex === rounds.length - 1 && matches.length === 1,
      });
    }
  });

  return rows.sort(
    (x, y) =>
      (x.status === "live" ? -1 : 0) - (y.status === "live" ? -1 : 0) ||
      String(y.startedAt).localeCompare(String(x.startedAt)),
  );
}

function normalizeFeedRows(rows, labels) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row = {}, index) => {
    const rawStatus = String(row.status ?? "").toLowerCase();
    return {
      id: pickId(row.id, row.matchId, row.match_id) ?? `feed-${index}`,
      matchId: pickId(row.matchId, row.match_id),
      matchKey: pickId(row.matchKey, row.match_key),
      round: firstDefined(row.round, row.roundLabel, row.round_label, labels[toNumber(firstDefined(row.roundIndex, row.round_index))], "—"),
      status:
        rawStatus === "running" || rawStatus === "live" || rawStatus === "playing"
          ? "live"
          : rawStatus === "done" || rawStatus === "completed" || rawStatus === "finished"
            ? "done"
            : "upcoming",
      startedAt: firstDefined(row.startedAt, row.started_at, row.time, "—"),
      a: pickId(row.a, row.participantAId, row.participant_a_id, row.playerAId, row.player_a_id),
      b: pickId(row.b, row.participantBId, row.participant_b_id, row.playerBId, row.player_b_id),
      score: readScore(row),
      winnerId: pickId(row.winnerId, row.winner_id),
      replayId: pickId(row.replayId, row.replay_id),
      isFinal: Boolean(firstDefined(row.isFinal, row.is_final, false)),
    };
  });
}

// ── Realtime (WebSocket) ───────────────────────────────────
export function toSlotPatch(raw = {}) {
  const key = pickId(
    raw.matchKey,
    raw.match_key,
    raw.slotKey,
    raw.slot_key,
    raw.matchId,
    raw.match_id,
  );
  if (!key) return null;

  const patch = {};
  const has = (camel, snake) =>
    Object.prototype.hasOwnProperty.call(raw, camel) ||
    Object.prototype.hasOwnProperty.call(raw, snake);

  if (raw.status !== undefined) {
    patch.status = normalizeSlotStatus(raw.status, {
      participantAId: firstDefined(raw.participantAId, raw.participant_a_id),
      participantBId: firstDefined(raw.participantBId, raw.participant_b_id),
      winnerId: firstDefined(raw.winnerId, raw.winner_id),
      matchId: firstDefined(raw.matchId, raw.match_id),
    });
  }
  if (has("participantAId", "participant_a_id")) {
    patch.participantAId = pickId(raw.participantAId, raw.participant_a_id);
  }
  if (has("participantBId", "participant_b_id")) {
    patch.participantBId = pickId(raw.participantBId, raw.participant_b_id);
  }
  if (has("winnerId", "winner_id")) {
    patch.winnerId = pickId(raw.winnerId, raw.winner_id);
  }
  if (has("matchId", "match_id")) {
    patch.matchId = pickId(raw.matchId, raw.match_id);
  }
  if (has("replayId", "replay_id")) {
    patch.replayId = pickId(raw.replayId, raw.replay_id);
  }
  if (raw.startedAt !== undefined || raw.started_at !== undefined) {
    patch.startedAt = firstDefined(raw.startedAt, raw.started_at, null);
  }

  const score = readScore(raw);
  if (score) patch.score = score;

  return Object.keys(patch).length ? { key, patch } : null;
}

// Tách message WS thành snapshot giải đấu hoặc danh sách patch slot
export function normalizeLiveMessage(message) {
  if (!message || typeof message !== "object") return null;

  const type = String(firstDefined(message.type, message.event, "")).toLowerCase();
  const payload = firstDefined(message.payload, message.data, message) ?? {};

  const snapshotCandidate = firstDefined(payload.tournament, message.tournament, null);
  const looksLikeTournament =
    snapshotCandidate || (payload.bracket && (payload.status || payload.id));
  if (looksLikeTournament && /tournament|snapshot|state|update/.test(type)) {
    return { snapshot: snapshotCandidate ?? payload, updates: [] };
  }

  const candidate = firstDefined(
    payload.slots,
    payload.matches,
    payload.updates,
    payload.slot,
    payload.match,
  );

  const rawUpdates = [];
  if (Array.isArray(candidate)) rawUpdates.push(...candidate);
  else if (candidate && typeof candidate === "object") rawUpdates.push(candidate);
  else if (payload.matchKey || payload.match_key || payload.matchId || payload.match_id) {
    rawUpdates.push(payload);
  }

  const updates = rawUpdates.map(toSlotPatch).filter(Boolean);
  if (updates.length === 0) return null;
  return { snapshot: null, updates };
}

// Ghép patch realtime vào các vòng đấu
export function mergeLiveUpdates(rounds, updates = []) {
  if (!Array.isArray(rounds) || rounds.length === 0) return rounds;
  if (!Array.isArray(updates) || updates.length === 0) return rounds;

  const patchMap = new Map(updates.map((item) => [item.key, item.patch]));

  return rounds.map((matches) =>
    matches.map((slot) => {
      const patch = patchMap.get(slot.matchKey) ?? (slot.matchId ? patchMap.get(slot.matchId) : null);
      if (!patch) return slot;
      return { ...slot, ...patch, score: patch.score ?? slot.score };
    }),
  );
}

// ── Chuẩn hoá toàn bộ giải đấu ─────────────────────────────
function toIso(value) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value).toISOString();
  const text = String(value).trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)
    ? text.replace(" ", "T")
    : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value) {
  const iso = toIso(value);
  if (!iso) return String(value ?? "—");
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildSchedule(raw, status) {
  if (Array.isArray(raw.schedule) && raw.schedule.length > 0) {
    return raw.schedule.map((item = {}) => ({
      label: firstDefined(item.label, item.name, "Mốc thời gian"),
      time: firstDefined(item.time, item.at, item.value, "—"),
      done: Boolean(firstDefined(item.done, item.completed, false)),
    }));
  }

  const schedule = [];
  const deadline = firstDefined(raw.registrationDeadline, raw.registration_deadline);
  const start = firstDefined(raw.startAt, raw.start_at, raw.start_time, raw.startTime);
  const ended = firstDefined(raw.endedAt, raw.ended_at, raw.end_time);

  if (deadline) {
    schedule.push({
      label: "Khóa đăng ký",
      time: formatDateTime(deadline),
      done: status !== "open" && status !== "draft",
    });
  }
  if (start) {
    schedule.push({
      label: "Khởi tranh",
      time: formatDateTime(start),
      done: status === "in_progress" || status === "completed",
    });
  }
  if (ended) {
    schedule.push({
      label: "Kết thúc",
      time: formatDateTime(ended),
      done: status === "completed",
    });
  }
  return schedule;
}

export function normalizeTournament(rawInput, fallback = {}, options = {}) {
  const raw = rawInput && typeof rawInput === "object" ? rawInput : {};
  const status = normalizeStatus(firstDefined(raw.status, fallback.status));
  const bracketRaw = firstDefined(raw.bracket, raw.brackets, raw.rounds);
  const format = normalizeFormat(
    firstDefined(raw.format, bracketRaw?.format, fallback.format),
  );

  const rounds = normalizeRounds(bracketRaw) ?? [];
  const participants = firstDefined(bracketRaw?.participants, raw.participants, []);
  const entries = normalizeEntries(
    firstDefined(raw.entries, raw.participants, raw.teams, []),
    participants,
  );
  const entryMap = createEntryMap(entries);
  const labels = getRoundLabels(rounds.length, format);

  const championId = pickId(
    raw.championId,
    raw.champion_id,
    rounds.at(-1)?.[0]?.winnerId,
  );

  const explicitMyId = pickId(raw.myEntryId, raw.my_entry_id, raw.currentEntryId, raw.current_entry_id);
  const myEntryId =
    explicitMyId ??
    (options.currentUserId && entryMap.has(String(options.currentUserId))
      ? String(options.currentUserId)
      : null);

  const providedStandings = normalizeStandings(
    firstDefined(raw.standings, raw.table, bracketRaw?.standings, []),
  );
  const standings =
    providedStandings.length > 0
      ? providedStandings
      : rounds.length > 0
        ? computeStandingsFromRounds(rounds, entries, { championId, status })
        : [];

  const providedFeed = normalizeFeedRows(
    firstDefined(raw.feed, raw.matches, raw.history, []),
    labels,
  );
  const feed =
    providedFeed.length > 0 ? providedFeed : buildFeedFromRounds(rounds, labels);

  const gameRaw = raw.game && typeof raw.game === "object" ? raw.game : {};
  const game = {
    id: firstDefined(gameRaw.id, raw.gameId, raw.game_id, fallback.game?.id, "rps_chess"),
    name: firstDefined(
      gameRaw.name,
      raw.gameName,
      raw.game_name,
      fallback.game?.name,
      "Kéo · Búa · Bao Cờ",
    ),
    logo: firstDefined(
      gameRaw.logo,
      gameRaw.icon,
      raw.gameLogo,
      raw.game_logo,
      fallback.game?.logo,
      "/logo/kbb_logo.webp",
    ),
    cover: firstDefined(gameRaw.cover, fallback.game?.cover, "/game/kbb_game.png"),
  };

  const organizerRaw = firstDefined(raw.organizer, raw.owner, raw.host, fallback.organizer, {});
  const organizer =
    typeof organizerRaw === "string"
      ? { name: organizerRaw, avatar: "/icons.png", contact: "" }
      : {
          name: firstDefined(organizerRaw.name, organizerRaw.displayName, "Ban Tổ Chức"),
          avatar: firstDefined(organizerRaw.avatar, "/icons.png"),
          contact: firstDefined(organizerRaw.contact, organizerRaw.email, ""),
        };

  const submissionRaw = firstDefined(raw.mySubmission, raw.my_submission, raw.submission, {});
  const rawSubmissionStatus = String(submissionRaw.status ?? "").toLowerCase();
  const submissionLocked = ["in_progress", "completed", "cancelled"].includes(status);
  const submissionStatus = ["ready", "submitted", "accepted", "approved", "done"].includes(
    rawSubmissionStatus,
  )
    ? submissionLocked
      ? "locked"
      : "ready"
    : status === "draft"
      ? "draft"
      : submissionLocked
        ? "locked"
        : "idle";
  const mySubmission = {
    status: submissionStatus,
    updatedAt: firstDefined(submissionRaw.updatedAt, submissionRaw.updated_at, null),
    source: firstDefined(submissionRaw.source, null),
    fileName: firstDefined(submissionRaw.fileName, submissionRaw.filename, null),
    language: firstDefined(submissionRaw.language, "python"),
  };

  const firstRoundCount = rounds[0]?.length ?? 0;
  const capacity = toNumber(
    firstDefined(
      raw.capacity,
      raw.config?.maxParticipants,
      raw.config?.max_participants,
      firstRoundCount * 2,
      entries.length,
      fallback.capacity,
      8,
    ),
  );
  const registered = toNumber(
    firstDefined(raw.registered, raw.registeredTeams, raw.registered_teams, entries.length, 0),
  );

  const formatLabel = firstDefined(
    raw.formatLabel,
    raw.format_label,
    format === FORMAT.ROUND_ROBIN
      ? `Round Robin · ${entries.length || "?"} bot`
      : firstRoundCount > 0
        ? `Single Elimination · ${firstRoundCount * 2} slot`
        : "Single Elimination",
  );

  const countdownSource =
    status === "completed" || status === "cancelled"
      ? null
      : firstDefined(
          raw.countdownTarget,
          raw.startAt,
          raw.start_at,
          raw.startTime,
          raw.start_time,
          fallback.countdownTarget,
          null,
        );
  const countdownTarget = toIso(countdownSource);

  return {
    id: firstDefined(raw.id, raw.tournamentId, raw.tournament_id, fallback.id, "TOURNAMENT"),
    code: firstDefined(raw.code, raw.id, raw.tournamentId, raw.tournament_id, fallback.code, "TOUR"),
    name: firstDefined(raw.name, raw.title, fallback.name, "Giải đấu Bot"),
    game,
    format,
    formatLabel,
    organizer,
    prize: firstDefined(raw.prize, raw.prizePool, raw.prize_pool, fallback.prize, "Cúp vinh danh & Elo"),
    description: firstDefined(raw.description, raw.desc, fallback.description, ""),
    entries,
    entryMap,
    capacity,
    registered,
    rules: Array.isArray(raw.rules) && raw.rules.length ? raw.rules : DEFAULT_RULES,
    schedule: buildSchedule(raw, status),
    myEntryId,
    mySubmission,
    status,
    statusLabel: firstDefined(raw.statusLabel, raw.status_label, STATUS_LABELS[status]),
    statusHint: firstDefined(raw.statusHint, raw.status_hint, STATUS_HINTS[status]),
    countdownTarget,
    countdownLabel: firstDefined(
      raw.countdownLabel,
      raw.countdown_label,
      COUNTDOWN_LABELS[status],
    ),
    bracket: rounds.length > 0 ? { format, rounds, participants } : null,
    rounds,
    roundLabels: labels,
    standings,
    feed,
    championId,
    notice: firstDefined(raw.notice, STATUS_NOTICES[status]),
    config: firstDefined(raw.config, {}),
  };
}
