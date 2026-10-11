// Biến replay thành danh sách "khung hình" (frame): frames[i] là trạng thái sau i sự kiện.
// Giao diện KHÔNG tự tính luật: chỉ áp từng event lên trạng thái.
// Nhờ vậy tua tới/lui chỉ là đổi chỉ số frame.

export const REASON_LABELS = {
  BASE_CAPTURED: "chiếm được căn cứ địch",
  REACHED_BASE: "chạm được căn cứ địch",
  NO_PIECES: "đối phương hết quân",
  MAX_TURNS: "hết số lượt tối đa",
  TIMEOUT: "đối phương quá giờ",
  BOT_TIMEOUT: "đối phương quá giờ",
  CRASH: "code đối phương bị lỗi",
  INVALID_MOVE: "đối phương đi sai luật",
};

export function teamName(replay, id) {
  return replay.match_info?.teams?.[id] ?? id ?? "?";
}

function clonePieces(pieces) {
  const out = {};
  for (const id of Object.keys(pieces)) out[id] = { ...pieces[id] };
  return out;
}

function applyEvent(prev, ev, step, index) {
  const next = {
    ...prev,
    pieces: clonePieces(prev.pieces),
    index,
    turn: step.turn,
    player: step.player,
    event: ev,
    flash: null, // hiệu ứng chỉ hiện ở bước này
    notice: null, // cảnh báo chỉ hiện ở bước này
    mover: null,
    trail: null,
  };
  const P = next.pieces;

  switch (ev.type) {
    case "PIECE_MOVED":
      if (P[ev.piece_id]) P[ev.piece_id].pos = ev.to;
      next.mover = ev.piece_id;
      next.trail = { from: ev.from, to: ev.to };
      break;

    case "REVEAL":
      if (P[ev.piece_id]) P[ev.piece_id].type = ev.real_type;
      next.flash = { kind: "reveal", pos: P[ev.piece_id]?.pos };
      break;

    case "COMBAT_RESOLVED":
      for (const id of ev.destroyed_pieces ?? []) if (P[id]) P[id].alive = false;
      for (const d of ev.damaged_pieces ?? []) {
        if (P[d.piece_id]) P[d.piece_id].hp = d.new_hp;
      }
      next.mover = ev.attacker_id ?? null;
      next.flash = { kind: "combat", pos: ev.location };
      break;

    case "TRAP_TRIGGERED":
      if (ev.effect === "DESTROYED" && P[ev.piece_id]) P[ev.piece_id].alive = false;
      next.flash = { kind: "trap", pos: ev.location };
      break;

    case "BASE_CAPTURED":
      next.flash = { kind: "base", pos: ev.location };
      break;

    case "SCORE_UPDATED":
      next.scores = { ...prev.scores, ...ev.scores };
      break;

    case "BOT_TIMEOUT":
      next.notice = { kind: "warn", team: ev.team_id, text: "timeout" };
      break;

    case "GAME_OVER":
      next.over = {
        winner: ev.winner_team ?? ev.winner ?? null,
        reason: ev.reason ?? null,
      };
      break;

    default:
      // Event lạ: không làm gì với bàn cờ, chỉ hiện trong danh sách.
      break;
  }
  return next;
}

export function buildFrames(replay) {
  const pieces = {};
  for (const p of replay.initial_state) {
    pieces[p.id] = { ...p, alive: true };
  }
  const scores = Object.fromEntries(
    Object.keys(replay.match_info.teams).map((t) => [t, 0])
  );

  const frames = [
    {
      index: 0,
      turn: 0,
      player: null,
      event: null,
      pieces,
      scores,
      flash: null,
      notice: null,
      mover: null,
      trail: null,
      over: null,
    },
  ];
  const steps = [null]; // steps[i] khớp với frames[i]

  for (const turn of replay.turns) {
    const step = {
      turn: turn.turn,
      player: turn.player ?? turn.actions?.[0]?.player ?? null,
    };
    const events = turn.events?.length ? turn.events : [{ type: "TURN_PASSED" }];
    for (const ev of events) {
      const frame = applyEvent(frames[frames.length - 1], ev, step, frames.length);
      frames.push(frame);
      steps.push(step);
    }
  }

  // Nếu file không có GAME_OVER thì dùng match_info.winner ở frame cuối.
  const last = frames[frames.length - 1];
  if (!last.over && replay.match_info?.winner) {
    last.over = {
      winner: replay.match_info.winner,
      reason: replay.match_info.win_reason ?? null,
    };
  }
  return frames;
}

// Mô tả 1 event bằng tiếng Việt cho danh sách nước đi.
export function describeEvent(ev, replay) {
  if (!ev) return { icon: "▶", text: "Bắt đầu ván" };
  const tn = (id) => teamName(replay, id);
  const pos = (p) => (p ? `[${p[0]},${p[1]}]` : "?");
  switch (ev.type) {
    case "PIECE_MOVED":
      return { icon: "➡️", text: `${ev.piece_id} đi ${pos(ev.from)} → ${pos(ev.to)}` };
    case "REVEAL":
      return { icon: "👁️", text: `${ev.piece_id} lộ diện: ${ev.real_type}` };
    case "COMBAT_RESOLVED": {
      const dead = (ev.destroyed_pieces ?? []).join(", ");
      const vs = ev.attacker_id && ev.defender_id ? `${ev.attacker_id} ⚔ ${ev.defender_id}` : "Đụng độ";
      return { icon: "💥", text: `${vs}${dead ? ` — mất: ${dead}` : " — không ai mất quân"}` };
    }
    case "TRAP_TRIGGERED":
      return { icon: "☠️", text: `${ev.piece_id} dính bẫy tại ${pos(ev.location)}` };
    case "BASE_CAPTURED":
      return { icon: "🚩", text: `${tn(ev.team_id)} chiếm căn cứ ${pos(ev.location)}` };
    case "SCORE_UPDATED":
      return { icon: "🔢", text: "Cập nhật điểm" };
    case "BOT_TIMEOUT":
      return { icon: "⏱️", text: `${tn(ev.team_id)} quá giờ (${ev.max_time_ms ?? "?"}ms)` };
    case "GAME_OVER":
      return {
        icon: "🏆",
        text: `Kết thúc: ${tn(ev.winner_team ?? ev.winner)} thắng`,
      };
    case "TURN_PASSED":
      return { icon: "⏭️", text: "Không có sự kiện" };
    default:
      return { icon: "❔", text: `Sự kiện: ${ev.type}` };
  }
}
