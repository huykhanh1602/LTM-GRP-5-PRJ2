import sampleReplay from "../mock/sample-v2.json";
import { createMockChannel } from "./mockServer.js";
import { createSocketChannel } from "./socket.js";

// Cấu hình qua file .env ở gốc project:
//   VITE_WS_URL=ws://localhost:8000      (địa chỉ WebSocket)
//   VITE_API_URL=http://localhost:8000   (địa chỉ HTTP nộp code)
// Không đặt VITE_WS_URL thì dùng server giả.
export const WS_URL = import.meta.env.VITE_WS_URL;
export const API_URL = import.meta.env.VITE_API_URL ?? "";
export const MOCK = !WS_URL;

export function connect(params) {
  if (MOCK) return createMockChannel({ ...params, replay: sampleReplay });
  return createSocketChannel({ ...params, wsUrl: WS_URL, httpUrl: API_URL });
}
