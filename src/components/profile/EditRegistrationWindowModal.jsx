import { useState } from "react";
import Modal from "../tournament/Modal.jsx";
import { updateRegistrationWindow } from "../../api.js";
import { apiErrorText, formatStartsAt } from "../../utils/tournamentApi.js";

const pad = (n) => String(n).padStart(2, "0");

// ISO -> giá trị cho ô nhập ngày + giờ (theo giờ máy người dùng).
function partsOf(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: "", clock: "" };
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    clock: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function toDate({ day, clock }) {
  if (!day || !clock) return null;
  const date = new Date(`${day}T${clock}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function DateTimeField({ id, label, value, onChange }) {
  return (
    <div className="tl-window-field">
      <label htmlFor={`${id}-day`}>
        {label} <b className="tl-form-req">*</b>
      </label>
      <div className="tl-window-pair">
        <input
          id={`${id}-day`}
          type="date"
          className="tl-window-input"
          value={value.day}
          onChange={(event) => onChange("day", event.target.value)}
        />
        <input
          type="time"
          aria-label={`${label} (giờ)`}
          className="tl-window-input"
          value={value.clock}
          onChange={(event) => onChange("clock", event.target.value)}
        />
      </div>
    </div>
  );
}

// Chủ giải sửa khung mở/đóng đơn. Giờ khởi tranh cài ở "Bảng điều khiển giải".
export default function EditRegistrationWindowModal({ tournament, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    open: partsOf(tournament.registrationOpensAt),
    close: partsOf(tournament.registrationClosesAt),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const setPart = (key, part, value) =>
    setForm((prev) => ({ ...prev, [key]: { ...prev[key], [part]: value } }));

  async function submit() {
    setError(null);
    const opensAt = toDate(form.open);
    const closesAt = toDate(form.close);
    if (!opensAt || !closesAt) {
      setError("Hãy chọn đủ ngày và giờ cho cả mở đơn lẫn đóng đơn.");
      return;
    }
    if (closesAt <= opensAt) {
      setError("Thời gian đóng đơn phải sau thời gian mở đơn.");
      return;
    }
    setBusy(true);
    try {
      onSaved(await updateRegistrationWindow(tournament.id, {
        registrationOpensAt: opensAt.toISOString(),
        registrationClosesAt: closesAt.toISOString(),
      }, token));
    } catch (err) {
      setError(apiErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Sửa khung mở / đóng đơn"
      subtitle={tournament.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="button" className="btn primary" onClick={submit} disabled={busy}>
            {busy ? "Đang lưu…" : "✔ Lưu khung thời gian"}
          </button>
        </>
      }
    >
      {error && <p className="err">{error}</p>}

      <p className="tl-window-current">
        Hiện tại: mở đơn <b>{formatStartsAt(tournament.registrationOpensAt)}</b> · đóng đơn{" "}
        <b>{formatStartsAt(tournament.registrationClosesAt)}</b>
      </p>

      <DateTimeField
        id="tl-window-open"
        label="Ngày mở đơn"
        value={form.open}
        onChange={(part, value) => setPart("open", part, value)}
      />
      <DateTimeField
        id="tl-window-close"
        label="Ngày đóng đơn"
        value={form.close}
        onChange={(part, value) => setPart("close", part, value)}
      />

      <p className="tl-form-note">
        Đổi khung này sẽ cập nhật lịch hiển thị ở mọi nơi (danh sách giải, phòng chờ, trang cá nhân)
        và cổng nhận đăng ký ngay lập tức.
      </p>
      <p className="tl-form-note">
        ⏳ Giờ khởi tranh và lịch từng vòng đặt trong "Bảng điều khiển giải".
      </p>
    </Modal>
  );
}
