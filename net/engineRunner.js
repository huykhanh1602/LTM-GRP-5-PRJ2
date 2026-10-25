import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fallbackAction, maskHiddenInfo } from "./humanTurn.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineDirectory = join(projectRoot, "engine");

const GAME_ENGINES = {
    rps_chess: {
        entry: join(engineDirectory, "match_runner.py"),
        configTemplate: join(engineDirectory, "config.json"),
    },
    snake_battle: {
        entry: join(engineDirectory, "snake", "match_runner.py"),
        configTemplate: join(engineDirectory, "snake", "config.json"),
    },
};

const HUMAN_TURN_MS_DEFAULT = 30_000;
const isHuman = (team) => team?.control === "human";

export async function runEngineMatch({ roomCode, teamA, teamB, onEvent, configPatch = null, gameId = "rps_chess", humanTurnMs = HUMAN_TURN_MS_DEFAULT, abortSignal = null }) {
    const engineConfig = GAME_ENGINES[gameId] ?? GAME_ENGINES.rps_chess;
    const configTemplatePath = engineConfig.configTemplate;
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "ltm-match-"));
    const botAPath = join(temporaryDirectory, "team_a.py");
    const botBPath = join(temporaryDirectory, "team_b.py");
    const configPath = join(temporaryDirectory, "config.json");
    const outputPath = join(temporaryDirectory, "replay.json");

    try {
        const config = JSON.parse(await readFile(configTemplatePath, "utf8"));
        const matchId = `M-${roomCode}-${randomUUID()}`;
        // Chỉ phòng casual có configPatch; gateway đã lọc sẵn các khóa được phép.
        if (configPatch?.limits) config.limits = { ...config.limits, ...configPatch.limits };
        config.match = {
            ...(config.match ?? {}),
            match_id: matchId,
            teams: { team_a: teamA.name, team_b: teamB.name },
        };
        const writes = [writeFile(configPath, JSON.stringify(config), "utf8")];
        if (!isHuman(teamA)) writes.push(writeFile(botAPath, teamA.code, "utf8"));
        if (!isHuman(teamB)) writes.push(writeFile(botBPath, teamB.code, "utf8"));
        await Promise.all(writes);

        const python = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
        const args = [engineConfig.entry, "--config", configPath, "--out", outputPath, "--stream"];
        if (isHuman(teamA)) args.push("--control-a", "human", "--human-turn-ms", String(humanTurnMs));
        else args.push("--bot-a", botAPath);
        if (isHuman(teamB)) args.push("--control-b", "human", "--human-turn-ms", String(humanTurnMs));
        else args.push("--bot-b", botBPath);

        let aborted = false;
        await new Promise((resolvePromise, rejectPromise) => {
            const child = spawn(python, args, { cwd: projectRoot, windowsHide: true });
            let pendingOutput = "";
            let diagnostics = "";
            let settled = false;

            const fail = (error) => {
                if (settled) return;
                settled = true;
                child.kill();
                rejectPromise(error);
            };

            // Có người bỏ ván giữa trận: giết engine và coi như trận đã dừng ở đây.
            const stop = () => {
                if (settled) return;
                settled = true;
                aborted = true;
                child.kill();
                resolvePromise();
            };
            if (abortSignal) {
                if (abortSignal.aborted) stop();
                else abortSignal.addEventListener("abort", stop, { once: true });
            }

            const sendLine = (message) => {
                try {
                    child.stdin.write(`${JSON.stringify(message)}\n`);
                } catch (error) {
                    console.warn("Không gửi được nước đi về engine:", error.message);
                }
            };

            // Engine hỏi lượt của người thật qua stdout rồi chờ trả lời trên stdin.
            const answerTurnRequest = (request) => {
                const side = request.team === "team_b" ? teamB : teamA;
                const payload = maskHiddenInfo(gameId, request.payload);
                const deadline = Number(request.deadline_ms) > 0 ? Number(request.deadline_ms) : humanTurnMs;
                const fallback = () => fallbackAction(gameId, payload);
                let answered = false;
                const timer = setTimeout(() => {
                    if (answered) return;
                    answered = true;
                    sendLine({ type: "TURN_RESPONSE", request_id: request.request_id, action: fallback() });
                }, deadline);
                timer.unref?.();
                Promise.resolve()
                    .then(() => side.onTurn?.(payload, { team: request.team, deadline_ms: deadline }))
                    .then((action) => {
                        if (answered) return;
                        answered = true;
                        clearTimeout(timer);
                        sendLine({ type: "TURN_RESPONSE", request_id: request.request_id, action: action ?? fallback() });
                    })
                    .catch((error) => {
                        if (answered) return;
                        answered = true;
                        clearTimeout(timer);
                        console.error("Không lấy được nước đi của người chơi:", error);
                        sendLine({ type: "TURN_RESPONSE", request_id: request.request_id, action: fallback() });
                    });
            };

            const dispatch = (event) => {
                if (event.type === "TURN_REQUEST") answerTurnRequest(event);
                else onEvent(event);
            };

            const flushLine = (line) => {
                if (!line.trim()) return;
                let event;
                try {
                    event = JSON.parse(line);
                } catch (error) {
                    if (!(error instanceof SyntaxError)) throw error;
                    console.warn("Ignoring non-protocol output from the game engine.");
                    return;
                }
                try {
                    dispatch(event);
                } catch (error) {
                    fail(error);
                }
            };

            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
                pendingOutput += chunk;
                const lines = pendingOutput.split(/\r?\n/);
                pendingOutput = lines.pop() ?? "";
                for (const line of lines) flushLine(line);
            });
            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk) => {
                diagnostics = (diagnostics + chunk).slice(-8000);
            });
            child.on("error", (error) => {
                fail(new Error(`Không khởi chạy được Python (${python}): ${error.message}`));
            });
            child.on("close", (code, signal) => {
                if (settled) return;
                try {
                    flushLine(pendingOutput);
                } catch (error) {
                    fail(error);
                    return;
                }
                pendingOutput = "";
                if (code !== 0) {
                    fail(new Error(
                        `Engine thoát với mã ${code ?? `signal ${signal}`}.${diagnostics ? `\n${diagnostics.trim()}` : ""}`
                    ));
                    return;
                }
                settled = true;
                resolvePromise();
            });
        });

        if (aborted) return null;
        return JSON.parse(await readFile(outputPath, "utf8"));
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}
