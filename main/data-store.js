// ============================================
// main/data-store.js — 加密数据存储层（替代 electron-store）
// 职责：内存读写（get/set）+ 加密落盘（flush）+ 旧明文迁移 + 损坏自愈。
// 接口与 electron-store 兼容（get/set），持久化改为显式 await flush()。
// 文件：
//   userData/homework-data.enc      — 加密主数据（AES-256-GCM）
//   userData/homework-data.json     — 旧版明文，首次启动自动迁移后改名 .legacy.bak
// ============================================

/**
 * 工厂模式创建加密数据存储。
 * @param {object} opts
 * @param {object} opts.app      - Electron app（取 userData）
 * @param {object} opts.fs       - Node fs
 * @param {object} opts.path     - Node path
 * @param {object} opts.log      - electron-log
 * @param {object} opts.cipher   - data-cipher 模块实例（encryptText / decryptText）
 * @param {object} opts.defaults - 默认值（STORE_DEFAULTS）
 * @param {Function} opts.isEncryptionEnabled - () => boolean，当前是否启用加密（用户可在向导选择）
 */
function createDataStore({ app, fs, path, log, cipher, defaults, isEncryptionEnabled }) {

    const data = Object.assign({}, defaults || {});
    const encGetter = typeof isEncryptionEnabled === 'function'
        ? isEncryptionEnabled
        : () => true;   // 缺省默认加密
    let loaded = false;
    let dirty = false;   // 内存是否有未落盘变更
    let saveChain = Promise.resolve(true);

    function encFile() {
        return path.join(app.getPath('userData'), 'homework-data.enc');
    }

    function plainFile() {
        return path.join(app.getPath('userData'), 'homework-data.json');
    }

    /** 原子写（临时文件 + rename） */
    function writeFileSync(filePath, content) {
        const tmpPath = filePath + '.tmp-' + Date.now();
        fs.writeFileSync(tmpPath, content, 'utf8');
        fs.renameSync(tmpPath, filePath);
    }

    /** 损坏文件备份：重命名为 .corrupted.<ts>，保留现场不直接覆盖 */
    function backupCorrupted(filePath) {
        try {
            const ts = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
            fs.renameSync(filePath, filePath + `.corrupted.${ts}`);
        } catch (e) {
            log.error('[data-store] 备份损坏文件失败:', filePath, e);
        }
    }

    /** 从指定文件加载并解析（自动兼容密文/明文） */
    function loadFromFile(filePath) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw.startsWith('CBW1:') ? cipher.decryptText(raw) : raw);
            if (parsed && typeof parsed === 'object') {
                Object.assign(data, parsed);
                return true;
            }
        } catch (e) {
            log.error('[data-store] 旧明文数据损坏，备份后使用默认值:', filePath, e);
        }
        backupCorrupted(filePath);
        return false;
    }

    /**
     * 加载数据（同步）：优先读加密文件；不存在且存在旧明文 → 自动迁移。
     * 应在应用启动早期调用一次。
     */
    function load() {
        if (loaded) return;
        loaded = true;

        const enc = encFile();
        const plain = plainFile();

        if (fs.existsSync(enc)) {
            if (loadFromFile(enc)) return;
            // 解密失败：尝试明文文件兜底
            if (fs.existsSync(plain) && loadFromFile(plain)) {
                log.warn('[data-store] 加密文件损坏，已回退读取明文文件');
                return;
            }
            log.error('[data-store] 加密数据解密失败，损坏文件已在 loadFromFile 中备份，使用默认值');
            return;
        }

        if (fs.existsSync(plain) && loadFromFile(plain)) {
            log.info('[data-store] 已加载明文数据文件');
        }
    }

    /** 读取内存值（兼容 electron-store.get） */
    function get(key, def) {
        const v = data[key];
        return v !== undefined ? v : def;
    }

    /** 写入内存值（兼容 electron-store.set；持久化需后续 await flush()） */
    function set(key, value) {
        data[key] = value;
        dirty = true;
    }

    /**
     * 写后校验：读回磁盘文件，解密/解析后必须与内存序列化结果字节一致才算完好。
     * 用于"切换加密格式后删除旧文件"前的安全网——校验通过才允许删除旧格式文件，
     * 任何异常/不一致都返回 false，绝不冒险删除。
     */
    function verifyFile(filePath, expectedPlain) {
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsedRaw = raw.startsWith('CBW1:') ? cipher.decryptText(raw) : raw;
            if (parsedRaw !== expectedPlain) {
                log.error('[data-store] 写后校验不一致，保留旧格式文件不下发删除');
                return false;
            }
            return true;
        } catch (e) {
            log.error('[data-store] 写后校验异常，保留旧格式文件:', e);
            return false;
        }
    }

    /** 加密落盘（串行队列，防并发覆盖） */
    function save() {
        const next = saveChain.then(() => {
            try {
                const enabled = encGetter();
                const plain = JSON.stringify(data, null, 2);
                const content = enabled ? cipher.encryptText(plain) : plain;
                const target = enabled ? encFile() : plainFile();
                const other = enabled ? plainFile() : encFile();
                writeFileSync(target, content);
                // 另一种格式的旧文件：写后校验通过才彻底删除（含历史遗留 .legacy.bak），
                // 不再改名保底——切换开关后磁盘不留明文/旧格式残留。
                // 校验失败则保留旧文件本身，报错但不丢数据（下次正常保存不会再动它）。
                if (fs.existsSync(other)) {
                    if (verifyFile(target, plain)) {
                        try {
                            fs.unlinkSync(other);
                            const bak = other + '.legacy.bak';
                            if (fs.existsSync(bak)) fs.unlinkSync(bak);
                        } catch (e) {
                            log.error('[data-store] 删除旧格式文件失败:', other, e);
                        }
                    } else {
                        throw new Error('写后校验失败，拒绝删除旧格式文件');
                    }
                }
                dirty = false;
                return true;
            } catch (e) {
                log.error('[data-store] 加密写入失败:', e);
                return false;
            }
        });
        saveChain = next.then(() => true, () => true);
        return next;
    }

    /** 确保变更落盘：若有脏数据先触发保存，再等待队列完成 */
    async function flush() {
        if (dirty) save();
        await saveChain;
    }

    return { load, get, set, save, flush };
}

module.exports = { createDataStore };
