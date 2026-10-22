import { resolveEntry } from "../../utils/tournamentView.js";

const RANK_MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

// ─────────────────────────────────────────────────────────────
// Bảng xếp hạng điểm tích lũy (hỗ trợ cả SE và Round Robin)
// ─────────────────────────────────────────────────────────────
export default function StandingsTable({
  standings = [],
  myEntryId = null,
  championId = null,
  entryMap = null,
}) {
  if (!Array.isArray(standings) || standings.length === 0) {
    return (
      <div className="tl-empty tl-empty--compact">
        <span className="tl-empty__icon" aria-hidden="true">📊</span>
        <h3>Chưa có dữ liệu xếp hạng</h3>
        <p>Bảng điểm sẽ được cập nhật ngay khi trận đấu đầu tiên kết thúc.</p>
      </div>
    );
  }

  const showDraws = standings.some((row) => Number(row.draws) > 0);
  const showElo = standings.some((row) => row.eloDelta !== null && row.eloDelta !== undefined);

  return (
    <div className="tl-table-wrap">
      <table className="tl-table">
        <thead>
          <tr>
            <th className="tl-table__rank">#</th>
            <th>Bot / Thí sinh</th>
            <th className="tl-table__num">Trận</th>
            <th className="tl-table__num">Thắng</th>
            {showDraws && <th className="tl-table__num">Hòa</th>}
            <th className="tl-table__num">Thua</th>
            <th className="tl-table__num">Điểm</th>
            {showElo && <th className="tl-table__num">Elo</th>}
            <th>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const entry =
              resolveEntry(entryMap, row.entryId) ?? {
                id: row.entryId,
                teamName: row.displayName ?? String(row.entryId),
                owner: "",
                botName: "",
                avatar: "/icons.png",
              };
            const rank = index + 1;
            const isMe = row.entryId === myEntryId;
            const isChampion = row.entryId === championId;

            return (
              <tr
                key={row.entryId}
                className={[isMe ? "is-me" : "", isChampion ? "is-champion" : ""]
                  .filter(Boolean)
                  .join(" ")}
              >
                <td className="tl-table__rank">{RANK_MEDALS[rank] ?? rank}</td>
                <td>
                  <div className="tl-table__team">
                    <img src={entry.avatar} alt="" loading="lazy" />
                    <div>
                      <strong>
                        {entry.teamName}
                        {isMe && <span className="tl-me-tag">Bạn</span>}
                      </strong>
                      <small>
                        {[entry.owner, entry.botName].filter(Boolean).join(" · ") || "—"}
                      </small>
                    </div>
                  </div>
                </td>
                <td className="tl-table__num">{row.played}</td>
                <td className="tl-table__num is-win">{row.wins}</td>
                {showDraws && <td className="tl-table__num">{row.draws ?? 0}</td>}
                <td className="tl-table__num is-loss">{row.losses}</td>
                <td className="tl-table__num">
                  <b>{row.points}</b>
                </td>
                {showElo && (
                  <td
                    className={`tl-table__num ${
                      row.eloDelta === null || row.eloDelta === undefined
                        ? ""
                        : row.eloDelta >= 0
                          ? "is-win"
                          : "is-loss"
                    }`}
                  >
                    {row.eloDelta === null || row.eloDelta === undefined
                      ? "—"
                      : row.eloDelta >= 0
                        ? `+${row.eloDelta}`
                        : row.eloDelta}
                  </td>
                )}
                <td>
                  <span className={`tl-pill ${isChampion ? "tl-pill--gold" : ""}`}>
                    {row.status || "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
