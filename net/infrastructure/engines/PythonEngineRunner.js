import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EngineProtocolError,
  EngineRunError,
  EngineTimeoutError,
} from '../../domain/game/EngineRunner.js';
import { toEngineConfig } from '../../../shared/games/resolveConfig.js';

const MAX_STDERR_BYTES = 8_000;
const MAX_PENDING_BYTES = 1_000_000;

const defaultProjectRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

export function createPythonEngineRunner({
  projectRoot = defaultProjectRoot,
  pythonExecutable = process.env.PYTHON_EXECUTABLE ??
    (process.platform === 'win32' ? 'python' : 'python3'),
  spawnProcess = spawn,
  clock = () => new Date(),
  logger = console,
} = {}) {
  return {
    async run(input) {
      const { gameId, matchId, manifest, bots, config, onEvent = () => {}, signal } = input;

      if (!manifest?.engine) throw new EngineRunError('Manifest không có engine.');
      if (!bots?.a?.source || !bots?.b?.source) throw new EngineRunError('Thiếu source của bot.');

      const engine = manifest.engine;
      const tempDir = await mkdtemp(join(tmpdir(), `game-${gameId}-`));
      const startedAt = clock().toISOString();
      const controller = new AbortController();
      let timedOut = false;

      const relayAbort = () => controller.abort(signal.reason);
      if (signal) {
        if (signal.aborted) relayAbort();
        else signal.addEventListener('abort', relayAbort, { once: true });
      }

      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new EngineTimeoutError(
          `Match ${matchId} vượt quá ${engine.matchTimeoutMs}ms`,
        ));
      }, engine.matchTimeoutMs);
      timer.unref?.();

      try {
        const cwd = resolve(projectRoot, engine.cwd ?? '.');
        const entryPath = resolve(cwd, engine.entry);
        const botAPath = join(tempDir, 'team_a.py');
        const botBPath = join(tempDir, 'team_b.py');
        const configPath = join(tempDir, 'config.json');
        const outputPath = join(tempDir, 'replay.json');

        const engineConfig = await buildEngineConfig({
          cwd,
          engine,
          manifest,
          matchId,
          bots,
          config,
        });

        await Promise.all([
          writeFile(botAPath, bots.a.source, 'utf8'),
          writeFile(botBPath, bots.b.source, 'utf8'),
          writeFile(configPath, JSON.stringify(engineConfig), 'utf8'),
        ]);

        const args = [
          entryPath,
          '--bot-a', botAPath,
          '--bot-b', botBPath,
          '--config', configPath,
          '--out', outputPath,
        ];
        if (engine.protocol === 'ndjson-v1') args.push('--stream');

        const { events, stderr } = await executeEngine({
          command: pythonExecutable,
          args,
          cwd,
          signal: controller.signal,
          onEvent,
          spawnProcess,
          logger,
          requireMatchEnd: engine.protocol === 'ndjson-v1',
        });

        const replay = await readReplayFile(outputPath);

        return {
          gameId,
          matchId,
          replay,
          events,
          startedAt,
          endedAt: clock().toISOString(),
          diagnostics: stderr,
        };
      } catch (error) {
        if (timedOut) {
          throw new EngineTimeoutError(`Match ${matchId} bị timeout.`);
        }
        if (error instanceof EngineRunError) throw error;
        throw new EngineRunError(`Engine lỗi: ${error.message}`, { cause: error });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', relayAbort);
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  };
}

async function buildEngineConfig({ cwd, engine, manifest, matchId, bots, config }) {
  let base = {};

  if (engine.configTemplate) {
    const templatePath = resolve(cwd, engine.configTemplate);
    try {
      base = JSON.parse(await readFile(templatePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new EngineRunError(`Không đọc được config template: ${templatePath}`);
      }
    }
  }

  const patch = toEngineConfig(manifest, config);
  const merged = deepMerge(base, patch);
  merged.match = {
    ...(merged.match ?? {}),
    match_id: matchId,
    teams: {
      team_a: bots.a.displayName,
      team_b: bots.b.displayName,
    },
  };
  return merged;
}

function deepMerge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (isObject(value) && isObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function executeEngine({
  command,
  args,
  cwd,
  signal,
  onEvent,
  spawnProcess,
  logger,
  requireMatchEnd,
}) {
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let stderr = '';
    let pending = '';
    const events = [];

    const child = spawnProcess(command, args, {
      cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const cleanup = () => signal?.removeEventListener?.('abort', onAbort);

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      killProcessTree(child);
      rejectPromise(error);
    };

    const onAbort = () => {
      fail(
        signal.reason instanceof Error
          ? signal.reason
          : new EngineTimeoutError('Engine bị hủy.'),
      );
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });

    function consumeLine(line) {
      if (!line.trim()) return;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        logger.warn?.('Bỏ qua output không phải JSON từ engine.');
        return;
      }
      if (!event || typeof event !== 'object' || typeof event.type !== 'string') {
        throw new EngineProtocolError('Event thiếu trường type.');
      }
      events.push(event);
      onEvent(event);
    }

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      if (pending.length > MAX_PENDING_BYTES) {
        fail(new EngineProtocolError('Engine xuất quá nhiều dữ liệu.'));
        return;
      }

      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      try {
        for (const line of lines) consumeLine(line);
      } catch (error) {
        fail(error instanceof EngineRunError ? error : new EngineRunError(error.message));
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR_BYTES);
    });

    child.on('error', (error) => {
      fail(new EngineRunError(`Không spawn được Python (${command}): ${error.message}`));
    });

    child.on('close', (code, signalName) => {
      if (settled) return;

      try {
        if (pending.trim()) consumeLine(pending);
      } catch (error) {
        fail(error instanceof EngineRunError ? error : new EngineRunError(error.message));
        return;
      }

      if (code !== 0) {
        fail(new EngineRunError(
          `Engine thoát mã ${code ?? `signal ${signalName}`}. ${stderr.trim()}`,
        ));
        return;
      }
      if (requireMatchEnd && !events.some((event) => event.type === 'match_end')) {
        fail(new EngineProtocolError('Engine kết thúc mà không gửi match_end.'));
        return;
      }

      settled = true;
      cleanup();
      resolvePromise({ events, stderr });
    });
  });
}

function killProcessTree(child) {
  if (!child || child.killed) return;
  try {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } else if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

async function readReplayFile(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    throw new EngineProtocolError(`Engine không tạo replay.json: ${error.message}`);
  }

  let replay;
  try {
    replay = JSON.parse(text);
  } catch {
    throw new EngineProtocolError('replay.json không phải JSON hợp lệ.');
  }

  if (!isObject(replay) || !isObject(replay.match_info) || !Array.isArray(replay.turns)) {
    throw new EngineProtocolError('replay.json thiếu match_info hoặc turns.');
  }
  return replay;
}
