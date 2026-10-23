// soundManager.js — âm thanh toàn cục (SFX + BGM) cho Đấu Trường Kéo Búa Bao.
// Singleton: import { sound } rồi gọi sound.play("click") / sound.setBgm("lobby").
// File nằm trong public/Sound (SFX) và public/Music (BGM). Đổi tên file chỉ cần sửa 2 map dưới.

const SFX_SRC = {
  click:       "/Sound/click.ogg",
  move:        "/Sound/move.ogg",
  capture:     "/Sound/capture.ogg",
  eat:         "/Sound/eat.ogg",
  crash:       "/Sound/crash.ogg",
  hit:         "/Sound/hit.ogg",
  scare:       "/Sound/scare.ogg",
  reveal:      "/Sound/reveal.ogg",
  draw:        "/Sound/draw.ogg",
  win:         "/Sound/win.ogg",
  lose:        "/Sound/lose.ogg",
  match_found: "/Sound/match_found.mp3",
  countdown:   "/Sound/countdown.mp3",
  trap:        "/Sound/trap.mp3",
};

const BGM_SRC = {
  lobby:     "/Music/bgm_lobby.mp3",      // trang chủ
  pc:        "/Music/bgm_pc.mp3",         // vào 1 game, loop tới hết đếm 3-2-1
  battle_rsm:  "/Music/bgm_battle_rsm.mp3", // trận game Rắn
  battle_kbb:  "/Music/bgm_battle_kbb.mp3", // trận game Kéo Búa Bao
};

const LS_KEY = "botvui.sound.v1";

function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}

class SoundManager {
  constructor() {
    const s = load();
    this.muted = !!s.muted;
    this.volume = typeof s.volume === "number" ? Math.min(1, Math.max(0, s.volume)) : 0.7;
    this.bgmEl = null;
    this.bgmKey = null;
    this.bgmWant = "lobby";
    this._unlocked = false;
    this._listeners = new Set();
    this._snapshot = { muted: this.muted, volume: this.volume };
    this._armUnlock();
  }

  // --- React store (useSyncExternalStore) ---
  subscribe = (fn) => { this._listeners.add(fn); return () => this._listeners.delete(fn); };
  getSnapshot = () => this._snapshot;
  _emit() {
    this._snapshot = { muted: this.muted, volume: this.volume };
    this._listeners.forEach((f) => f());
  }
  _persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ muted: this.muted, volume: this.volume })); } catch {}
  }

  // --- Cài đặt ---
  setMuted(m) {
    this.muted = !!m;
    this._persist();
    this._emit();
    if (this.muted) { this.bgmEl?.pause(); }
    else { this._tryBgm(); }
  }
  toggleMuted() { this.setMuted(!this.muted); }
  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    this._persist();
    this._emit();
    if (this.bgmEl) this.bgmEl.volume = this.muted ? 0 : this.volume;
  }

  // --- Hiệu ứng âm thanh ---
  play(name) {
    if (this.muted) return;
    const src = SFX_SRC[name];
    if (!src) return;
    const a = new Audio(src);
    a.volume = this.volume;
    a.play().catch(() => {});
  }

  // --- Nhạc nền ---
  setBgm(key) {
    if (key === this.bgmWant) return;
    this.bgmWant = key;
    this._tryBgm();
  }
  _tryBgm() {
    if (!this._unlocked) return; // chờ thao tác đầu tiên của người dùng (autoplay policy)
    const key = this.bgmWant;
    if (!key) { this.bgmEl?.pause(); this.bgmEl = null; this.bgmKey = null; return; }
    if (this.bgmKey === key && this.bgmEl) {
      this.bgmEl.volume = this.muted ? 0 : this.volume;
      if (!this.muted && this.bgmEl.paused) this.bgmEl.play().catch(() => {});
      return;
    }
    this.bgmEl?.pause();
    const src = BGM_SRC[key];
    if (!src) { this.bgmEl = null; this.bgmKey = null; return; }
    const a = new Audio(src);
    a.loop = true;
    a.volume = this.muted ? 0 : this.volume;
    this.bgmEl = a;
    this.bgmKey = key;
    a.play().catch(() => {});
  }
  _armUnlock() {
    if (typeof window === "undefined") return;
    const unlock = () => {
      this._unlocked = true;
      this._tryBgm();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
  }
}

export const sound = new SoundManager();
export { SFX_SRC, BGM_SRC };
