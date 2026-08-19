// ============================================
// main/data-cipher.js — 数据加密原语（独立模块，不含任何业务）
// 算法：AES-256-GCM（硬件加速，亚毫秒级）
// 密钥：32 字节随机，用 Electron safeStorage（Windows DPAPI）加密后落盘，
//       只有当前 Windows 用户能解，配合加密文件实现"防磁盘扫描"。
// 密文格式：CBW1:<iv(base64)>:<tag(base64)>:<ciphertext(base64)>
// GCM 认证标签：密文被篡改/损坏时解密必然失败（天然完整性校验）。
// ============================================

const crypto = require('crypto');

const PREFIX = 'CBW1:';
const IV_SIZE = 12;
const TAG_SIZE = 16;

/**
 * 工厂模式创建加密模块。
 * @param {object} opts
 * @param {object} opts.app         - Electron app（取 userData 路径）
 * @param {object} opts.fs          - Node fs
 * @param {object} opts.path        - Node path
 * @param {object} opts.log         - electron-log
 * @param {object} opts.safeStorage - Electron safeStorage（Windows DPAPI / macOS Keychain）
 */
function createCipherModule({ app, fs, path, log, safeStorage }) {

    /** @type {Buffer | null} 缓存的 AES-256 密钥 */
    let key = null;

    function getKeyFile() {
        return path.join(app.getPath('userData'), '.cbw-key');
    }

    /** 加载或创建密钥：safeStorage 加密的 32 字节随机密钥 */
    function getKey() {
        if (key) return key;
        if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function' || !safeStorage.isEncryptionAvailable()) {
            throw new Error('系统级加密（Windows 凭据保护）不可用，无法初始化数据加密');
        }
        const keyFile = getKeyFile();
        try {
            if (fs.existsSync(keyFile)) {
                const blob = fs.readFileSync(keyFile);
                key = Buffer.from(safeStorage.decryptString(blob), 'base64');
            } else {
                key = crypto.randomBytes(32);
                const blob = safeStorage.encryptString(key.toString('base64'));
                fs.writeFileSync(keyFile, blob);
            }
        } catch (e) {
            log.error('[cipher] 密钥加载失败:', e);
            throw e;
        }
        if (!key || key.length !== 32) {
            throw new Error('数据密钥无效（长度异常）');
        }
        return key;
    }

    /**
     * 加密文本（同步，亚毫秒级；数据量为 KB 级 JSON，不阻塞事件循环）
     * @param {string} plainText - 明文（UTF-8 文本）
     * @returns {string} 密文（CBW1:...）
     */
    function encryptText(plainText) {
        const plain = Buffer.from(String(plainText), 'utf8');
        const iv = crypto.randomBytes(IV_SIZE);
        const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
        const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
        const tag = cipher.getAuthTag();
        return PREFIX
            + iv.toString('base64') + ':'
            + tag.toString('base64') + ':'
            + enc.toString('base64');
    }

    /**
     * 解密文本（同步）。密文损坏/被篡改时抛异常。
     * @param {string} payload - 密文（CBW1:...）
     * @returns {string} 明文
     */
    function decryptText(payload) {
        if (typeof payload !== 'string' || !payload.startsWith(PREFIX)) {
            throw new Error('密文格式错误：缺少版本头');
        }
        const parts = payload.slice(PREFIX.length).split(':');
        if (parts.length !== 3) {
            throw new Error('密文格式错误：字段数量不符');
        }
        const iv = Buffer.from(parts[0], 'base64');
        const tag = Buffer.from(parts[1], 'base64');
        const enc = Buffer.from(parts[2], 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        return dec.toString('utf8');
    }

    /** 加密状态（供设置面板展示） */
    function status() {
        let keyProtection = '不可用';
        try {
            if (safeStorage && safeStorage.isEncryptionAvailable()) {
                keyProtection = 'Windows 凭据保护 (DPAPI)';
            }
        } catch (_) { /* 忽略 */ }
        return {
            enabled: true,
            algorithm: 'AES-256-GCM',
            keyProtection,
            keyFile: getKeyFile()
        };
    }

    return { encryptText, decryptText, status };
}

module.exports = { createCipherModule };
