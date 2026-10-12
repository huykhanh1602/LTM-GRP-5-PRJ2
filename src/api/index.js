import sampleReplay from "../mock/sample-v2.json";
import { createMockChannel } from "./mockServer.js";
import { createSocketChannel } from "./socket.js";

// Cấu hình qua file .env ở gốc project; VITE_USE_MOCK=true để dùng server giả.
const defaultWsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
export const WS_URL =
  import.meta.env.VITE_WS_URL || `${defaultWsProtocol}//${window.location.hostname}:3000`;
export const API_URL = import.meta.env.VITE_API_URL ?? "";
export const MOCK = import.meta.env.VITE_USE_MOCK === "true";

export function connect(params) {
  if (MOCK) return createMockChannel({ ...params, replay: sampleReplay });
  return createSocketChannel({ ...params, wsUrl: WS_URL, httpUrl: API_URL });
}
