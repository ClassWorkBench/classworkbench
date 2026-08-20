// ============================================
// main/qweather-auth.js — 和风天气 JWT 认证
// 和风推荐用 JWT(Ed25519) 替代旧 API Key（旧 v7 warning 接口已废弃返回 403）。
// 本模块在主进程完成签名与请求：
//   1. 私钥只存在于主进程，渲染层永远拿不到；
//   2. JWT = base64url(header) + '.' + base64url(payload) + '.' + base64url(signature)；
//   3. header 仅 {alg:'EdDSA', kid}，payload 仅 {sub, iat(now-30s), exp}，不混入多余字段；
//   4. 每次请求带 Authorization: Bearer <token>，不再带 key 参数 / X-QW-Api-Key 头。
// 依赖：Node 内置 crypto + Electron net.fetch（与 docs-sync 一致，绕过渲染层 CSP）。
// 参考官方规范：https://dev.qweather.com/docs/configuration/authentication/#json-web-token
// ============================================

const crypto = require('crypto');

const TOKEN_TTL_SECONDS = 900; // 900s = 15 分钟，符合和风"最长 24h"，前端场景取短值

module.exports = { createQweatherClient };

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

/**
 * 从 PEM 文本提取 PKCS8 私钥 DER 并交给 crypto 签名（Ed25519）。
 * 兼容多行/换行/首尾说明行。
 * @returns {crypto.KeyObject}
 */
function loadEd25519Key(privateKeyPem) {
    if (!privateKeyPem || typeof privateKeyPem !== 'string') throw new Error('PRIVATE_KEY_MISSING');
    const body = privateKeyPem
        .replace(/-----BEGIN [^-]+-----/g, '')
        .replace(/-----END [^-]+-----/g, '')
        .replace(/\s+/g, '');
    if (!body) throw new Error('PRIVATE_KEY_INVALID');
    const der = Buffer.from(body, 'base64');
    return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/**
 * 生成一个 JWT（EdDSA/Ed25519 签名）。
 * @param {object} cfg { kid, sub, privateKey }
 * @returns {string} header.payload.signature
 */
function generateToken(cfg) {
    const { kid, sub, privateKey } = cfg || {};
    if (!kid || !sub || !privateKey) throw new Error('NO_CONFIG');

    const header = b64url(JSON.stringify({ alg: 'EdDSA', kid }));
    const now = Math.floor(Date.now() / 1000);
    const payload = b64url(JSON.stringify({ sub, iat: now - 30, exp: now + TOKEN_TTL_SECONDS }));
    const signingInput = `${header}.${payload}`;

    // 注意：Ed25519 不能用 createSign('ed25519') 的 update/sign 流水线（会在 Node 22 报 Invalid digest），
    // 必须用 crypto.sign(null, data, key) 单次签名。verify 对应 crypto.verify(null, data, key, sig)。
    const signature = b64url(crypto.sign(null, signingInput, loadEd25519Key(privateKey)));

    return `${signingInput}.${signature}`;
}

/**
 * 生成本地 Ed25519 密钥对（PKCS8 私钥 + SPKI 公钥，PEM 文本）。
 * 用于设置界面"一键生成"：私钥留在本机填进软件，公钥上传和风控制台登记。
 * @returns {{ privateKey: string, publicKey: string }}
 */
function generateKeyPair() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    return {
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
        publicKey: publicKey.export({ type: 'spki', format: 'pem' })
    };
}

/**
 * 创建和风 JWT 客户端（显式依赖注入 net，风格与其他 main/* 模块一致）。
 * @param {object} opts { net, log }
 */
function createQweatherClient({ net, log }) {
    /**
     * 发起一次携带 JWT 认证头的 GET 请求。
     * @param {object} args
     * @param {string} args.host   和风专属 API Host（如 abc.qweatherapi.com）
     * @param {object} args.cfg    { kid, sub, privateKey }
     * @param {string} args.endpoint  如 /weatheralert/v1/current/{lat}/{lon}
     * @param {object} [args.query]   额外查询参数（含经纬度等）
     * @returns {Promise<object>} 解析后的 JSON
     */
    async function get({ host, cfg, endpoint, query }) {
        if (!host || !cfg || !endpoint) throw new Error('NO_CONFIG');
        const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const token = generateToken(cfg);
        const qs = new URLSearchParams(query || {});
        const url = `https://${cleanHost}${endpoint}${qs.toString() ? '?' + qs.toString() : ''}`;
        const resp = await net.fetch(url, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    return { get, generateToken, generateKeyPair };
}