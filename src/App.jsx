import { useMemo, useState } from "react";
import Board from "./components/Board.jsx";
import Controls from "./components/Controls.jsx";
import TeamInfo from "./components/TeamInfo.jsx";
import TurnList from "./components/TurnList.jsx";
import ResultBanner from "./components/ResultBanner.jsx";
import { useReplay } from "./hooks/useReplay.js";
import { parseReplay } from "./utils/parseReplay.js";
import { buildFrames } from "./utils/replayEngine.js";
import sampleV2 from "./mock/sample-v2.json";
import sampleV1 from "./mock/sample-v1.json";

const SAMPLES = { "Mẫu v2 (đầy đủ)": sampleV2, "Mẫu v1 (cũ)": sampleV1 };
// Màu theo thứ tự đội trong match_info.teams (đội 1 = hổ phách, đội 2 = lam băng).
const PALETTE = ["#ffb02e", "#3ec6ff", "#7ee081", "#ff6b8b"];

function tryParse(raw) {
  try {
    return { replay: parseReplay(raw), error: null };
  } catch (e) {
    return { replay: null, error: e.message };
  }
}

export default function App() {
  const [source, setSource] = useState(() => tryParse(sampleV2));
  const [fileName, setFileName] = useState("Mẫu v2 (đầy đủ)");

  const replay = source.replay;
  const frames = useMemo(() => (replay ? buildFrames(replay) : [{ pieces: {}, scores: {}, index: 0 }]), [replay]);
  const player = useReplay(frames);

  const teamIds = replay ? Object.keys(replay.match_info.teams) : [];
  const colorOf = (owner) => {
    const i = teamIds.indexOf(owner);
    return i >= 0 ? PALETTE[i % PALETTE.length] : "#888";
  };

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setSource(tryParse(text));
      setFileName(file.name);
    });
    e.target.value = "";
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icons">✊ ✋ ✌️</div>
          <div>
            <h1>Đấu Trường Kéo · Búa · Bao</h1>
            {replay && (
              <div className="sub">
                {replay.match_info.match_id ?? fileName} · bàn {replay.game_config.board.width}×
                {replay.game_config.board.height}
              </div>
            )}
          </div>
        </div>
        <div className="loader">
          <select
            value={SAMPLES[fileName] ? fileName : ""}
            onChange={(e) => {
              setSource(tryParse(SAMPLES[e.target.value]));
              setFileName(e.target.value);
            }}
          >
            {!SAMPLES[fileName] && <option value="">{fileName}</option>}
            {Object.keys(SAMPLES).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <label className="file-btn">
            Mở file replay…
            <input type="file" accept=".json,application/json" onChange={onFile} hidden />
          </label>
        </div>
      </header>

      {source.error && (
        <div className="banner error">
          <b>Không đọc được replay:</b>
          <pre>{source.error}</pre>
        </div>
      )}

      {replay && (
        <main className="layout">
          <section className="stage">
            <TeamInfo replay={replay} frame={player.frame} colorOf={colorOf} />
            <Board board={replay.game_config.board} frame={player.frame} colorOf={colorOf} />
            <ResultBanner replay={replay} frame={player.frame} />
            <Controls {...player} />
          </section>
          <aside className="side">
            <h2>Diễn biến</h2>
            <TurnList
              replay={replay}
              frames={frames}
              currentIndex={player.index}
              seek={player.seek}
              colorOf={colorOf}
            />
          </aside>
        </main>
      )}
    </div>
  );
}
