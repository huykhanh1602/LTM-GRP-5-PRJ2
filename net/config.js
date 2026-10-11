const config = {
    port: Number(process.env.PORT) || 3000,

    botTimeoutMs: Number(process.env.BOT_TIMEOUT_MS) || 5000,

    maxMessagesPerSecond:
        Number(process.env.MAX_MESSAGES_PER_SECOND) || 20,
};

export default config;