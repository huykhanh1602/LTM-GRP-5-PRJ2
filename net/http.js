import http from "node:http";
import { randomInt } from "node:crypto";
import { StorageError } from "./storage/matchStore.js";
import { applyCorsHeaders, handleCorsPreflight } from "./cors.js";

const BOT_LANGUAGES = ["python", "javascript", "cpp"];
const TOURNAMENT_FORMATS = ["single_elimination", "round_robin", "swiss"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function readBodyText(request, maxBytes = 64 * 1024) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > maxBytes) throw new StorageError("BODY_TOO_LARGE", "Request body is too large", 413);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request, maxBytes = 64 * 1024, { allowEmpty = false } = {}) {
    const text = await readBodyText(request, maxBytes);
    if (!text.trim()) {
        if (allowEmpty) return {};
        throw new StorageError("INVALID_JSON", "Request body must be a JSON object", 400);
    }
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON object required");
        return value;
    } catch {
        throw new StorageError("INVALID_JSON", "Request body must be a JSON object", 400);
    }
}

function decodePathId(value) {
    try { return decodeURIComponent(value); }
    catch { throw new StorageError("INVALID_INPUT", "Invalid resource ID"); }
}

function limitedText(value, field, maxLength) {
    if (typeof value !== "string") throw new StorageError("INVALID_INPUT", `${field} phải là chuỗi`);
    if (value.length > maxLength) throw new StorageError("INVALID_INPUT", `${field} tối đa ${maxLength} ký tự`);
    return value.trim();
}

function randomCode(prefix) {
    let suffix = "";
    for (let index = 0; index < 4; index += 1) suffix += CODE_CHARS[randomInt(CODE_CHARS.length)];
    return `${prefix}${prefix ? "-" : ""}${suffix}`.slice(0, 24);
}

// Luật/mô tả/ngôn ngữ do người tạo giải khai báo, lưu trong config của giải.
function buildTournamentConfig(body, organizer) {
    const config = {
        organizerId: organizer.id,
        organizerName: organizer.display_name ?? organizer.id,
    };
    if (body.description !== undefined) config.description = limitedText(body.description, "description", 1000);
    if (body.prize !== undefined) config.prize = limitedText(body.prize, "prize", 120);
    if (body.rules !== undefined) {
        if (!Array.isArray(body.rules) || body.rules.length > 20 ||
            body.rules.some((rule) => typeof rule !== "string" || rule.length > 300)) {
            throw new StorageError("INVALID_INPUT", "rules phải là danh sách tối đa 20 dòng, mỗi dòng tối đa 300 ký tự");
        }
        config.rules = body.rules.map((rule) => rule.trim()).filter(Boolean);
    }
    if (body.languages !== undefined) {
        if (!Array.isArray(body.languages) || body.languages.length === 0 ||
            !body.languages.every((language) => BOT_LANGUAGES.includes(language))) {
            throw new StorageError("INVALID_INPUT", `languages phải thuộc ${BOT_LANGUAGES.join(", ")}`);
        }
        config.languages = [...new Set(body.languages)];
    }
    if (body.maxParticipants !== undefined) {
        const max = Number(body.maxParticipants);
        if (!Number.isSafeInteger(max) || max < 2 || max > 128) {
            throw new StorageError("INVALID_INPUT", "maxParticipants phải là số nguyên từ 2 đến 128");
        }
        config.maxParticipants = max;
    }
    return config;
}

function buildTournamentInput(body, actor) {
    const name = limitedText(body.name ?? "", "name", 100);
    if (!name) throw new StorageError("INVALID_INPUT", "name không được để trống");
    const format = body.format ?? "single_elimination";
    if (!TOURNAMENT_FORMATS.includes(format)) throw new StorageError("INVALID_INPUT", "format không hợp lệ");
    const gameId = body.gameId ?? body.game_id ?? "rps_chess";
    const startsAt = body.startsAt ?? body.starts_at ?? null;
    if (startsAt !== null && Number.isNaN(new Date(startsAt).getTime())) {
        throw new StorageError("INVALID_INPUT", "startsAt không hợp lệ");
    }
    let code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    if (code && !/^[A-Z0-9-]{3,24}$/.test(code)) throw new StorageError("INVALID_INPUT", "code không hợp lệ");
    const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
        .toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 14);
    if (!code) code = randomCode(slug);
    return {
        code,
        codeSlug: slug,
        name,
        gameId,
        format,
        startsAt,
        status: body.status === "draft" ? "draft" : "open",
        config: buildTournamentConfig(body, actor),
    };
}

