import { BOT_LANGUAGES } from "../../utils/botLanguages.js";

const pad2 = (value) => String(value).padStart(2, "0");

function todayInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// ─────────────────────────────────────────────────────────────
// Form mở giải đấu cá nhân / cộng đồng (ghi thẳng vào server).
// Nhận toàn bộ state từ hook useCreateTournamentForm.
// ─────────────────────────────────────────────────────────────
export default function CreateTournamentForm({ form, onCancel }) {
  const {
    tourName,
    setTourName,
    gameOptions,
    selectedGame,
    setSelectedGame,
    maxTeams,
    setMaxTeams,
    startDate,
    setStartDate,
    startClock,
    setStartClock,
    languages,
    toggleLanguage,
    rules,
    setRules,
    formError,
    creating,
    prize,
    setPrize,
    description,
    setDescription,
    format,
    setFormat,
    participantMode,
    setParticipantMode,
    minTeamSize,
    setMinTeamSize,
    maxTeamSize,
    setMaxTeamSize,
    startType,
    setStartType,
    msg,
    handleCreateTour,
  } = form;

  return (
    <div style={{ marginTop: "18px", borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: "16px" }}>
      <h3 style={{ margin: "0 0 8px" }}>Mở giải đấu cá nhân / cộng đồng</h3>
      <p style={{ margin: "0 0 16px", fontSize: "13.5px", color: "var(--muted)" }}>
        Giải đấu có hiệu lực ngay sau khi tạo. Luật chơi bạn điền ở đây sẽ hiện trong phòng
        chờ của giải cho người tham gia đọc.
      </p>

      {msg && (
        <div
          className="auth-error"
          style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#166534", marginBottom: "14px" }}
        >
          {msg}
        </div>
      )}
      {formError && (
        <div className="auth-error" style={{ marginBottom: "14px" }}>
          {formError}
        </div>
      )}

      <form onSubmit={handleCreateTour} className="tournament-reg-form">
        <div className="reg-field">
          <label>Tên giải đấu *</label>
          <input
            type="text"
            className="reg-input"
            placeholder="Ví dụ: Đại Chiến Bot Toàn Quốc 2026"
            value={tourName}
            onChange={(e) => setTourName(e.target.value)}
            required
          />
        </div>

        <div className="form-grid-2">
          <div className="reg-field">
            <label>Chọn Game thi đấu</label>
            <select
              className="reg-select"
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
            >
              {gameOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div className="reg-field">
            <label>
              {participantMode === "TEAM"
                ? "Số lượng ĐỘI tham gia"
                : "Số lượng người chơi"}{" "}
              (Tối đa: <strong>128</strong>)
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <input
                type="number"
                min={2}
                max={128}
                className="reg-input"
                value={maxTeams}
                onChange={(e) => setMaxTeams(e.target.value)}
                style={{ width: "120px" }}
                required
              />
              <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                {participantMode === "TEAM" ? "đội" : "người"}
              </span>
            </div>
            {/* Các nút bấm chọn nhanh quy mô */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
              {[4, 8, 16, 32, 64, 128].map((num) => (
                <button
                  key={num}
                  type="button"
                  className="btn small"
                  style={{
                    fontSize: "11px",
                    padding: "2px 8px",
                    background: Number(maxTeams) === num ? "var(--accent)" : undefined,
                    color: Number(maxTeams) === num ? "#fff" : undefined,
                  }}
                  onClick={() => setMaxTeams(num)}
                >
                  {num} {participantMode === "TEAM" ? "đội" : "người"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="reg-field">
            <label>Kiểu giải đấu (Format)</label>
            <select
              className="reg-select"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="single_elimination">Loại trực tiếp (Single Elimination)</option>
              <option value="round_robin">Đấu vòng tròn (Round Robin)</option>
            </select>
          </div>

          <div className="reg-field">
            <label>Chế mode thi đấu</label>
            <select
              className="reg-select"
              value={participantMode}
              onChange={(e) => setParticipantMode(e.target.value)}
            >
              <option value="INDIVIDUAL">Cá nhân 1v1</option>
              <option value="TEAM">Đội nhóm</option>
            </select>
          </div>
        </div>

        <div className="reg-field">
          <label>Hình thức khởi tranh</label>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <label className={`reg-lang ${startType === "AUTO" ? "is-checked" : ""}`}>
              <input
                type="radio"
                name="startType"
                checked={startType === "AUTO"}
                onChange={() => setStartType("AUTO")}
              />
              <span>⚡ Tự động</span>
            </label>
            <label className={`reg-lang ${startType === "MANUAL" ? "is-checked" : ""}`}>
              <input
                type="radio"
                name="startType"
                checked={startType === "MANUAL"}
                onChange={() => setStartType("MANUAL")}
              />
              <span>✋ Thủ công (chủ giải bấm)</span>
            </label>
          </div>
          <p className="reg-hint">
            {startType === "AUTO"
              ? "Giải tự động khởi tranh khi đến giờ hoặc đủ số người chơi tối đa."
              : "Chủ giải/người tổ chức cần bấm nút khởi tranh để bắt đầu giải."}
          </p>
        </div>

        {participantMode === "TEAM" && (
          <div className="form-grid-2">
            <div className="reg-field">
              <label>Số thành viên tối thiểu/đội</label>
              <input
                type="number"
                min={1}
                max={128}
                className="reg-input"
                value={minTeamSize}
                onChange={(e) => setMinTeamSize(e.target.value)}
                required
              />
            </div>
            <div className="reg-field">
              <label>Số thành viên tối đa/đội</label>
              <input
                type="number"
                min={1}
                max={128}
                className="reg-input"
                value={maxTeamSize}
                onChange={(e) => setMaxTeamSize(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        <div className="reg-field">
          <label>Ngôn ngữ bot được phép *</label>
          <div className="reg-lang-options">
            {BOT_LANGUAGES.map((option) => {
              const checked = languages.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`reg-lang ${checked ? "is-checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleLanguage(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          <p className="reg-hint">
            Bot dự thi phải viết bằng một trong các ngôn ngữ đã chọn.
          </p>
        </div>

        <div className="form-grid-2">
          <div className="reg-field">
            <label>Ngày bắt đầu *</label>
            <input
              type="date"
              className="reg-input"
              min={todayInputValue()}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="reg-field">
            <label>Giờ bắt đầu *</label>
            <input
              type="time"
              className="reg-input"
              value={startClock}
              onChange={(e) => setStartClock(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="reg-field">
          <label>Giải thưởng / Vinh danh</label>
          <input
            type="text"
            className="reg-input"
            placeholder="Ví dụ: Cúp vô địch, Vinh danh BXH"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
          />
        </div>

        <div className="reg-field">
          <label>Mô tả ngắn về giải đấu</label>
          <textarea
            className="reg-textarea"
            placeholder="Giải đấu dành cho ai, thể thức loại trực tiếp, cách tính điểm..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="reg-field">
          <label>Luật chơi (mỗi dòng một điều luật)</label>
          <textarea
            className="reg-textarea"
            rows={5}
            placeholder={"Ví dụ:\nMỗi trận đấu 1 ván, thắng đi tiếp\nKhông được gọi mạng trong lúc thi đấu\nTrọng tài là chủ giải"}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
          <p className="reg-hint">
            Người tham gia sẽ đọc phần luật này trong phòng chờ của giải, tối đa 20 dòng.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button
            type="submit"
            className="btn primary"
            style={{ padding: "10px 24px" }}
            disabled={creating}
          >
            {creating ? "Đang tạo giải…" : "🚀 Mở giải đấu"}
          </button>
          <button
            type="button"
            className="btn"
            onClick={onCancel}
          >
            Hủy
          </button>
        </div>
      </form>
    </div>
  );
}