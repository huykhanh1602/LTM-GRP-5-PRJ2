import { useMemo, useState } from "react";
import Board from "../components/Board.jsx";
import Controls from "../components/Controls.jsx";
import ResultBanner from "../components/ResultBanner.jsx";
import TeamInfo from "../components/TeamInfo.jsx";
import TurnList from "../components/TurnList.jsx";
import { useReplay } from "../hooks/useReplay.js";
import { makeColorOf } from "../utils/colors.js";
import { parseReplay } from "../utils/parseReplay.js";
import { buildFrames } from "../utils/replayEngine.js";
import sampleV1 from "../mock/sample-v1.json";
import sampleV2 from "../mock/sample-v2.json";

const SAMPLES = { "Mẫu v2 (đầy đủ)": sampleV2, "Mẫu v1 (cũ)": sampleV1 };

function tryParse(raw) {
  try {
    return { replay: parseReplay(raw), error: null };
  } catch (e) {
    return { replay: null, error: e.message };
  }
}

// Xem lại 1 trận đã xong (từ file). Sau này đổi nguồn sang API: GET /api/matches/{id}/replay
export default function ReplayPage({ onBack }) {
  const [source, setSource] = useState(() => tryParse(sampleV2));
  const [fileName, setFileName] = useState("Mẫu v2 (đầy đủ)");
  const [showHistory, setShowHistory] = useState(false);

  const replay = source.replay;
  const frames = useMemo(
    () => (replay ? buildFrames(replay) : [{ pieces: {}, scores: {}, index: 0 }]),
    [replay]
  );
  const player = useReplay(frames);
  const colorOf = makeColorOf(replay ? Object.keys(replay.match_info.teams) : []);

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
    <div>
      <div className="toolbar">
        <button className="btn small" type="button" onClick={onBack}>← Quay lại</button>
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
      </div>

      {source.error && (
        <div className="banner error">
          <b>Không đọc được replay:</b>
          <pre>{source.error}</pre>
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