export function createHttpServer({ matchStore, roomGateway, authService, authenticate = null } = {}) {
    const server = http.createServer(async (request, response) => {
        // Áp dụng CORS cho MỌI response: các route bên dưới chỉ cần gọi writeHead
        // (kèm Content-Type) là đã kế thừa đầy đủ bộ CORS headers này.
        applyCorsHeaders(request, response);

        // Preflight request: trả 204 ngay, không cần đi vào các route.
        if (handleCorsPreflight(request, response)) return;

        const url = new URL(request.url, "http://localhost");

        if (authService && (url.pathname === "/api/me" || url.pathname.startsWith("/api/auth/"))) {
            authService
                .handle(request, response, url)
                .then((handled) => {
                    if (!handled && !response.headersSent) {
                        response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
                        response.end(JSON.stringify({ error: "NOT_FOUND" }));
                    }
                })
                .catch((error) => {
                    console.error("Auth error:", error);
                    if (!response.headersSent) {
                        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
                        response.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
                    }
                });
            return;
        }

        if (url.pathname.startsWith("/api/rooms/")) {
            if (!roomGateway) {
                response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "ROOM_SERVICE_UNAVAILABLE" }));
                return;
            }
            void roomGateway
                .handleSubmission(request, response, url)
                .then((handled) => {
                    if (!handled && !response.headersSent) {
                        response.writeHead(404, {
                            "Content-Type": "application/json; charset=utf-8",
                        });
                        response.end(JSON.stringify({ error: "NOT_FOUND" }));
                    }
                })
                .catch((error) => {
                    console.error("Room submission error:", error);
                    if (!response.headersSent) {
                        response.writeHead(500, {
                            "Content-Type": "application/json; charset=utf-8",
                        });
                        response.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
                    }
                });
            return;
        }

        if (url.pathname.startsWith("/api/")) {
            const send = (status, body) => {
                response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify(body));
            };
            if (!matchStore) {
                send(503, { error: "STORAGE_UNAVAILABLE" });
                return;
            }
            try {
                const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
                const user = authenticate ? await authenticate(request) : await authService?.userForToken(token);
                request.auth = user?.user ? user : { user };
                if (request.auth.user && matchStore.upsertUser) {
                    request.auth.user = await matchStore.upsertUser(request.auth.user);
                }
            } catch (error) {
                console.error("Authentication error:", error);
                send(401, { error: "AUTHENTICATION_FAILED" });
                return;
            }
            const organizerRoute = url.pathname.match(/^\/api\/tournaments(?:\/([^/]+)\/(rounds|status|matches|start))?$/);
            const entryRoute = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/entries$/);
            const slotRoute = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/rounds\/(\d+)\/slots\/(\d+)\/result$/);
            const isCreate = url.pathname === "/api/tournaments" && request.method === "POST";
            const isEntry = Boolean(entryRoute) && request.method === "POST";
            const isSlotResult = Boolean(slotRoute) && request.method === "POST";
            const isOrganizerAction = Boolean(organizerRoute?.[2]) && ["POST", "PATCH"].includes(request.method);
            if (isCreate || isEntry || isSlotResult || isOrganizerAction) {
                const actor = request.auth?.user;
                if (!actor?.id) { send(401, { error: "AUTHENTICATION_REQUIRED" }); return; }
                if (actor.banned) { send(403, { error: "USER_BANNED" }); return; }
                try {
                    const body = await readJsonBody(request, 64 * 1024, { allowEmpty: true });
                    if (isCreate) {
                        const { codeSlug, ...input } = buildTournamentInput(body, actor);
                        const autoCode = body.code === undefined;
                        let tournament = null;
                        for (let attempt = 0; attempt < 4 && !tournament; attempt += 1) {
                            try {
                                tournament = await matchStore.createTournament(input);
                            } catch (error) {
                                // Mã sinh tự động có thể trùng: thử mã khác.
                                if (!autoCode || !(error instanceof StorageError) || error.code !== "TOURNAMENT_EXISTS") throw error;
                                input.code = randomCode(codeSlug);
                            }
                        }
                        if (!tournament) throw new StorageError("TOURNAMENT_EXISTS", "Tournament code already exists", 409);
                        response.setHeader("Location", `/api/tournaments/${encodeURIComponent(tournament.id)}`);
                        send(201, tournament); return;
                    }
                    if (isEntry) {
                        const entry = await matchStore.addTournamentEntry(decodePathId(entryRoute[1]),
                            { seed: body.seed ?? null, userId: actor.id });
                        send(201, entry); return;
                    }

                    // Các thao tác điều hành giải: chỉ chủ giải hoặc admin.
                    const id = decodePathId(isSlotResult ? slotRoute[1] : organizerRoute[1]);
                    if (isOrganizerAction || isSlotResult) {
                        const target = await matchStore.getTournament(id);
                        const owner = target.config?.organizerId;
                        if (actor.role !== "admin" && owner && owner !== actor.id) {
                            send(403, { error: "ORGANIZER_REQUIRED", message: "Chỉ người tổ chức giải mới được thao tác" }); return;
                        }
                        if (!owner && !["organizer", "admin"].includes(actor.role)) {
                            send(403, { error: "ORGANIZER_REQUIRED" }); return;
                        }
                    }

                    if (isSlotResult) {
                        send(200, await matchStore.attachSlotResult(id, {
                            roundNo: Number(slotRoute[2]),
                            slotIndex: Number(slotRoute[3]),
                            matchId: body.match_id ?? body.matchId,
                        }));
                        return;
                    }
                    if (organizerRoute[2] === "start" && request.method === "POST") {
                        send(200, await matchStore.generateTournamentBracket(id)); return;
                    }
                    if (organizerRoute[2] === "rounds" && request.method === "POST") {
                        send(201, await matchStore.createTournamentRound(id, body)); return;
                    }
                    if (organizerRoute[2] === "matches" && request.method === "POST") {
                        send(201, await matchStore.recordTournamentMatch({
                            tournamentId:id, roundId:body.round_id, matchId:body.match_id ?? null,
                            participantAId:body.participant_a_id, participantAName:body.participant_a_name,
                            participantBId:body.participant_b_id, participantBName:body.participant_b_name,
                            winnerId:body.winner_id ?? null, result:body.result ?? null, playedAt:body.played_at,
                        })); return;
                    }
                    if (organizerRoute[2] === "status" && request.method === "PATCH") {
                        send(200, await matchStore.updateTournamentStatus(id, body.status, body.champion_id ?? null)); return;
                    }
                } catch (error) {
                    if (!(error instanceof StorageError)) console.error("Tournament API error:", error);
                    send(error instanceof StorageError ? error.status : 500, {
                        error: error instanceof StorageError ? error.code : "INTERNAL_ERROR",
                        message: error instanceof StorageError ? error.message : "Unable to update tournament",
                    });
                }
                return;
            }
            if (request.method !== "GET") {
                response.setHeader("Allow", "GET, POST, PATCH");
                send(405, { error: "METHOD_NOT_ALLOWED" });
                return;
            }
            try {
            if (url.pathname === "/api/me") {
                    send(200, { authenticated: request.auth?.user != null, user: request.auth?.user ?? null }); return;
                }
                if (url.pathname === "/api/games") {
                    send(200, { items: await matchStore.listGames() });
                    return;
                }
                if (url.pathname === "/api/tournaments") {
                    send(200, await matchStore.listTournaments({
                        status: url.searchParams.get("status") ?? undefined,
                        limit: url.searchParams.get("limit"),
                        offset: url.searchParams.get("offset"),
                    }));
                    return;
                }
                const tournamentRoute = url.pathname.match(/^\/api\/tournaments\/([^/]+)$/);
                if (tournamentRoute) {
                    send(200, await matchStore.getTournament(decodePathId(tournamentRoute[1])));
                    return;
                }
                const userRoute = url.pathname.match(/^\/api\/users\/([^/]+)$/);
                if (userRoute) {
                    send(200, await matchStore.getUserPublicProfile(decodePathId(userRoute[1])));
                    return;
                }
                if (url.pathname === "/api/rankings") {
                    send(200, {
                        items: await matchStore.getRankings(),
                        scoring: { win: 3, draw: 1, loss: 0 },
                    });
                    return;
                }
                if (url.pathname === "/api/matches") {
                    send(
                        200,
                        await matchStore.listMatches({
                            teamId: url.searchParams.get("teamId") ?? undefined,
                            status: url.searchParams.get("status") ?? undefined,
                            limit: url.searchParams.get("limit"),
                            offset: url.searchParams.get("offset"),
                        }),
                    );
                    return;
                }
                const route = url.pathname.match(/^\/api\/matches\/([^/]+)(\/replay)?$/);
                if (route) {
                    let id;
                    try {
                        id = decodeURIComponent(route[1]);
                    } catch {
                        throw new StorageError("INVALID_INPUT", "Invalid match ID");
                    }
                    send(200, await (route[2] ? matchStore.getReplay(id) : matchStore.getMatch(id)));
                    return;
                }
                send(404, { error: "NOT_FOUND" });
            } catch (error) {
                if (!(error instanceof StorageError)) console.error("Storage API error:", error);
                send(error instanceof StorageError ? error.status : 500, {
                    error: error instanceof StorageError ? error.code : "INTERNAL_ERROR",
                    message:
                        error instanceof StorageError ? error.message : "Unable to read match data",
                });
            }
            return;
        }

        // Kiểm tra server còn hoạt động hay không.
        if (request.method === "GET" && url.pathname === "/health") {
            response.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
            });

            response.end(
                JSON.stringify({
                    status: "ok",
                    message: "Game server is running",
                }),
            );

            return;
        }

        // Các đường dẫn chưa được hỗ trợ.
        response.writeHead(404, {
            "Content-Type": "application/json; charset=utf-8",
        });

        response.end(
            JSON.stringify({
                error: "NOT_FOUND",
                message: "Endpoint not found",
            }),
        );
    });

    return server;
}
