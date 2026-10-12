import { useState } from "react";
import Lobby from "./pages/Lobby.jsx";
import Match from "./pages/Match.jsx";
import ReplayPage from "./pages/ReplayPage.jsx";
import Room from "./pages/Room.jsx";
import DatabasePage from './pages/DatabasePage.jsx';
import { useRoom } from "./hooks/useRoom.js";
import "./styles/pages.css";

export default function App() {
  const [tab, setTab] = useState("play"); // play | replay
  const room = useRoom();
  const [databaseReplay, setDatabaseReplay] = useState(null);

  let page;
  if (tab === "replay") {
    page = <ReplayPage key={databaseReplay?.match_info.match_id ?? 'list'} initialReplay={databaseReplay} onBack={() => setTab("play")} />;
  } else if (tab === 'history' || tab === 'rankings') {
    page = <DatabasePage key={tab} view={tab} onReplay={replay => { setDatabaseReplay(replay); setTab('replay'); }} />;
  } else if (room.phase === "match") {
    page = (
      <Match
        key={room.matchKey}
        state={room}
        onReturnToRoom={room.returnToRoom}
        onLeave={room.leave}
      />
    );
  } else if (room.phase === "room") {
    page = <Room state={room} onSubmit={room.submit} onReady={room.setReady} onLeave={room.leave} />;
  } else {
    page = <Lobby onJoin={room.join} connecting={room.phase === "connecting"} error={room.error} />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="/icons.png" alt="Logo Kéo Búa Bao" className="brand-logo" />
          <h1>Đấu Trường Kéo · Búa · Bao</h1>
        </div>
        <nav className="tabs">
          <button className={tab === "play" ? "on" : ""} onClick={() => setTab("play")}>
            Phòng đấu{room.phase !== "idle" && room.phase !== "connecting" ? " ●" : ""}
          </button>
          <button className={tab === "replay" ? "on" : ""} onClick={() => setTab("replay")}>
            Xem replay
          </button>
          <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>Lịch sử trận đấu</button>
          <button className={tab === 'rankings' ? 'on' : ''} onClick={() => setTab('rankings')}>Bảng xếp hạng</button>
        </nav>
      </header>
      {page}
    </div>
  );
}
