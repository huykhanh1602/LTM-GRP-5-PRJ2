import test from "node:test";
import assert from "node:assert/strict";

import { createHttpServer } from "../net/http.js";
import { createRoomGateway } from "../net/roomGateway.js";

const FRONTEND_ORIGIN = "https://ltm-grp-5-prj-2.vercel.app";
const EXPECTED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const EXPECTED_HEADERS = "Content-Type, Authorization, X-Requested-With";

async function withServer(t, { matchStore } = {}) {
    const roomGateway = createRoomGateway({});
    const server = createHttpServer({ matchStore, roomGateway });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const { port } = server.address();
    return `http://127.0.0.1:${port}`;
}

function assertCorsHeaders(headers, origin = FRONTEND_ORIGIN) {
    assert.equal(headers["access-control-allow-origin"], origin);
    assert.equal(headers["access-control-allow-methods"], EXPECTED_METHODS);
    assert.equal(headers["access-control-allow-headers"], EXPECTED_HEADERS);
    assert.equal(headers["access-control-max-age"], "86400");
}

test("OPTIONS preflight on submission endpoint returns 204 with CORS headers", async (t) => {
    const base = await withServer(t);
    const response = await fetch(`${base}/api/rooms/ABCD/submissions`, {
        method: "OPTIONS",
        headers: {
            Origin: FRONTEND_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type, authorization",
        },
    });

    assert.equal(response.status, 204);
    assertCorsHeaders(Object.fromEntries(response.headers));
    assert.equal(await response.text(), "");
});

test("OPTIONS preflight on every API prefix returns a CORS response", async (t) => {
    const base = await withServer(t);

    for (const path of [
        "/api/rankings",
        "/api/matches",
        "/api/bots/submit",
        "/api/rooms/ABCD/submissions",
    ]) {
        const response = await fetch(`${base}${path}`, {
            method: "OPTIONS",
            headers: { Origin: FRONTEND_ORIGIN },
        });
        assert.equal(response.status, 204, `preflight ${path}`);
        assertCorsHeaders(Object.fromEntries(response.headers));
    }
});

test("actual API responses inherit CORS headers", async (t) => {
    const matchStore = { getRankings: () => ({ team_a: 3 }), listMatches: () => ({ items: [] }) };
    const base = await withServer(t, { matchStore });

    const rankings = await fetch(`${base}/api/rankings`, { headers: { Origin: FRONTEND_ORIGIN } });
    assert.equal(rankings.status, 200);
    assertCorsHeaders(Object.fromEntries(rankings.headers));

    const submission = await fetch(`${base}/api/rooms/ABCD/submissions?filename=bot.py`, {
        method: "POST",
        headers: { Origin: FRONTEND_ORIGIN, "Content-Type": "text/plain" },
        body: "print('hi')",
    });
    assert.equal(submission.status, 401);
    assertCorsHeaders(Object.fromEntries(submission.headers));

    const notFound = await fetch(`${base}/api/unknown`, { headers: { Origin: FRONTEND_ORIGIN } });
    assert.equal(notFound.status, 404);
    assertCorsHeaders(Object.fromEntries(notFound.headers));
});

test("falls back to wildcard origin when no Origin header is present", async (t) => {
    const base = await withServer(t);
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
