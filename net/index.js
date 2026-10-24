import { Pool } from 'pg';

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
import { createEventBus } from "./application/EventBus.js";
import { createRatingService } from "./application/rating/RatingService.js";
import { createTournamentService } from "./application/tournament/TournamentService.js";
import { createTournamentScheduler } from "./application/tournament/TournamentScheduler.js";
import { createSingleEliminationFormat } from "./application/tournament/formats/singleElimination.js";
import { createRoundRobinFormat } from "./application/tournament/formats/roundRobin.js";

const databaseUrl = process.env.DATABASE_URL?.trim();

// ── Storage (match store) ──────────────────────────────────────
const matchStore = await createStorage();
await matchStore.abortInterruptedMatches();

// ── Rating Service ─────────────────────────────────────────────
let ratingService = null;
if (databaseUrl) {
  const { createPostgresRatingRepository } = await import(
    './infrastructure/persistence/postgres/PostgresRatingRepository.js'
  );
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
  });
  const ratingRepo = createPostgresRatingRepository({ pool });
  ratingService = createRatingService({ repository: ratingRepo });
} else {
  const { createSqliteRatingRepository } = await import(
    './infrastructure/persistence/sqlite/SqliteRatingRepository.js'
  );
  // Elo must survive backend restarts just like match history and accounts.
  const ratingRepo = createSqliteRatingRepository();
  ratingService = createRatingService({ repository: ratingRepo });
}

// ── Tournament Service ─────────────────────────────────────────
let tournamentService = null;
let tournamentScheduler = null;
const events = createEventBus();

if (databaseUrl) {
  const { createPostgresTournamentRepository } = await import(
    './infrastructure/persistence/postgres/PostgresTournamentRepository.js'
  );
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: false },
  });
  const tournamentRepo = createPostgresTournamentRepository({ pool });
  const formats = new Map();
  formats.set('single_elimination', createSingleEliminationFormat());
  formats.set('round_robin', createRoundRobinFormat());

  tournamentService = createTournamentService({
    tournaments: tournamentRepo,
    matchQueue: {
      async enqueue(job) {
        console.log(`[Tournament] Enqueue match ${job.matchId} for tournament ${job.tournamentId}`);
        // Trong tương lai: đẩy vào hàng đợi thực tế để engine chạy.
      },
    },
    formats,
    events,
  });

  tournamentScheduler = createTournamentScheduler({
    events,
    tournaments: tournamentRepo,
    tournamentService,
  });
  tournamentScheduler.start();
}

// ── Gateways ───────────────────────────────────────────────────
const registry = createRegistry();
const roomGateway = createRoomGateway({ matchStore });
const authService = createAuthService({ storage: matchStore });
const wsGateway = createWsGateway({
    sessions: authService.sessions,
    users: authService.users,
    matchStore,
    ratingService,
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

// ── Phát sự kiện MATCH_FINISHED khi orchestrator kết thúc trận ─
const originalStopRoom = orchestrator.stopRoom;
orchestrator.stopRoom = async function(roomId, result) {
  const room = orchestrator.getRoom(roomId);
  const matchId = room?.matchId;
  const outcome = await originalStopRoom(roomId, result);
  if (outcome && matchId) {
    events.emit('MATCH_FINISHED', {
      matchId,
      result: result ?? {},
    });
  }
  return outcome;
};

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

// ── Bộ đếm giờ khởi tranh AUTO (System A) ──
// Quét giải AUTO tới hạn + đã đóng đơn + chưa có sơ đồ → tự gen nhánh.
const AUTO_START_INTERVAL_MS = 30_000;
setInterval(async () => {
  try {
    const due = await matchStore.listAutoStartDue();
    for (const tournamentId of due) {
      try {
        await matchStore.generateTournamentBracket(tournamentId);
        console.log(`[AutoStart] Đã khởi tranh giải ${tournamentId}`);
      } catch (error) {
        console.error(`[AutoStart] Bỏ qua giải ${tournamentId}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`[AutoStart] Lỗi quét: ${error.message}`);
  }

  // Mở các vòng đấu AUTO tới giờ đã set (vòng trước đã xong).
  try {
    const dueRounds = await matchStore.listRoundsDueToStart();
    for (const { id, tournament_id, round_no } of dueRounds) {
      try {
        await matchStore.triggerRoundStart(tournament_id, id);
        console.log(`[AutoRound] Đã mở vòng ${round_no} của giải ${tournament_id}`);
      } catch (error) {
        console.error(`[AutoRound] Bỏ qua vòng ${round_no} giải ${tournament_id}: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`[AutoRound] Lỗi quét: ${error.message}`);
  }
}, AUTO_START_INTERVAL_MS);

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
    console.error(`[Backend] ${error.code ?? "SERVER_ERROR"}: ${error.message}`);
    // Do not leave a healthy-looking Node process running without a listener.
    process.exitCode = 1;
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
    ratingService,
    tournamentService,
    tournamentScheduler,
    events,
};
