import { spawn } from 'node:child_process';
import net from 'node:net';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const children = [];
let stopping = false;
let servicesReady = false;

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    // Match the backend bind address so existing wildcard listeners are detected.
    probe.listen(port, '0.0.0.0', () => probe.close(() => resolve(true)));
  });
}

async function selectPort(preferred, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = preferred + offset;
    if (port > 65535) break;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`Không tìm được cổng trống từ ${preferred} trở lên.`);
}

function start(label, args, env) {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), env, stdio: ['inherit', 'pipe', 'pipe'] });
  child.startupOutput = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      const output = chunk.toString();
      child.startupOutput = (child.startupOutput + output).slice(-16_000);
      (stream === child.stdout ? process.stdout : process.stderr).write(chunk);
    });
  }
  children.push(child);
  child.once('error', (error) => {
    console.error(`[${label}] Không khởi chạy được: ${error.message}`);
    stop(1);
  });
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[${label}] Đã dừng (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
      if (servicesReady) stop(code || 1);
    }
  });
  return child;
}

async function waitForUrl(child, url, label, expectedOutput, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${label} dừng trước khi sẵn sàng.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok && child.startupOutput.includes(expectedOutput)) {
        // Require the spawned process's own ready log; another local process may answer the URL.
        return;
      }
    } catch {
      // Backend/Vite may still be starting; retry briefly.
    }
    await delay(250);
  }
  throw new Error(`${label} không phản hồi tại ${url} sau ${timeoutMs / 1000} giây.`);
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

try {
  const backendPort = await selectPort(Number(process.env.PORT) || 3000);
  const frontendPortStart = Number(process.env.FRONTEND_PORT) || 5175;
  const apiUrl = `http://127.0.0.1:${backendPort}`;
  const wsUrl = process.env.VITE_WS_URL?.trim() || apiUrl.replace(/^http/, 'ws');

  const backendEnv = { ...process.env, PORT: String(backendPort) };
  const backend = start('Backend', ['--env-file-if-exists=.env', 'net/index.js'], backendEnv);
  await waitForUrl(backend, `${apiUrl}/health`, 'Backend', 'Game server is running on port');

  const frontendEnv = { ...process.env, PORT: String(backendPort), VITE_API_URL: apiUrl, VITE_WS_URL: wsUrl };
  let frontendPort = null;
  for (let offset = 0; offset < 20; offset += 1) {
    const candidate = frontendPortStart + offset;
    if (candidate > 65535) break;
    if (!await isPortAvailable(candidate)) continue;
    const frontend = start('Frontend', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(candidate), '--strictPort'], frontendEnv);
    try {
      await waitForUrl(frontend, `http://127.0.0.1:${candidate}/`, 'Frontend', 'Local:', 5_000);
      frontendPort = candidate;
      break;
    } catch (error) {
      if (frontend.exitCode === null) frontend.kill();
      if (offset === 19) throw error;
    }
  }
  if (frontendPort === null) throw new Error(`Không tìm được cổng frontend trống từ ${frontendPortStart} trở lên.`);

  servicesReady = true;
  console.log('\nBE và FE đã sẵn sàng.');
  console.log(`Backend: ${apiUrl}`);
  console.log(`Frontend: http://127.0.0.1:${frontendPort}/`);
  console.log('Nhấn Ctrl+C để dừng cả hai dịch vụ.');
} catch (error) {
  console.error(`[Dev] ${error.message}`);
  stop(1);
}
