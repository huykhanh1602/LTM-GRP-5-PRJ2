import http from "node:http";
import { StorageError } from './storage/matchStore.js';

export function createHttpServer({ matchStore, roomGateway } = {}) {
    const server = http.createServer((request, response) => {
        const url = new URL(
            request.url,
            "http://localhost"
        );

        if (url.pathname.startsWith("/api/rooms/")) {
            if (!roomGateway) {
                response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
                response.end(JSON.stringify({ error: "ROOM_SERVICE_UNAVAILABLE" }));
                return;
            }
            void roomGateway.handleSubmission(request, response, url).then((handled) => {
                if (!handled && !response.headersSent) {
                    response.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
                    response.end(JSON.stringify({ error: "NOT_FOUND" }));
                }
            }).catch((error) => {
                console.error("Room submission error:", error);
                if (!response.headersSent) {
                    response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
                    response.end(JSON.stringify({ error: "INTERNAL_ERROR" }));
                }
            });
            return;
        }

        if (url.pathname.startsWith('/api/')) {
            const send = (status, body) => {
                response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
                response.end(JSON.stringify(body));
            };
            if (request.method !== 'GET') {
                response.setHeader('Allow', 'GET');
                send(405, { error: 'METHOD_NOT_ALLOWED' });
                return;
            }
            if (!matchStore) { send(503, { error: 'STORAGE_UNAVAILABLE' }); return; }
            try {
                if (url.pathname === '/api/rankings') {
                    send(200, { items: matchStore.getRankings(), scoring: { win: 3, draw: 1, loss: 0 } });
                    return;
                }
                if (url.pathname === '/api/matches') {
                    send(200, matchStore.listMatches({
                        teamId: url.searchParams.get('teamId') ?? undefined,
                        status: url.searchParams.get('status') ?? undefined,
                        limit: url.searchParams.get('limit'), offset: url.searchParams.get('offset'),
                    }));
                    return;
                }
                const route = url.pathname.match(/^\/api\/matches\/([^/]+)(\/replay)?$/);
                if (route) {
                    let id;
                    try { id = decodeURIComponent(route[1]); }
                    catch { throw new StorageError('INVALID_INPUT', 'Invalid match ID'); }
                    send(200, route[2] ? matchStore.getReplay(id) : matchStore.getMatch(id));
                    return;
                }
                send(404, { error: 'NOT_FOUND' });
            } catch (error) {
                if (!(error instanceof StorageError)) console.error('Storage API error:', error);
                send(error instanceof StorageError ? error.status : 500,
                    { error: error instanceof StorageError ? error.code : 'INTERNAL_ERROR',
                      message: error instanceof StorageError ? error.message : 'Unable to read match data' });
            }
            return;
        }

        // Kiểm tra server còn hoạt động hay không.
        if (
            request.method === "GET" &&
            url.pathname === "/health"
        ) {
            response.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
            });

            response.end(
                JSON.stringify({
                    status: "ok",
                    message: "Game server is running",
                })
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
            })
        );
    });

    return server;
}
