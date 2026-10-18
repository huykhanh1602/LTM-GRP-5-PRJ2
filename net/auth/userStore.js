import { randomUUID } from "node:crypto";

// Kho người dùng TRONG BỘ NHỚ. Hoàng thay bằng bảng `users` + `auth_identities`
// (PostgreSQL) mà giữ nguyên các hàm bên dưới thì phần còn lại không phải sửa.
export function createUserStore() {
    const users = new Map();
    const byIdentity = new Map();

    const publicUser = (user) => ({
        id: user.id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        guest: user.guest,
    });

    function cleanName(name) {
        const text = typeof name === "string" ? name.trim() : "";
        return text.length >= 1 && text.length <= 30 ? text : null;
    }

    return {
        cleanName,
        publicUser,
        get: (id) => users.get(id) ?? null,

        // Đăng nhập qua nhà cung cấp (Google): cùng `sub` thì luôn ra cùng một người dùng.
        findOrCreateExternal({ provider, providerUserId, displayName, email = null, avatarUrl = null }) {
            const key = `${provider}:${providerUserId}`;
            let user = users.get(byIdentity.get(key));
            if (!user) {
                user = {
                    id: randomUUID(),
                    display_name: cleanName(displayName) ?? cleanName(email?.split("@")[0]) ?? "Người chơi",
                    avatar_url: avatarUrl,
                    email,
                    guest: false,
                };
                users.set(user.id, user);
                byIdentity.set(key, user.id);
            }
            return user;
        },

        // Khách: mỗi lần là một danh tính mới, chỉ tồn tại cùng token phiên.
        createGuest(displayName) {
            const name = cleanName(displayName);
            if (!name) return null;
            const user = { id: randomUUID(), display_name: name, avatar_url: null, email: null, guest: true };
            users.set(user.id, user);
            return user;
        },
    };
}
