import http from "node:http";

export function createHttpServer() {
    const server = http.createServer((request, response) => {
        const url = new URL(
            request.url,
            "http://localhost"
        );

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