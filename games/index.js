import { manifest as rpsChess } from './rps-chess/manifest.js';
import { manifest as snakeBattle } from './snake/manifest.js';

// Danh sách tường minh để bundler/backend cùng đọc.
// Thêm game mới: tạo games/<id>/manifest.js rồi thêm vào đây.
export const GAME_MANIFESTS = Object.freeze([rpsChess, snakeBattle]);
