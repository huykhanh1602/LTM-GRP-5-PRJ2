import { useState, useEffect, useMemo, useRef } from "react";
import Board from "../components/Board.jsx";
import Controls from "../components/Controls.jsx";
import MatchOutcome from "../components/MatchOutcome.jsx";
import Modal from "../components/tournament/Modal.jsx";
import ResultBanner from "../components/ResultBanner.jsx";
import TeamInfo from "../components/TeamInfo.jsx";
import TurnList from "../components/TurnList.jsx";
import TurnBar from "../components/TurnBar.jsx";
import { useLivePlayback } from "../hooks/useLivePlayback.js";
import { humanMoveTargets, movablePieces } from "../utils/humanMoves.js";
import { makeColorOf } from "../utils/colors.js";
import { sound } from "../audio/soundManager.js";

// event.type → tên hiệu ứng âm thanh (khớp map SFX_SRC trong soundManager).
const SFX_BY_EVENT = {
  PIECE_MOVED: "move",
  REVEAL: "reveal",
  COMBAT_RESOLVED: "hit",
  TRAP_TRIGGERED: "trap",
  BASE_CAPTURED: "capture",
  FOOD_EATEN: "eat",
  SNAKE_CRASH: "crash",
};

// Xem trận TRỰC TIẾP (frames tăng dần khi server gửi lượt mới).
export default function Match({ state, onReturnToRoom, onLeave, onForfeit }) {
  const { init, frames, finished } = state;
  const me = state.room?.teams.find((team) => team.isMe) ?? null;
  const gameId = state.room?.game_id ?? state.params?.gameId ?? "rps_chess";
  const byMouse = me?.control === "human";
  const player = useLivePlayback(frames, { followLive: byMouse });
  const colorOf = makeColorOf(Object.keys(init.match_info.teams));
  const [showHistory, setShowHistory] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [askExit, setAskExit] = useState(false); // hỏi xác nhận bỏ ván đang chơi
  // "Trạng thái": người chơi đóng banner kết quả để xem trạng thái cuối ván; "reopened" = mở lại banner (không tự thoát).
  const [outcomeHidden, setOutcomeHidden] = useState(false);
  const [outcomeReopened, setOutcomeReopened] = useState(false);
  useEffect(() => {
    setOutcomeHidden(false);
    setOutcomeReopened(false);
  }, [state.result]);

  // Đang đánh thật (không phải khán giả): rời màn hình giữa ván = bỏ ván, bị xử thua.
  const inPlay = Boolean(me) && !finished && state.room?.status === "playing";
  const hasOutcome = Boolean(state.result) && state.result.outcome !== "watch";
  const showOutcome = hasOutcome && !outcomeHidden;

  // Lượt đang chờ mình bấm ô (server chỉ gửi your_turn cho đúng người cầm chuột).
  const turn = state.turn && state.turn.team_id === me?.id ? state.turn : null;
  const turnNo = turn?.payload?.board_state?.turn ?? null;
  useEffect(() => { setSelectedPiece(null); }, [turnNo]); // nước mới thì bỏ quân đang chọn

  const movable = useMemo(
    () => (turn && byMouse ? movablePieces(gameId, turn.payload) : []),
    [turn, gameId, byMouse],
  );
  const targets = useMemo(() => {
    if (!turn || !byMouse) return new Map();
    const list = humanMoveTargets(gameId, turn.payload, gameId === "snake_battle" ? null : selectedPiece);
    return new Map(list.map((t) => [`${t.x},${t.y}`, t]));
  }, [turn, gameId, selectedPiece, byMouse]);
  const selectedCell = useMemo(() => {
    const piece = movable.find((p) => p.id === selectedPiece);
    return piece ? `${piece.x},${piece.y}` : null;
  }, [movable, selectedPiece]);
  const pick = turn ? { targets, selected: selectedCell } : null;

  function clickCell(x, y) {
    if (!turn) return;
    const target = targets.get(`${x},${y}`);
    if (target) {
      state.playMove(target.action);
      setSelectedPiece(null);
      return;
    }
    const piece = movable.find((p) => p.x === x && p.y === y);
    setSelectedPiece(piece && piece.id === selectedPiece ? null : piece?.id ?? null);
  }

  // Phát SFX khi khung hình mới xuất hiện (khi tua lại sẽ không phát trùng cùng 1 frame).
  const lastSfxIndex = useRef(-1);
  useEffect(() => {
    const frame = player.frame;
    if (!frame || frame.index === lastSfxIndex.current) return;
    lastSfxIndex.current = frame.index;
    const cue = frame.event && SFX_BY_EVENT[frame.event.type];
    if (cue) sound.play(cue);
    // Người chơi đã có banner MatchOutcome phát tiếng thắng/thua; ở đây chỉ lo người xem.
    if (frame.over && !state.params?.teamId) sound.play(frame.over.winner ? "win" : "draw");
  }, [player.frame, state.params]);

  return (
    <div>
      <div className="live-bar">
        <div className="match-status">
          {finished ? (
            <span className="badge ended">ĐÃ KẾT THÚC</span>
          ) : (
            <span className="badge live"><i /> TRỰC TIẾP</span>
          )}
          <button
            className="btn small"
            onClick={() => (inPlay ? setAskExit(true) : onReturnToRoom())}
          >
            ← Phòng chờ
          </button>
        </div>
        {player.behind > 0 && (
          <button className="btn small" onClick={() => player.seek(player.last)}>
            Đang chậm {player.behind} bước · Về trực tiếp ⏭
          </button>
        )}
        <button className="btn small" onClick={() => (inPlay ? setAskExit(true) : onLeave())}>
          Thoát phòng
        </button>
      </div>

      {askExit && (
        <Modal
          title="Rời ván đang chơi?"
          subtitle="Bỏ giữa ván sẽ bị xử thua ngay lập tức."
          onClose={() => setAskExit(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setAskExit(false)}>
                Ở lại đánh tiếp
              </button>
              <button type="button" className="btn danger" onClick={() => { setAskExit(false); onForfeit(); }}>
                Rời ván, chịu thua
              </button>
            </>
          }
        >
          <p className="forfeit-warn">
            Bạn đang giữa ván. Rời khỏi màn hình lúc này được tính là bỏ ván và bạn sẽ thua ngay.
          </p>
        </Modal>
      )}

      {showOutcome && (
        <MatchOutcome
          result={state.result}
          myTeamId={state.result.myTeamId}
          onDone={onLeave}
          onViewState={() => {
            player.seek(player.last);
            setOutcomeHidden(true);
          }}
          autoReturn={!outcomeReopened}
        />
      )}

      <main className={`layout ${showHistory ? "history-expanded" : "history-collapsed"}`}>
        <section className="stage">
          <TeamInfo replay={init} frame={player.frame} colorOf={colorOf} />
          <TurnBar turn={turn} myName={me?.name ?? ""} gameId={gameId} hasPieceSelected={Boolean(selectedPiece)} />
          <Board board={init.game_config.board} frame={player.frame} colorOf={colorOf} pick={pick} onCellClick={turn ? clickCell : undefined} />
          <ResultBanner replay={init} frame={player.frame} />
          <Controls {...player} />
          {finished && (
            <div className="end-actions">
              <button className="btn" onClick={onReturnToRoom}>← Quay lại phòng chờ</button>
              {hasOutcome && outcomeHidden && (
                <button
                  className="btn"
                  onClick={() => { setOutcomeReopened(true); setOutcomeHidden(false); }}
                >
                  🏁 Xem kết quả
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="side">
          <button
            className="history-toggle"
            type="button"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((visible) => !visible)}
          >
            <span>Diễn biến</span>
            <span aria-hidden="true">{showHistory ? "◀" : "▶"}</span>
          </button>
          {showHistory && (
            <TurnList
              replay={init}
              frames={frames}
              currentIndex={player.index}
              seek={player.seek}
              colorOf={colorOf}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
