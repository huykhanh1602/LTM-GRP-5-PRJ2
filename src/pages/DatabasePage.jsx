import { useEffect, useState } from 'react';
import { getMatches, getRankings, getTournamentRankings, getGames, getTournaments, getMatch, getMatchReplay } from '../api.js';
import { parseReplay } from '../utils/parseReplay.js';
import './DatabasePage.css';

const statuses = { playing: 'Đang đấu', finished: 'Hoàn tất', aborted: 'Đã hủy' };
const date = value => value ? new Date(value).toLocaleString('vi-VN') : '—';

export default function DatabasePage({ view, onReplay }) {
  const [rankings, setRankings] = useState([]);
  const [rankingScope, setRankingScope] = useState('game');
  const [games, setGames] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [gameId, setGameId] = useState('rps_chess');
  const [tournamentId, setTournamentId] = useState('');
  const [history, setHistory] = useState({ items: [], total: 0 });
  const [teamId, setTeamId] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [detailError, setDetailError] = useState('');
  const limit = 10;

  useEffect(() => {
    if (view !== 'rankings') return undefined;
    let active = true;
    Promise.all([getGames(), getTournaments({ limit: 100 })]).then(([gameData, tournamentData]) => {
      if (!active) return;
      const nextGames = gameData.items ?? [];
      const nextTournaments = tournamentData.items ?? [];
      setGames(nextGames); setTournaments(nextTournaments);
      if (!nextGames.some(game => game.id === gameId) && nextGames[0]) setGameId(nextGames[0].id);
      if (!nextTournaments.some(tournament => tournament.id === tournamentId) && nextTournaments[0]) setTournamentId(nextTournaments[0].id);
    }).catch(() => { if (active) setError('Không tải được danh sách game và giải đấu.'); });
    return () => { active = false; };
  }, [view, refresh]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSelected(null); setDetailError('');
    const rankingRequest = view === 'history' ? getRankings() : rankingScope === 'game'
      ? getRankings(gameId) : tournamentId ? getTournamentRankings(tournamentId) : Promise.resolve({ items: [] });
    Promise.all([rankingRequest, view === 'history' ? getMatches({
      teamId: teamId || undefined, status: status || undefined, limit, offset,
    }) : Promise.resolve(null)]).then(([table, matches]) => {
      if (!active) return;
      setRankings(table.items);
      if (matches) setHistory(matches);
    }).catch(() => {
      if (active) setError('Không tải được dữ liệu. Hãy kiểm tra backend ở cổng 3000 rồi bấm Tải lại.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [view, teamId, status, offset, refresh, rankingScope, gameId, tournamentId]);

  const name = id => rankings.find(team => team.team_id === id)?.name ?? id;
  async function showDetail(id) {
    setBusy(true); setDetailError('');
    try { setSelected(await getMatch(id)); }
    catch (error) { setDetailError(`Không đọc được chi tiết: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function showReplay(id) {
    setBusy(true); setDetailError('');
    try { onReplay(parseReplay(await getMatchReplay(id))); }
    catch (error) { setDetailError(`Không mở được replay: ${error.message}`); }
    finally { setBusy(false); }
  }

  return <section className="card database-page">
    <div className="database-heading">
      <h2>{view === 'rankings' ? 'Bảng xếp hạng' : 'Lịch sử trận đấu'}</h2>
      <button className="btn" disabled={loading || busy} onClick={() => setRefresh(value => value + 1)}>Tải lại</button>
    </div>
    <p className="muted">Dữ liệu từ database của server. Trận mô phỏng không được ghi vào bảng xếp hạng.</p>
    {view === 'rankings' && <>
      <div className="database-filters ranking-filters">
        <label htmlFor="ranking-scope">Bảng</label>
        <select id="ranking-scope" value={rankingScope} onChange={event => setRankingScope(event.target.value)}>
          <option value="game">Theo game</option><option value="tournament">Theo giải đấu</option>
        </select>
        {rankingScope === 'game' ? <>
          <label htmlFor="ranking-game">Game</label>
          <select id="ranking-game" value={gameId} onChange={event => setGameId(event.target.value)}>
            {games.map(game => <option key={game.id} value={game.id}>{game.name}</option>)}
          </select>
        </> : <>
          <label htmlFor="ranking-tournament">Giải đấu</label>
          <select id="ranking-tournament" value={tournamentId} onChange={event => setTournamentId(event.target.value)}>
          {tournaments.map(tournament => <option key={tournament.id} value={tournament.id}>{tournament.name} · {tournament.game_name} · {tournament.code}</option>)}
          </select>
        </>}
      </div>
      <p>{rankingScope === 'game' ? 'Bảng này chỉ tính các trận xếp hạng của game đã chọn.' : 'Bảng này chỉ tính kết quả các vòng trong giải đấu đã chọn.'} Thắng: 3 điểm · Hòa: 1 điểm · Thua: 0 điểm.</p>
    </>}
    {view === 'history' && <div className="database-filters">
      <label htmlFor="history-team">Đội</label><select id="history-team" value={teamId} onChange={e => { setTeamId(e.target.value); setOffset(0); }}>
        <option value="">Tất cả đội</option>
        {rankings.map(team => <option key={team.team_id} value={team.team_id}>{team.name}</option>)}
      </select>
      <label htmlFor="history-status">Trạng thái</label><select id="history-status" value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }}>
        <option value="">Tất cả trạng thái</option>
        {Object.entries(statuses).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
    </div>}
    {loading && <p role="status">Đang tải dữ liệu…</p>}
    {error && <p role="alert" className="err">{error}</p>}
    {!loading && !error && view === 'rankings' && rankingScope === 'tournament' && !tournamentId && <p>Chọn một giải đấu để xem bảng xếp hạng riêng.</p>}
    {!loading && !error && view === 'rankings' && !(rankingScope === 'tournament' && !tournamentId) && (rankings.length ? <div className="database-table-wrap">
      <table><thead><tr>{['Hạng', 'Người chơi / Đội', 'Trận', 'Thắng', 'Hòa', 'Thua', 'Điểm', 'Tỷ lệ thắng'].map(text => <th key={text}>{text}</th>)}</tr></thead>
        <tbody>{rankings.map(team => <tr key={team.team_id}>
          <td>{team.rank}</td><td>{team.name}</td><td>{team.played}</td><td>{team.wins}</td><td>{team.draws}</td>
          <td>{team.losses}</td><td><strong>{team.points}</strong></td><td>{(team.win_rate * 100).toFixed(1)}%</td>
        </tr>)}</tbody></table>
    </div> : <p>{rankingScope === 'game' ? 'Game này chưa có trận xếp hạng.' : 'Giải đấu này chưa có kết quả để xếp hạng.'}</p>)}
    {!loading && !error && view === 'history' && <>
      {history.items.length ? <div className="database-table-wrap"><table>
        <thead><tr>{['Mã trận', 'Hai đội', 'Trạng thái', 'Kết quả', 'Loại trận', 'Bắt đầu', 'Thao tác'].map(text => <th key={text}>{text}</th>)}</tr></thead>
        <tbody>{history.items.map(match => <tr key={match.id}>
          <td>{match.id}</td><td>{name(match.team_a_id)} / {name(match.team_b_id)}</td>
          <td>{statuses[match.status]}</td><td>{match.winner_id ? `${name(match.winner_id)} thắng` : match.status === 'finished' ? 'Hòa' : '—'}</td>
          <td>{match.ranked ? 'Chính thức' : 'Luyện tập'}</td><td>{date(match.started_at)}</td>
          <td><button className="btn small" disabled={busy} onClick={() => showDetail(match.id)}>Chi tiết</button>
            <button className="btn small" disabled={busy || match.status !== 'finished'} onClick={() => showReplay(match.id)}>Xem replay</button></td>
        </tr>)}</tbody>
      </table></div> : <p>Chưa có trận đấu phù hợp trong database.</p>}
      <div className="database-pagination">
        <button className="btn" disabled={offset === 0 || busy} onClick={() => setOffset(value => Math.max(0, value - limit))}>Trang trước</button>
        <span>{history.total ? `${offset + 1}–${Math.min(offset + limit, history.total)}` : '0'} / {history.total} trận</span>
        <button className="btn" disabled={offset + limit >= history.total || busy} onClick={() => setOffset(value => value + limit)}>Trang sau</button>
      </div>
    </>}
    {busy && <p role="status">Đang đọc trận đấu…</p>}
    {detailError && <p role="alert" className="err">{detailError}</p>}
    {selected && <section className="database-detail">
      <h3>Chi tiết trận {selected.id}</h3>
      <p>Phòng: {selected.room_id} · {name(selected.team_a_id)} / {name(selected.team_b_id)}</p>
      <p>Trạng thái: {statuses[selected.status]} · Lý do: {selected.reason ?? '—'}</p>
      <p>Kết quả: {selected.winner_id ? `${name(selected.winner_id)} thắng` : selected.status === 'finished' ? 'Hòa' : 'Chưa có kết quả'}</p>
      <p>Bắt đầu: {date(selected.started_at)} · Kết thúc: {date(selected.ended_at)}</p>
      <details><summary>Trạng thái bàn cờ cuối</summary><pre>{JSON.stringify(selected.final_state, null, 2)}</pre></details>
    </section>}
  </section>;
}
