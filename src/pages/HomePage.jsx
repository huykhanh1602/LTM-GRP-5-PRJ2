import { useState, useMemo, useRef } from "react";
import {
  GAME_CATALOG,
  CATEGORIES_ROW_1,
  CATEGORIES_ROW_2,
  ALL_CATEGORIES,
} from "../games/catalog.js";
import HeroBanner from "../components/HeroBanner.jsx";
import CategoryIcon from "../components/CategoryIcon.jsx";
import "../styles/home.css";

export default function HomePage({ onSelectGame, searchQuery = "" }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const gamesSectionRef = useRef(null);

  // Cuộn mượt xuống mục các game khi bấm vào mascot banner
  function scrollToGames() {
    if (gamesSectionRef.current) {
      gamesSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const filteredGames = useMemo(() => {
    return GAME_CATALOG.filter((game) => {
      const matchCat =
        selectedCategory === "all" ||
        game.categories?.includes(selectedCategory);
      const matchSearch =
        !searchQuery.trim() ||
        game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        game.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <div className="home-gamevui">
      {/* ── BANNER MASCOT LƯỚT TỰ ĐỘNG (Ấn vào tự cuộn xuống mục game) ── */}
      <HeroBanner onStart={scrollToGames} />

      {/* ── Khung Danh mục 2 hàng màu sắc pastel chuẩn BotVui ── */}
      <div className="categories-container-box">
        {/* Hàng 1 */}
        <div className="category-scroll-bar">
          {CATEGORIES_ROW_1.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                className={`cat-chip ${cat.solid ? "cat-chip--solid" : ""} ${
                  isActive ? "active" : ""
                }`}
                style={{
                  backgroundColor: cat.solid ? cat.bg : undefined,
                  color: cat.solid ? "#ffffff" : cat.color,
                  borderColor: cat.solid ? cat.bg : undefined,
                  "--cat-icon-bg": cat.solid ? "rgba(255,255,255,.2)" : cat.iconBg,
                }}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <CategoryIcon category={cat} />
                <span className="cat-label">{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Hàng 2 */}
        <div className="category-scroll-bar">
          {CATEGORIES_ROW_2.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                className={`cat-chip cat-chip--row2 ${isActive ? "active" : ""}`}
                style={{
                  color: isActive ? "#ffffff" : cat.color,
                  borderColor: isActive ? cat.color : undefined,
                  backgroundColor: isActive ? cat.color : undefined,
                  "--cat-icon-bg": isActive ? "rgba(255,255,255,.2)" : cat.iconBg,
                }}
                onClick={() => setSelectedCategory(cat.id)}
              >
                {cat.isTextIcon ? (
                  <span className="cat-text-icon" style={{ color: isActive ? "#fff" : cat.color }}>
                    {cat.icon}
                  </span>
                ) : (
                  <CategoryIcon category={cat} />
                )}
                <span className="cat-label">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tiêu đề Section Game (Điểm cuộn tới) ── */}
      <div className="section-header-row" ref={gamesSectionRef} id="games-section" style={{ scrollMarginTop: "20px" }}>
        <div className="section-title-badge">
          <CategoryIcon category={ALL_CATEGORIES.find((c) => c.id === selectedCategory)} className="badge-icon" />
          <h3>
            {selectedCategory === "all"
              ? "Tất cả Game Đấu Bot"
              : ALL_CATEGORIES.find((c) => c.id === selectedCategory)?.label}
          </h3>
        </div>
        <span className="results-count">({filteredGames.length} game)</span>
      </div>

      {/* ── Lưới Game ── */}
      {filteredGames.length === 0 ? (
        <div className="no-games-box">
          <p>Không tìm thấy game nào trong danh mục này.</p>
          <button
            className="btn small"
            onClick={() => setSelectedCategory("all")}
          >
            Xem tất cả game
          </button>
        </div>
      ) : (
        <div className="gamevui-grid">
          {filteredGames.map((game, index) => (
            <GameTile
              key={game.id}
              game={game}
              isFeature={index === 0 && selectedCategory === "all"}
              onSelect={() => game.available && onSelectGame(game.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GameTile({ game, isFeature, onSelect }) {
  return (
    <div
      className={`game-tile ${isFeature ? "game-tile--feature" : ""} ${
        game.available ? "game-tile--available" : "game-tile--soon"
      }`}
      style={{ "--game-accent": game.accentColor }}
      onClick={onSelect}
    >
      <div className="tile-thumb-wrapper">
        <img src={game.cover} alt={game.name} className="tile-thumb" loading="lazy" />
        
        {game.ageBadge && (
          <span className="tile-age-badge">{game.ageBadge}</span>
        )}

        {!game.available && (
          <div className="tile-soon-overlay">
            <span>Sắp ra mắt</span>
          </div>
        )}

        {game.available && (
          <div className="tile-hover-overlay">
            <span className="play-button-icon">▶</span>
          </div>
        )}
      </div>

      <div className="tile-info">
        <div className="tile-tags">
          {game.tags?.slice(0, 2).map((t) => (
            <span key={t} className="tile-tag">
              {t}
            </span>
          ))}
        </div>
        <h4 className="tile-name">{game.name}</h4>
        <p className="tile-desc">{game.shortDesc}</p>

        <div className="tile-footer">
          <span className="tile-players">👥 {game.playerCount}</span>
          {game.available ? (
            <button className="tile-play-btn" onClick={(e) => { e.stopPropagation(); onSelect(); }}>
              Chơi ngay
            </button>
          ) : (
            <span className="tile-soon-tag">Đang phát triển</span>
          )}
        </div>
      </div>
    </div>
  );
}
