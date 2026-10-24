// Cấu hình CORS dùng chung cho toàn bộ HTTP API.
//
// Frontend (ví dụ https://ltm-grp-5-prj-2.vercel.app) gọi API là cross-origin,
// nên mọi response HTTP - bao gồm cả preflight `OPTIONS` - đều phải mang đầy đủ
// bộ CORS headers, nếu không trình duyệt sẽ chặn request.
//
// Cho phép ghi đè origin bằng biến môi trường CORS_ORIGIN (mặc định là "*").

const ALLOW_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOW_HEADERS = "Content-Type, Authorization, X-Requested-With";
const MAX_AGE = "86400";

export function resolveAllowOrigin(request) {
    const configured = process.env.CORS_ORIGIN?.trim();
    // Nếu cấu hình là "*" (hoặc rỗng) thì luôn trả về "*".
    if (configured && configured !== "*") return configured;
    // Mặc định: phản chiếu lại origin của request để hỗ trợ nhiều domain.
    const origin = request?.headers?.origin;
    return typeof origin === "string" && origin.length > 0 ? origin : "*";
}

/**
 * Thiết lập bộ CORS headers cho một response HTTP.
 * Dùng `setHeader` nên các lời gọi `writeHead(...)` sau đó (chỉ set Content-Type)
 * vẫn giữ nguyên các header này.
 */
export function applyCorsHeaders(request, response) {
    response.setHeader("Access-Control-Allow-Origin", resolveAllowOrigin(request));
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
    response.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
    response.setHeader("Access-Control-Max-Age", MAX_AGE);
    return response;
}

/**
 * Xử lý preflight request (`OPTIONS`).
 * Trả về `true` nếu request đã được xử lý xong (đã gửi 204 và kết thúc response).
 */
export function handleCorsPreflight(request, response) {
    if (request.method !== "OPTIONS") return false;
    applyCorsHeaders(request, response);
    response.writeHead(204);
    response.end();
    return true;
}

export const CORS_METHODS = ALLOW_METHODS;
export const CORS_HEADERS = ALLOW_HEADERS;
export const CORS_MAX_AGE = MAX_AGE;
