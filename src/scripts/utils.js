// ============================================
// utils.js
// 工具函数：日期、JSON、HTML转义、HEX→RGB、编号、Toast
// ============================================

function todayStr() { return localDateStr(); }

function localDateStr(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(dateStr) {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

function shiftDateStr(dateStr, deltaDays) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + deltaDays);
    return localDateStr(d);
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function formatNumCircle(text) {
    return text.split('\n').map(line => {
        const m = line.match(/^(\d+)[.、．]\s*/);
        if (m) {
            const num = m[1];
            const rest = line.substring(m[0].length);
            return `<span class="num-circle">${num}</span> ${escapeHtml(rest)}`;
        }
        return escapeHtml(line);
    }).join('<br>');
}

function escapeHtmlLines(text) {
    return text.split('\n').map(line => escapeHtml(line)).join('<br>');
}

function renderContentBySetting(text, beautify) {
    return beautify ? formatNumCircle(text) : escapeHtmlLines(text);
}

function toast(msg) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    t.setAttribute('role', 'alert');
    container.appendChild(t);
    setTimeout(() => {
        // 加 leaving 类触发同步收缩：opacity + scale + margin + max-height 一起归零
        // 下方的 Toast 会因为 margin-bottom + max-height 过渡而平滑上滑，不再闪现
        t.classList.add('leaving');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
        // 兜底：极端情况下 transitionend 未触发（如页面失焦），350ms 后强制移除
        setTimeout(() => { if (t.parentNode) t.remove(); }, 400);
    }, 2200);
}

// 迷你 Markdown → HTML 渲染器（覆盖协议文本用到的语法：
// 标题 / 粗体 / 斜体 / 行内代码 / 无序列表 / 表格 / 引用 / 分割线 / 段落）
// 原定义在 wizard.js，抽到公共工具供关于面板等复用。
function mdInline(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');          // 行内代码
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // 粗体
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');            // 斜体
    return s;
}

function mdToHtml(md) {
    const lines = md.split('\n');
    const out = [];
    let listOpen = false;
    let tableRows = [];
    let paraBuf = [];

    const flushPara = () => {
        if (paraBuf.length) {
            out.push('<p>' + paraBuf.map(mdInline).join('<br>') + '</p>');
            paraBuf = [];
        }
    };
    const flushList = () => {
        if (listOpen) { out.push('</ul>'); listOpen = false; }
    };
    const flushTable = () => {
        if (!tableRows.length) return;
        // 丢弃分隔行（|---|---|）
        const rows = tableRows.filter(r => !/^\|[\s:|-]+\|?$/.test(r.trim()));
        if (rows.length) {
            let t = '<table>';
            rows.forEach((r, i) => {
                const cells = r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
                const tag = i === 0 ? 'th' : 'td';
                t += '<tr>' + cells.map(c => '<' + tag + '>' + mdInline(c) + '</' + tag + '>').join('') + '</tr>';
            });
            t += '</table>';
            out.push(t);
        }
        tableRows = [];
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.trim().startsWith('|')) { flushPara(); flushList(); tableRows.push(line); continue; }
        flushTable();
        const t = line.trim();
        if (!t) { flushPara(); flushList(); continue; }
        if (t === '---') { flushPara(); flushList(); out.push('<hr>'); continue; }
        const m = t.match(/^(#{1,4})\s+(.*)$/);
        if (m) {
            flushPara(); flushList();
            const lv = Math.min(m[1].length + 1, 5);  // # → h2，## → h3
            out.push('<h' + lv + '>' + mdInline(m[2]) + '</h' + lv + '>');
            continue;
        }
        if (t.startsWith('> ')) { flushPara(); flushList(); out.push('<blockquote>' + mdInline(t.slice(2)) + '</blockquote>'); continue; }
        if (t.startsWith('- ')) {
            flushPara();
            if (!listOpen) { out.push('<ul>'); listOpen = true; }
            out.push('<li>' + mdInline(t.slice(2)) + '</li>');
            continue;
        }
        flushList();
        paraBuf.push(t);
    }
    flushPara(); flushList(); flushTable();
    return out.join('\n');
}

window.AppUtils = {
    mdToHtml,
    todayStr,
    localDateStr,
    parseLocalDate,
    shiftDateStr,
    escapeHtml,
    hexToRgb,
    formatNumCircle,
    escapeHtmlLines,
    renderContentBySetting,
    toast,
};
