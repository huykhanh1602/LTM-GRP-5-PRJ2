import { spawn } from "node:child_process";

// Kiểm tra bot Python mà KHÔNG chạy nó: chỉ phân tích cú pháp (ast.parse) và tìm hàm make_move.
// Trả về { ok: true } hoặc { ok: false, message }.
const SCRIPT = `
import ast, sys
src = sys.stdin.read()
try:
    tree = ast.parse(src)
except SyntaxError as e:
    print("Lỗi cú pháp ở dòng %s: %s" % (e.lineno, e.msg))
    sys.exit(2)
if not any(isinstance(n, ast.FunctionDef) and n.name == "make_move" for n in tree.body):
    print("Bot phải định nghĩa hàm make_move(board_state, my_pieces, opponent_pieces, config).")
    sys.exit(3)
`;

// Cùng quy tắc chọn Python với engineRunner.js: Windows dùng "python", còn lại dùng "python3".
const defaultPython = () =>
    process.env.PYTHON_EXECUTABLE || (process.platform === "win32" ? "python" : "python3");

export function validateBotSource(source, { python = defaultPython(), timeoutMs = 5000 } = {}) {
    return new Promise((resolve) => {
        let output = "";
        let finished = false;
        const done = (result) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            resolve(result);
        };
        // -X utf8 để stdout/stderr không lỗi encoding trên Windows khi in tiếng Việt.
        const child = spawn(python, ["-X", "utf8", "-I", "-c", SCRIPT], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        const timer = setTimeout(() => {
            child.kill();
            done({ ok: false, message: "Quá thời gian kiểm tra bot." });
        }, timeoutMs);
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => { output = (output + chunk).slice(0, 500); });
        child.stderr.setEncoding("utf8");
        child.stderr.on("data", (chunk) => { output = (output + chunk).slice(-1000); });
        child.on("error", (error) => done({ ok: false, message: `Không khởi chạy được Python để kiểm tra bot: ${error.message}` }));
        child.on("close", (code) => {
            if (code === 0) done({ ok: true });
            else if (code === 2 || code === 3) done({ ok: false, message: output.trim() || "Bot không hợp lệ." });
            else done({ ok: false, message: `Không thể kiểm tra bot: ${output.trim() || `Python thoát với mã ${code ?? "không xác định"}.`}` });
        });
        child.stdin.on("error", () => {});
        child.stdin.end(source);
    });
}