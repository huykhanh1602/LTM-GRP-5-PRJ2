
import WebSocket from "ws";

const socket = new WebSocket("ws://localhost:3000/bot");

socket.on("open", () => {
    console.log("Đã kết nối đến server!");

    const message = {
        type: "join",
        token: "token-team-a",
    };

    console.log("Đang gửi:", message);
    socket.send(JSON.stringify(message));
});

socket.on("message", (data) => {
    console.log("Server phản hồi:", data.toString());
});

socket.on("error", (error) => {
    console.error("Lỗi WebSocket:", error.message);
});

socket.on("close", (code, reason) => {
    console.log("Đã ngắt kết nối.");
    console.log("Mã đóng kết nối:", code);
    console.log("Lý do:", reason.toString() || "(không có)");
});