import http from "node:http";
import { StorageError } from "./storage/matchStore.js";
import { applyCorsHeaders, handleCorsPreflight } from "./cors.js";

async function readJsonBody(request, maxBytes = 64 * 1024) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
        length += chunk.length;
        if (length > maxBytes) throw new StorageError("BODY_TOO_LARGE", "Request body is too large", 413);
        chunks.push(chunk);
    }
    try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
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
            const organizerRoute = url.pathname.match(/^\/api\/tournaments(?:\/([^/]+)\/(rounds|status|matches))?$/);
            const entryRoute = url.pathname.match(/^\/api\/tournaments\/([^/]+)\/entries$/);
            if ((url.pathname === "/api/tournaments" && request.method === "POST") ||
                (organizerRoute && organizerRoute[2] && ["POST", "PATCH"].includes(request.method)) ||
                (entryRoute && request.method === "POST")) {
                const actor = request.auth?.user;
                if (!actor?.id) { send(401, { error: "AUTHENTICATION_REQUIRED" }); return; }
                if (actor.banned) { send(403, { error: "USER_BANNED" }); return; }
                if (url.pathname === "/api/tournaments" || organizerRoute?.[2] === "rounds" || organizerRoute?.[2] === "status" || organizerRoute?.[2] === "matches") {
                    if (!["organizer", "admin"].includes(actor.role)) {
                        send(403, { error: "ORGANIZER_REQUIRED" }); return;
                    }
                }
                try {
                    const body = await readJsonBody(request);
                    if (url.pathname === "/api/tournaments") {
                        const tournament = await matchStore.createTournament(body);
                        response.setHeader("Location", `/api/tournaments/${encodeURIComponent(tournament.id)}`);
                        send(201, tournament); return;
                    }
                    if (entryRoute) {
                        const entry = await matchStore.addTournamentEntry(decodePathId(entryRoute[1]),
                            { seed: body.seed ?? null, userId: actor.id });
                        send(201, entry); return;
                    }
                    const id = decodePathId(organizerRoute[1]);
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
