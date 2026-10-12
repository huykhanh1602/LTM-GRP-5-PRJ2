import { teamName } from "../utils/replayEngine.js";

export default function TeamInfo({ replay, frame, colorOf }) {
  const teamIds = Object.keys(replay.match_info.teams);
  return (
    <div className="teams">
      {teamIds.map((id) => {
        const mine = Object.values(frame.pieces).filter((p) => p.owner === id);
        const alive = mine.filter((p) => p.alive).length;
        const active = frame.player === id;
        return (
          <div key={id} className={`team-card ${active ? "active" : ""}`} style={{ "--team": colorOf(id) }}>
            <div className="team-name">
              <span className="dot" /> {teamName(replay, id)}
            </div>
            <div className="team-stats">
              <span>Quân: <b>{alive}</b>/{mine.length}</span>
              <span>Điểm: <b>{frame.scores?.[id] ?? 0}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
