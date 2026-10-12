import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineDirectory = join(projectRoot, "engine");
const configTemplatePath = join(engineDirectory, "config.json");

export async function runEngineMatch({ roomCode, teamA, teamB, onEvent }) {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "ltm-match-"));
    const botAPath = join(temporaryDirectory, "team_a.py");
    const botBPath = join(temporaryDirectory, "team_b.py");
    const configPath = join(temporaryDirectory, "config.json");
    const outputPath = join(temporaryDirectory, "replay.json");

    try {
        const config = JSON.parse(await readFile(configTemplatePath, "utf8"));
        const matchId = `M-${roomCode}-${randomUUID()}`;
        config.match = {
            ...(config.match ?? {}),
            match_id: matchId,
            teams: { team_a: teamA.name, team_b: teamB.name },
        };
        await Promise.all([
            writeFile(botAPath, teamA.code, "utf8"),
            writeFile(botBPath, teamB.code, "utf8"),
            writeFile(configPath, JSON.stringify(config), "utf8"),
        ]);

        const python = process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");
        await new Promise((resolvePromise, rejectPromise) => {
            const child = spawn(python, [
                join(engineDirectory, "match_runner.py"),
                "--bot-a", botAPath,
                "--bot-b", botBPath,
                "--config", configPath,
                "--out", outputPath,
                "--stream",
            ], { cwd: projectRoot, windowsHide: true });
            let pendingOutput = "";
            let diagnostics = "";
            let settled = false;

            const fail = (error) => {
                if (settled) return;
                settled = true;
                rejectPromise(error);
            };

            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
                pendingOutput += chunk;
                const lines = pendingOutput.split(/\r?\n/);
                pendingOutput = lines.pop() ?? "";
                for (const line of lines) {
                    if (!line.trim()) continue;
                    let event;
                    try {
                        event = JSON.parse(line);
                    } catch (error) {
                        if (!(error instanceof SyntaxError)) throw error;
                        console.warn("Ignoring non-protocol output from the game engine.");
                        continue;
                    }
                    try {
                        onEvent(event);
                    } catch (error) {
                        fail(error);
                        child.kill();
                        return;
                    }
                }
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
                if (pendingOutput.trim()) {
                    let event;
                    try {
                        event = JSON.parse(pendingOutput);
                    } catch (error) {
                        if (!(error instanceof SyntaxError)) {
                            fail(error);
                            return;
                        }
                    }
                    if (event) {
                        try {
                            onEvent(event);
                        } catch (error) {
                            fail(error);
                            return;
                        }
                    }
                }
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

        return JSON.parse(await readFile(outputPath, "utf8"));
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}
