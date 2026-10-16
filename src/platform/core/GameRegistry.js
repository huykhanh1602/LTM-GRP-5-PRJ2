// Game Registry: nơi duy nhất Platform biết về danh sách game.
// Thêm game mới = đăng ký thêm một manifest, KHÔNG sửa core.
// Nạp game theo nhu cầu (lazy) qua dynamic import và có cache.
// Xem plans/platform-refactoring-plan.md (mục 3.2).

import { Events } from "../../shared/protocol/events.js";
import { assertManifest, assertPlugin, validateManifest } from "./contracts.js";

/**
 * @param {{ eventBus?: ReturnType<import("./EventBus.js").createEventBus> }} [options]
 */
export function createGameRegistry({ eventBus = null } = {}) {
    /** @type {Map<string, object>} */
    const manifests = new Map();
    /** @type {Map<string, object>} */
    const cache = new Map();

    function register(manifest) {
        assertManifest(manifest);
        if (manifests.has(manifest.id)) {
            throw new Error(`Game "${manifest.id}" đã được đăng ký.`);
        }
        manifests.set(manifest.id, manifest);
        eventBus?.emit(Events.GAME_REGISTERED, {
            id: manifest.id,
            kind: manifest.kind,
            name: manifest.name,
        });
        return manifest;
    }

    /**
     * Đăng ký nhiều manifest.
     * @param {object[]} list
     * @param {{ override?: boolean }} [options] override=true thì ghi đè manifest trùng id
     */
    function registerAll(list, { override = false } = {}) {
        const registered = [];
        for (const manifest of list ?? []) {
            const id = manifest?.id;
            if (id && manifests.has(id)) {
                if (!override) continue;
                unregister(id);
            }
            registered.push(register(manifest));
        }
        return registered;
    }

    function unregister(id) {
        cache.delete(id);
        return manifests.delete(id);
    }

    function get(id) {
        return manifests.get(id) ?? null;
    }

    function has(id) {
        return manifests.has(id);
    }

    function list() {
        return [...manifests.values()];
    }

    function ids() {
        return [...manifests.keys()];
    }

    function isLoaded(id) {
        return cache.has(id);
    }

    /**
     * Nạp plugin của một game (có cache). Trả về plugin đã kiểm tra Contract.
     * @returns {Promise<object>}
     */
    async function load(id) {
        const manifest = manifests.get(id);
        if (!manifest) {
            throw new Error(`Game "${id}" chưa được đăng ký.`);
        }
        if (cache.has(id)) return cache.get(id);

        const loaded = await manifest.load();
        const plugin = loaded?.default ?? loaded;
        // Cho phép plugin tự thiếu manifest -> gắn manifest đã đăng ký.
        if (plugin && !plugin.manifest) plugin.manifest = manifest;
        assertPlugin(plugin, manifest);

        cache.set(id, plugin);
        return plugin;
    }

    function unload(id) {
        return cache.delete(id);
    }

    return {
        register,
        registerAll,
        unregister,
        get,
        has,
        list,
        ids,
        load,
        unload,
        isLoaded,
        validateManifest,
    };
}
