import { useState } from "react";
import Lobby from "./pages/Lobby.jsx";
import Match from "./pages/Match.jsx";
import ReplayPage from "./pages/ReplayPage.jsx";
import Room from "./pages/Room.jsx";
import { useRoom } from "./hooks/useRoom.js";
import "./styles/pages.css";

export default function App() {
  const [tab, setTab] = useState("play"); // play | replay
  const room = useRoom();

  function handleBack() {
    if (tab === "replay") {
      setTab("play");
      return;
    }
    if (room.phase === "match" || room.phase === "room" || room.phase === "connecting") {
      room.leave();
      return;
    }
    setTab("play");
  }

  let page;
  if (tab === "replay") {
    page = <ReplayPage onBack={handleBack} />;
  } else if (room.phase === "match") {
    page = <Match key={room.matchKey} state={room} onRematch={room.rematch} onLeave={room.leave} onBack={handleBack} />;
  } else if (room.phase === "room") {
    page = <Room state={room} onSubmit={room.submit} onReady={room.setReady} onLeave={room.leave} onBack={handleBack} />;
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
        </nav>
      </header>
      {page}
    </div>
  );
}
