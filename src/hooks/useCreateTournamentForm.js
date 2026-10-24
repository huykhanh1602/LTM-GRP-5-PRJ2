import { useEffect, useState } from "react";
import { GAME_CATALOG } from "../games/catalog.js";
import { createTournament, getGames } from "../api.js";
import { apiErrorText } from "../utils/tournamentApi.js";

// Quản lý toàn bộ state + submit của form "Mở giải đấu mới".
export function useCreateTournamentForm({ token, onOpenTournament }) {
  const [tourName, setTourName] = useState("");
  // Danh sách game hợp lệ lấy từ backend (đảm bảo game_id tồn tại trong DB).
  const [gameOptions, setGameOptions] = useState(
    GAME_CATALOG.map((g) => ({ id: g.id, name: g.name })),
  );
  const [selectedGame, setSelectedGame] = useState(GAME_CATALOG[0]?.id || "rps_chess");
  const [maxTeams, setMaxTeams] = useState(16);
  // Ngày mở/đóng đơn + ngày khởi tranh (AUTO).
  const [regOpenDate, setRegOpenDate] = useState("");
  const [regOpenClock, setRegOpenClock] = useState("");
  const [regCloseDate, setRegCloseDate] = useState("");
  const [regCloseClock, setRegCloseClock] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startClock, setStartClock] = useState("");
  const [languages, setLanguages] = useState(["python"]);
  const [rules, setRules] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);
  const [prize, setPrize] = useState("");
  const [description, setDescription] = useState("");
  const [format, setFormat] = useState("single_elimination");
  const [participantMode, setParticipantMode] = useState("INDIVIDUAL");
  const [minTeamSize, setMinTeamSize] = useState(1);
  const [maxTeamSize, setMaxTeamSize] = useState(5);
  const [startType, setStartType] = useState("AUTO");
  const [roundSubmissionMode, setRoundSubmissionMode] = useState("SINGLE");
  const [submissionWindowMinutes, setSubmissionWindowMinutes] = useState(10);
  const [msg, setMsg] = useState("");

  // Nạp danh sách game hợp lệ từ backend; nếu game đang chọn không tồn tại
  // (ví dụ "snake_battle" chưa seed trong bảng games) thì tự gán game_id hợp lệ.
  useEffect(() => {
    let active = true;
    getGames()
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        if (items.length === 0) return;
        const options = items.map((g) => ({ id: g.id, name: g.name || g.id }));
        setGameOptions(options);
        setSelectedGame((current) =>
          options.some((g) => g.id === current) ? current : options[0].id,
        );
      })
      .catch(() => { /* giữ danh sách mặc định khi API lỗi */ });
    return () => { active = false; };
  }, []);

  function toggleLanguage(id) {
    setLanguages((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  // Tạo giải đấu thật qua API
  async function handleCreateTour(e) {
    e.preventDefault();
    setFormError("");

    if (!token) return setFormError("Bạn cần đăng nhập để mở giải đấu.");
    if (!tourName.trim()) return setFormError("Vui lòng nhập tên giải đấu.");
    if (!regOpenDate || !regOpenClock) {
      return setFormError("Vui lòng chọn ngày và giờ mở đơn đăng ký.");
    }
    if (!regCloseDate || !regCloseClock) {
      return setFormError("Vui lòng chọn ngày và giờ đóng đơn đăng ký.");
    }
    const registrationOpensAt = new Date(`${regOpenDate}T${regOpenClock}`);
    const registrationClosesAt = new Date(`${regCloseDate}T${regCloseClock}`);
    if (Number.isNaN(registrationOpensAt.getTime()) || Number.isNaN(registrationClosesAt.getTime())) {
      return setFormError("Ngày mở đơn hoặc đóng đơn không hợp lệ.");
    }
    if (registrationClosesAt.getTime() <= registrationOpensAt.getTime()) {
      return setFormError("Thời gian đóng đơn phải sau thời gian mở đơn.");
    }
    // AUTO: ngày khởi tranh phải sau đóng đơn.
    let startsAt = null;
    if (startType === "AUTO") {
      if (!startDate || !startClock) {
        return setFormError("Giải tự động cần nhập ngày và giờ khởi tranh.");
      }
      startsAt = new Date(`${startDate}T${startClock}`);
      if (Number.isNaN(startsAt.getTime())) {
        return setFormError("Ngày khởi tranh không hợp lệ.");
      }
      if (startsAt.getTime() <= registrationClosesAt.getTime()) {
        return setFormError("Ngày khởi tranh phải sau thời gian đóng đơn.");
      }
    }
    if (languages.length === 0) {
      return setFormError("Hãy chọn ít nhất một ngôn ngữ cho bot dự thi.");
    }
    if (gameOptions.length === 0) {
      return setFormError("Chưa có game hợp lệ để tổ chức giải đấu.");
    }
    // Đảm bảo luôn gửi game_id hợp lệ đang tồn tại trong DB.
    const gameId = gameOptions.some((g) => g.id === selectedGame)
      ? selectedGame
      : gameOptions[0].id;

    const ruleLines = rules
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    setCreating(true);
    try {
      const created = await createTournament(
        {
          name: tourName.trim(),
          gameId,
          format,
          startsAt: startsAt ? startsAt.toISOString() : null,
          maxParticipants: Math.min(Math.max(Number(maxTeams) || 2, 2), 128),
          languages,
          rules: ruleLines,
          prize: prize.trim(),
          description: description.trim(),
          startType,
          config: {
            participantMode,
            registrationOpensAt: registrationOpensAt.toISOString(),
            registrationClosesAt: registrationClosesAt.toISOString(),
            minTeamSize: participantMode === "TEAM" ? Math.max(1, Number(minTeamSize) || 1) : 1,
            maxTeamSize: participantMode === "TEAM"
              ? Math.max(Number(maxTeamSize) || 5, Number(minTeamSize) || 1)
              : 1,
            roundSubmissionMode,
            submissionWindowMinutes: roundSubmissionMode === "PER_ROUND"
              ? Math.max(1, Math.min(60, Number(submissionWindowMinutes) || 10))
              : undefined,
          },
        },
        token,
      );
      setMsg(`🎉 Đã mở giải đấu "${created.name}" (mã ${created.code}).`);
      setTourName("");
      setRegOpenDate("");
      setRegOpenClock("");
      setRegCloseDate("");
      setRegCloseClock("");
      setStartDate("");
      setStartClock("");
      setLanguages(["python"]);
      setRules("");
      setPrize("");
      setDescription("");
      setTimeout(() => {
        setMsg("");
        onOpenTournament?.(created.id);
      }, 900);
    } catch (error) {
      setFormError(apiErrorText(error));
    } finally {
      setCreating(false);
    }
  }

  return {
    tourName,
    setTourName,
    gameOptions,
    setGameOptions,
    selectedGame,
    setSelectedGame,
    maxTeams,
    setMaxTeams,
    regOpenDate,
    setRegOpenDate,
    regOpenClock,
    setRegOpenClock,
    regCloseDate,
    setRegCloseDate,
    regCloseClock,
    setRegCloseClock,
    startDate,
    setStartDate,
    startClock,
    setStartClock,
    languages,
    setLanguages,
    toggleLanguage,
    rules,
    setRules,
    formError,
    setFormError,
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
    roundSubmissionMode,
    setRoundSubmissionMode,
    submissionWindowMinutes,
    setSubmissionWindowMinutes,
    msg,
    setMsg,
    handleCreateTour,
  };
}