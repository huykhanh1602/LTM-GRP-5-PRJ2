import { useEffect, useMemo, useRef, useState } from "react";
import Board from "../components/Board.jsx";
import Controls from "../components/Controls.jsx";
import ResultBanner from "../components/ResultBanner.jsx";
import TeamInfo from "../components/TeamInfo.jsx";
import TurnList from "../components/TurnList.jsx";
import { getMatches, getMatchReplay, getRankings } from "../api.js";
import { useReplay } from "../hooks/useReplay.js";
import { makeColorOf } from "../utils/colors.js";
import { parseReplay } from "../utils/parseReplay.js";
import { buildFrames } from "../utils/replayEngine.js";
import sampleV1 from "../mock/sample-v1.json";
import sampleV2 from "../mock/sample-v2.json";

const PAGE_SIZE = 20;
const SAMPLES = { "Mẫu v2 (đầy đủ)": sampleV2, "Mẫu v1 (cũ)": sampleV1 };

function tryParse(raw) {
  try {
    return { replay: parseReplay(raw), error: null };
  } catch (e) {
    return { replay: null, error: e.message };
  }
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ thời gian" : date.toLocaleString("vi-VN");
}

// Danh sách chỉ đọc từ API; chọn một trận để tải replay tương ứng.
export default function ReplayPage({ onBack, initialReplay = null }) {
  const [matches, setMatches] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [teamId, setTeamId] = useState('');
  const [teams, setTeams] = useState([]);
  const [refresh, setRefresh] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [selected, setSelected] = useState(() => initialReplay ? {
    id: initialReplay.match_info.match_id,
    label: `Trận ${initialReplay.match_info.match_id}`,
    ...tryParse(initialReplay),
  } : null);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const replayRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    setLoadingList(true);
    setMatches([]);
    setListError(null);
    Promise.all([getMatches({ status: "finished", teamId: teamId || undefined, limit: PAGE_SIZE, offset }), getRankings()])
      .then(([result, rankings]) => {
        const items = result.items.map(match => ({ ...match,
          teams: { team_a: match.team_a_name ?? match.team_a_id, team_b: match.team_b_name ?? match.team_b_id } }));
        if (!active) return;
        setMatches(items);
        setTeams(rankings.items);
        setTotal(result.total);
      })
      .catch((error) => {
        if (active) setListError(error.message);
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => { active = false; };
  }, [offset, teamId, refresh]);

  const replay = selected?.replay ?? null;
  const frames = useMemo(
    () => (replay ? buildFrames(replay) : [{ pieces: {}, scores: {}, index: 0 }]),
    [replay]
  );
  const player = useReplay(frames);
  const colorOf = makeColorOf(replay ? Object.keys(replay.match_info.teams) : []);

  async function openMatch(match) {
    const requestId = ++replayRequestRef.current;
    setSelected({ id: match.id, label: `${match.teams.team_a} - ${match.teams.team_b}`, replay: null, error: null });
    setLoadingReplay(true);
    try {
      const loaded = parseReplay(await getMatchReplay(match.id));
      if (replayRequestRef.current === requestId) {
        setSelected({
          id: match.id,
          label: `${match.teams.team_a} - ${match.teams.team_b}`,
          replay: loaded,
          error: null,
        });
      }
    } catch (error) {
      if (replayRequestRef.current === requestId) {
        setSelected((current) => current?.id === match.id ? { ...current, error: error.message } : current);
      }
    } finally {
      if (replayRequestRef.current === requestId) setLoadingReplay(false);
    }
  }

  function openSample(name) {
    setSelected({ id: null, label: name, ...tryParse(SAMPLES[name]) });
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => setSelected({ id: null, label: file.name, ...tryParse(text) }));
    e.target.value = "";
  }

  function returnToList() {
    replayRequestRef.current++;
    setLoadingReplay(false);
    setSelected(null);
    setShowHistory(false);
  }

  if (!selected) {
    return (
      <div className="replay-list-page">
        <div className="toolbar">
          <button className="btn replay-back" type="button" onClick={onBack}>
            ← Quay lại phòng đấu
          </button>
          <select aria-label="Mở replay mẫu" defaultValue="" onChange={(e) => e.target.value && openSample(e.target.value)}>
            <option value="">Replay mẫu…</option>
            {Object.keys(SAMPLES).map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <label className="file-btn">
            Mở file replay…
            <input type="file" accept=".json,application/json" onChange={onFile} hidden />
          </label>
        </div>

        <section className="card replay-list">
          <div className="replay-list-heading">
            <h2>Lịch sử trận đấu</h2>
            <span className="muted">{total} trận</span>
            <button className="btn small" disabled={loadingList} onClick={() => setRefresh(value => value + 1)}>Tải lại danh sách</button>
          </div>
          <div className="replay-filter">
            <label htmlFor="replay-team-filter">Chọn đội của bạn</label>
            <select id="replay-team-filter" value={teamId} onChange={e => { setTeamId(e.target.value); setOffset(0); }}>
              <option value="">Tất cả đội</option>
              {teams.map(team => <option key={team.team_id} value={team.team_id}>{team.name}</option>)}
            </select>
          </div>
          {loadingList && <p className="muted">Đang tải danh sách trận…</p>}
          {listError && (
            <p className="err" role="alert">Không tải được danh sách replay: {listError}</p>
          )}
          {!loadingList && !listError && matches.length === 0 && (
            <p className="muted">Chưa có trận đấu đã hoàn thành.</p>
          )}
          {matches.length > 0 && (
            <div className="replay-match-list">
              {matches.map((match) => (
                <button
                  className="replay-match-row"
                  key={match.id}
                  type="button"
                  onClick={() => openMatch(match)}
                >
                  <span className="replay-match-teams">
                    {match.teams.team_a} <span>vs</span> {match.teams.team_b}
                  </span>
                  <time dateTime={match.started_at}>{formatDate(match.started_at)}</time>
                  <span className="replay-result">{match.winner_id === match.team_a_id ? `${match.teams.team_a} thắng` :
                    match.winner_id === match.team_b_id ? `${match.teams.team_b} thắng` : 'Hòa'}
                    <small>{match.ranked ? 'Trận chính thức' : 'Luyện tập / ví dụ'}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="replay-pagination">
            <button className="btn small" disabled={offset === 0 || loadingList} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              ← Mới hơn
            </button>
            <span className="muted">
              {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + matches.length, total)}`} / {total}
            </span>
            <button className="btn small" disabled={offset + PAGE_SIZE >= total || loadingList} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Cũ hơn →
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar">
        <button className="btn replay-back" type="button" onClick={returnToList}>
          ← Danh sách trận
        </button>
        <span className="muted">{selected.label}</span>
      </div>

      {loadingReplay && <p className="muted">Đang tải replay trận đấu…</p>}
      {selected.error && (
        <div className="banner error">
          <b>Không đọc được replay:</b>
          <pre>{selected.error}</pre>
        </div>
      )}

      {replay && (
        <main className={`layout ${showHistory ? "history-expanded" : "history-collapsed"}`}>
          <section className="stage">
            <TeamInfo replay={replay} frame={player.frame} colorOf={colorOf} />
            <Board board={replay.game_config.board} frame={player.frame} colorOf={colorOf} />
            <ResultBanner replay={replay} frame={player.frame} />
            <Controls {...player} />
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
                replay={replay}
                frames={frames}
                currentIndex={player.index}
                seek={player.seek}
                colorOf={colorOf}
              />
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
