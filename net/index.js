import config from "./config.js";
import { createHttpServer } from "./http.js";
import { createRegistry } from "./registry.js";
import { createBotGateway } from "./botGateway.js";
import { createSpectatorGateway } from "./spectatorGateway.js";
import { createOrchestrator } from "./orchestrator.js";
import { createStorage } from './storage/index.js';
import { createRoomGateway } from "./roomGateway.js";
import { createAuthService } from "./auth/authService.js";
import { createWsGateway } from "./wsGateway.js";

const matchStore = await createStorage();
await matchStore.abortInterruptedMatches();
const registry = createRegistry();
const roomGateway = createRoomGateway({ matchStore });
const authService = createAuthService({ storage: matchStore });
const wsGateway = createWsGateway({
    sessions: authService.sessions,
    users: authService.users,
    matchStore,
});
const server = createHttpServer({ matchStore, roomGateway, authService });

const botGateway = createBotGateway(server, registry);

const spectatorGateway = createSpectatorGateway(
    server,
    registry
);

const orchestrator = createOrchestrator(
    registry,
    spectatorGateway,
    matchStore
);

// Khi một bot đăng ký thành công, kiểm tra xem phòng đã đủ hai đội chưa.
botGateway.setBotRegisteredHandler(
    orchestrator.onBotRegistered
);

// Cho phép khán giả nhận trạng thái hiện tại của phòng.
spectatorGateway.setRoomInfoProvider(
    orchestrator.getRoomInfo
);

// Định tuyến kết nối WebSocket.
server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(
        request.url,
        "http://localhost"
    ).pathname;

    if (pathname === "/bot") {
        botGateway.handleUpgrade(request, socket, head);
        return;
    }

    if (pathname === "/spectator") {
        spectatorGateway.handleUpgrade(request, socket, head);
        return;
    }

    if (wsGateway.handleUpgrade(request, socket, head)) {
        return;
    }

    if (roomGateway.handleUpgrade(request, socket, head)) {
        return;
    }

    socket.destroy();
});

// Khởi động server.
server.listen(config.port,"0.0.0.0", () => {
    console.log(
        `Game server is running on port ${config.port}`
    );

    console.log(
        `Health check: http://localhost:${config.port}/health`
    );

    console.log(
        `Bot WebSocket: ws://localhost:${config.port}/bot`
    );

    console.log(
        `Spectator WebSocket: ws://localhost:${config.port}/spectator`
    );
    console.log(
        `Room WebSocket (v1): ws://localhost:${config.port}/rooms/<ROOM_CODE>`
    );
    console.log(
        `Platform WebSocket (v2): ws://localhost:${config.port}/ws`
    );
});

server.on("error", (error) => {
    console.error("HTTP server error:", error.message);
});

export {
    server,
    registry,
    botGateway,
    spectatorGateway,
    orchestrator,
    roomGateway,
    wsGateway,
    authService,
};
