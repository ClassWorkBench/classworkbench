// ============================================
// main/background-cache.js — 云端背景图本地缓存
// 拆分自 main.js L192-L531（最大一坨，340 行）
// 职责：主进程下载、JPEG/PNG/WebP/GIF 魔数完整性校验、
//       索引持久化、缓存驱逐（6张上限）；渲染层零网络请求
// ============================================

const {
    BG_SOURCES,
    BG_MAX_CACHE_FILES,
    BG_MAX_BYTES,
    BG_TIMEOUT_MS
} = require('./constants');

/**
 * @param {object} opts
 * @param {object} opts.app             - Electron app
 * @param {object} opts.fs              - Node fs
 * @param {object} opts.path            - Node path
 * @param {object} opts.crypto          - Node crypto
 * @param {object} opts.net             - Electron net（含 redirect 支持）
 * @param {Function} opts.pathToFileURL - url.pathToFileURL
 * @param {object} opts.log             - electron-log
 * @param {Function} opts.atomicWriteFileSync - 归档模块提供的原子写函数（共享实现）
 * @param {Function} opts.getSettings   - 回调，读当前 settings（背景图源在 settings.bgSource）
 */
function createBgCacheModule({
    app, fs, path, crypto, net, pathToFileURL, log,
    atomicWriteFileSync, getSettings
}) {

    let bgFetchInFlight = null;

    function getBgApiUrl() {
        const settings = getSettings() || {};
        const source = BG_SOURCES[settings.bgSource] ? settings.bgSource : 'upx8';
        return BG_SOURCES[source].url;
    }

    function getBgCacheDir() {
        return path.join(app.getPath('userData'), 'bg-cache');
    }

    function getBgIndexPath() {
        return path.join(getBgCacheDir(), 'index.json');
    }

    function readBgHead(filePath, size) {
        const fd = fs.openSync(filePath, 'r');
        try {
            const buf = Buffer.alloc(size);
            const bytesRead = fs.readSync(fd, buf, 0, size, 0);
            return buf.subarray(0, bytesRead);
        } finally {
            fs.closeSync(fd);
        }
    }

    function readBgTail(filePath, size) {
        const stat = fs.statSync(filePath);
        const fd = fs.openSync(filePath, 'r');
        try {
            const buf = Buffer.alloc(size);
            const bytesRead = fs.readSync(fd, buf, 0, size, Math.max(0, stat.size - size));
            return buf.subarray(0, bytesRead);
        } finally {
            fs.closeSync(fd);
        }
    }

    /** JPEG/PNG/WebP/GIF 魔数头尾校验，防止下载半截/损坏 */
    function isValidBgImage(filePath) {
        try {
            const stat = fs.statSync(filePath);
            if (!stat.isFile() || stat.size < 16) return false;
            const head = readBgHead(filePath, 16);

            if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
                const tail = readBgTail(filePath, 2);
                return tail.length === 2 && tail[0] === 0xff && tail[1] === 0xd9;
            }

            const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            if (head.length >= 8 && head.subarray(0, 8).equals(pngMagic)) {
                const tail = readBgTail(filePath, 8);
                return tail.length === 8 && tail.equals(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
            }

            const headAscii = head.toString('latin1');
            if (headAscii.startsWith('RIFF') && headAscii.substring(8, 12) === 'WEBP') {
                return stat.size >= 12;
            }

            if (headAscii.startsWith('GIF87a') || headAscii.startsWith('GIF89a')) {
                const tail = readBgTail(filePath, 1);
                return tail.length === 1 && tail[0] === 0x3b;
            }

            return false;
        } catch (e) {
            log.warn('[background] 图片完整性校验失败:', filePath, e.message || e);
            return false;
        }
    }

    function detectBgExt(filePath) {
        const head = readBgHead(filePath, 12);
        if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return '.jpg';
        if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return '.png';
        const headAscii = head.toString('latin1');
        if (headAscii.startsWith('RIFF') && headAscii.substring(8, 12) === 'WEBP') return '.webp';
        if (headAscii.startsWith('GIF87a') || headAscii.startsWith('GIF89a')) return '.gif';
        return '.jpg';
    }

    function getBgExt(contentType, filePath) {
        const type = String(contentType || '').toLowerCase();
        if (type.includes('jpeg') || type.includes('jpg')) return '.jpg';
        if (type.includes('png')) return '.png';
        if (type.includes('webp')) return '.webp';
        if (type.includes('gif')) return '.gif';
        return detectBgExt(filePath);
    }

    function isSafeBgName(name) {
        return typeof name === 'string' && name.length > 3 &&
            !name.includes('..') && !name.includes('/') && !name.includes('\\');
    }

    function readBgIndex() {
        try {
            const data = JSON.parse(fs.readFileSync(getBgIndexPath(), 'utf8'));
            return {
                current: typeof data.current === 'string' ? data.current : null,
                files: Array.isArray(data.files)
                    ? data.files.filter(f => f && typeof f.name === 'string' && typeof f.ts === 'number')
                    : []
            };
        } catch (e) {
            return { current: null, files: [] };
        }
    }

    function writeBgIndex(index) {
        try {
            atomicWriteFileSync(getBgIndexPath(), JSON.stringify(index, null, 2));
        } catch (e) {
            log.warn('[background] 写入缓存索引失败:', e.message || e);
        }
    }

    /** 初始化缓存目录：清 tmp、校验索引里的每张图、补录孤儿图、驱逐超上限 */
    function cleanupBgCache() {
        const dir = getBgCacheDir();
        try {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                return;
            }

            for (const entry of fs.readdirSync(dir)) {
                if (entry.endsWith('.tmp')) {
                    try { fs.unlinkSync(path.join(dir, entry)); } catch (_) {}
                }
            }

            const index = readBgIndex();
            const kept = [];
            for (const rec of index.files) {
                if (!isSafeBgName(rec.name)) continue;
                const filePath = path.join(dir, rec.name);
                if (fs.existsSync(filePath) && isValidBgImage(filePath)) {
                    kept.push(rec);
                } else {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                }
            }

            // 把索引没提到但目录里有的 bg-xxx 合法图补录回来
            const knownNames = new Set(kept.map(rec => rec.name));
            for (const entry of fs.readdirSync(dir)) {
                if (!entry.startsWith('bg-') || knownNames.has(entry)) continue;
                const filePath = path.join(dir, entry);
                if (isValidBgImage(filePath)) {
                    const stat = fs.statSync(filePath);
                    kept.push({ name: entry, size: stat.size, ts: stat.mtimeMs });
                } else {
                    try { fs.unlinkSync(filePath); } catch (_) {}
                }
            }

            index.files = kept;
            if (!index.current || !kept.some(rec => rec.name === index.current)) {
                index.current = kept.length ? kept[0].name : null;
            }
            writeBgIndex(index);
        } catch (e) {
            log.warn('[background] 初始化缓存失败:', e.message || e);
        }
    }

    function getCachedBgFiles() {
        const dir = getBgCacheDir();
        return readBgIndex().files.filter(rec =>
            isSafeBgName(rec.name) &&
            fs.existsSync(path.join(dir, rec.name)) &&
            isValidBgImage(path.join(dir, rec.name))
        );
    }

    function pickCachedBackground() {
        const dir = getBgCacheDir();
        const files = getCachedBgFiles();
        if (!files.length) return null;
        const index = readBgIndex();
        const current = files.some(rec => rec.name === index.current) ? index.current : files[0].name;
        if (index.current !== current) {
            index.current = current;
            writeBgIndex(index);
        }
        return pathToFileURL(path.join(dir, current)).href;
    }

    function pickRandomCachedBackground() {
        const dir = getBgCacheDir();
        const files = getCachedBgFiles();
        if (!files.length) return null;
        const picked = files[Math.floor(Math.random() * files.length)];
        const index = readBgIndex();
        index.current = picked.name;
        writeBgIndex(index);
        return pathToFileURL(path.join(dir, picked.name)).href;
    }

    function downloadBgImage(tmpPath) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let received = 0;
            let contentType = '';
            let responseStream = null;
            let request = null;

            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    if (request) request.abort();
                    reject(new Error('背景图下载超时'));
                }
            }, BG_TIMEOUT_MS);

            const fail = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                try { if (request) request.abort(); } catch (_) {}
                try { if (responseStream) responseStream.destroy(); } catch (_) {}
                try { fs.unlinkSync(tmpPath); } catch (_) {}
                reject(err);
            };

            const out = fs.createWriteStream(tmpPath, { flags: 'wx' });
            out.on('error', fail);
            out.on('finish', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve({ contentType });
            });

            request = net.request({
                url: getBgApiUrl(),
                method: 'GET',
                redirect: 'follow',
                cache: 'no-store'
            });
            request.setHeader('Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');

            request.on('response', (response) => {
                const status = response.statusCode || 0;
                contentType = String(response.headers['content-type'] || '').toLowerCase();
                if (status < 200 || status >= 300) {
                    fail(new Error(`背景图接口返回异常: ${status} ${contentType || 'unknown'}`));
                    return;
                }
                responseStream = response;
                response.on('data', (chunk) => {
                    if (settled) return;
                    received += chunk.length;
                    if (received > BG_MAX_BYTES) {
                        fail(new Error('背景图超过大小限制'));
                        return;
                    }
                    if (!out.write(chunk)) {
                        // 背压：暂停读取，等写缓冲排空，避免主进程无界堆积
                        response.pause();
                        const resume = () => { response.resume(); out.removeListener('drain', resume); };
                        out.once('drain', resume);
                    }
                });
                response.on('error', (e) => { if (!settled) out.end(); fail(e); });
                response.on('end', () => {
                    if (!settled) out.end();
                });
            });
            request.on('error', fail);
            request.on('abort', () => {
                if (!settled) fail(new Error('背景图下载已中止'));
            });
            request.end();
        });
    }

    /** 下载新图 → 校验完整性 → 写入索引 → 驱逐旧图。并发只有一个在飞 */
    async function fetchAndCacheBackground() {
        if (bgFetchInFlight) return bgFetchInFlight;

        bgFetchInFlight = (async () => {
            const dir = getBgCacheDir();
            let tmpPath = '';

            try {
                fs.mkdirSync(dir, { recursive: true });
                tmpPath = path.join(dir, `.bg-download-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.tmp`);
                const result = await downloadBgImage(tmpPath);
                if (!isValidBgImage(tmpPath)) throw new Error('下载文件不是完整图片');

                const finalName = `bg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${getBgExt(result.contentType, tmpPath)}`;
                const finalPath = path.join(dir, finalName);
                fs.renameSync(tmpPath, finalPath);

                const index = readBgIndex();
                const record = { name: finalName, size: fs.statSync(finalPath).size, ts: Date.now() };
                index.files = [record, ...index.files.filter(rec => isSafeBgName(rec.name) && rec.name !== finalName)];
                while (index.files.length > BG_MAX_CACHE_FILES) {
                    const old = index.files.pop();
                    try { fs.unlinkSync(path.join(dir, old.name)); } catch (_) {}
                }
                index.current = finalName;
                writeBgIndex(index);

                return {
                    ok: true,
                    url: pathToFileURL(finalPath).href,
                    source: 'network',
                    path: finalPath
                };
            } catch (e) {
                log.warn('[background] 拉取新背景图失败:', e.message || e);
                if (tmpPath) {
                    try { fs.unlinkSync(tmpPath); } catch (_) {}
                }
                return null;
            } finally {
                bgFetchInFlight = null;
            }
        })();

        return bgFetchInFlight;
    }

    return {
        cleanupBgCache,
        pickCachedBackground,
        pickRandomCachedBackground,
        fetchAndCacheBackground
    };
}

module.exports = { createBgCacheModule };
