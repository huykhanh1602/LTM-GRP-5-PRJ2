import { useSyncExternalStore } from "react";
import { sound } from "../audio/soundManager.js";

// Trả về { muted, volume, setMuted, toggleMuted, setVolume, play, setBgm }
export function useSound() {
  const { muted, volume } = useSyncExternalStore(sound.subscribe, sound.getSnapshot, sound.getSnapshot);
  return {
    muted,
    volume,
    setMuted: sound.setMuted.bind(sound),
    toggleMuted: sound.toggleMuted.bind(sound),
    setVolume: sound.setVolume.bind(sound),
    play: sound.play.bind(sound),
    setBgm: sound.setBgm.bind(sound),
  };
}
