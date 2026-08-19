// ============================================
// homework-engine.js
// 作业识别引擎：从 QQ 通知中抽取作业候选
//
// 核心流程：
//   1. 老师匹配（两层）：
//      a) 顶层 sender 直接命中老师昵称（私聊场景）
//      b) 群聊场景：sender 是群名，从消息体中扫描 "老师名：" 提取发送者
//   2. 学科推断：仅依赖老师-学科映射（手动配置，100% 可靠）
//      老师未绑定学科 → 直接放弃
//   3. 评分（总分 100）：
//      - 学科命中 (30)：老师映射 +30 / 无映射 → 放弃
//      - 作业意图 (40)：强关键词 +40 / 弱关键词 +30 / 编号列表 +25 / 无 +0
//      - 结构特征 (20)：冒号+内容≥4字 +20 / 冒号 +10 / 无 +0
//      - 内容质量 (10)：页码题号 +10 / 内容长度≥10字 +5 / 无 +0
//   4. 阈值：40（学科未命中直接放弃）
//   5. 日期不自动识别，交给用户通过胶囊控件手动选择
// ============================================

(function () {
    const state = window.AppState;

    // 获取关键词词表（用户可在设置面板自定义）
    // 强关键词命中 +40，弱关键词命中 +30
    const DEFAULT_STRONG = ['作业', '完成', '上交', '提交', '订正', '背诵', '默写'];
    const DEFAULT_WEAK = ['做', '写', '复习', '预习', '练习', '答案'];

    function getKeywords() {
        const kw = (state.settings.qq && state.settings.qq.keywords) || {};
        return {
            strong: Array.isArray(kw.strong) ? kw.strong.filter(k => k) : DEFAULT_STRONG,
            weak: Array.isArray(kw.weak) ? kw.weak.filter(k => k) : DEFAULT_WEAK
        };
    }

    // ---- 群聊消息体中提取老师 ----
    // 扫描消息中 "老师名：" 或 "老师名:" 模式，返回匹配的老师及冒号后的内容
    function findTeacherInMessage(message, teachers) {
        for (const t of teachers) {
            if (!t || typeof t.name !== 'string') continue;
            const name = t.name.trim();
            if (!name) continue;
            const idx = message.indexOf(name);
            if (idx < 0) continue;
            // 检查老师名后面是否紧跟（可有空格）冒号
            const afterName = message.substring(idx + name.length);
            const colonMatch = afterName.match(/^[\s]*[:：][\s]*([\s\S]+)/);
            if (colonMatch) {
                return { teacher: t, contentAfter: colonMatch[1] };
            }
        }
        return null;
    }

    // ---- 检测编号列表（1. 2. 或 1、2、 等）----
    function hasNumberedList(text) {
        const matches = text.match(/\d+[.、．]\s/g);
        return matches && matches.length >= 1;
    }

    // ---- 检测页码/题号引用 ----
    function hasPageOrProblemRef(text) {
        return /P\d|p\d|第\d+[页题课]|页\s*\d/.test(text);
    }

    /**
     * 主入口：从 Notification 抽取作业候选
     */
    function extract(notification) {
        if (!notification || !notification.message) return null;
        const originalMessage = notification.message;
        const sender = notification.sender || '';

        // ---- 硬规则：必须在老师列表中才识别 ----
        const teachers = (state.settings.qq && state.settings.qq.teachers) || [];
        if (teachers.length === 0) return null;

        // ---- 老师匹配（两层）----
        // 1) 顶层 sender 直接命中（私聊场景）
        const senderNorm = (sender || '').trim();
        let teacherEntry = teachers.find(t =>
            t && typeof t.name === 'string' && senderNorm === t.name.trim()
        );
        let messageBody = originalMessage;
        let senderMatchMode = '';

        if (teacherEntry) {
            senderMatchMode = '私聊sender命中';
        } else {
            // 2) 群聊场景：sender 是群名，老师名嵌在消息体 "老师名：" 中
            const found = findTeacherInMessage(originalMessage, teachers);
            if (found) {
                teacherEntry = found.teacher;
                messageBody = found.contentAfter;
                senderMatchMode = '群聊消息体提取';
            }
        }

        if (!teacherEntry) return null;

        const breakdown = { senderMatch: senderMatchMode };
        let score = 0;

        // ---- 维度 1: 学科命中 (30) ----
        // 仅依赖老师-学科映射：手动配置，100% 可靠
        // （老师不会在自己的消息里重复学科名，消息命中反而容易误判）
        const subjects = state.subjectList || [];
        let matchedSubject = null;
        let subjectSource = '';

        if (teacherEntry.subjectId) {
            const s = subjects.find(x => x.id === teacherEntry.subjectId);
            if (s) {
                matchedSubject = s;
                subjectSource = '老师映射';
                score += 30;
                breakdown.subject = `+30 学科命中（老师映射）: ${s.name}`;
            }
        }
        if (!matchedSubject) {
            breakdown.subject = '+0 老师未绑定学科';
            breakdown.threshold = '放弃：老师未绑定学科，不产出候选';
            return null;
        }

        breakdown.date = '用户手动选择';

        // ---- 维度 2: 作业意图 (40) ----
        // 优先级：强关键词 > 弱关键词 > 编号列表
        const { strong: strongKw, weak: weakKw } = getKeywords();
        let hitKeyword = null;
        for (const k of strongKw) {
            if (messageBody.includes(k)) {
                hitKeyword = k;
                score += 40;
                breakdown.intent = `+40 强关键词: "${k}"`;
                break;
            }
        }
        if (!hitKeyword) {
            for (const k of weakKw) {
                if (messageBody.includes(k)) {
                    hitKeyword = k;
                    score += 30;
                    breakdown.intent = `+30 弱关键词: "${k}"`;
                    break;
                }
            }
        }
        if (!hitKeyword) {
            // 编号列表也是作业信号（如 "1.课本P20 2.练习册"）
            if (hasNumberedList(messageBody)) {
                score += 25;
                breakdown.intent = '+25 编号列表';
            } else {
                breakdown.intent = '+0 无作业意图信号';
            }
        }

        // ---- 维度 3: 结构特征 (20) ----
        // 直接检测完整消息是否包含冒号结构，不截取内容
        const hasColon = /[:：]/.test(messageBody);
        if (hasColon && messageBody.length >= 4) {
            score += 20;
            breakdown.structure = '+20 冒号结构';
        } else if (hasColon) {
            score += 10;
            breakdown.structure = '+10 冒号结构，内容过短';
        } else {
            breakdown.structure = '+0 无冒号结构';
        }

        // ---- 维度 4: 内容质量 (10) ----
        if (hasPageOrProblemRef(messageBody)) {
            score += 10;
            breakdown.content = '+10 页码/题号引用';
        } else if (messageBody.length >= 10) {
            score += 5;
            breakdown.content = `+5 内容长度 ${messageBody.length}`;
        } else {
            breakdown.content = '+0 无内容质量特征';
        }

        // ---- 阈值判定 ----
        const threshold = 40;
        breakdown.threshold = `阈值 ${threshold}`;
        if (score < threshold) return null;

        return {
            sender,
            teacher: teacherEntry.name,
            subjectId: matchedSubject.id,
            subjectName: matchedSubject.name,
            subjectColor: matchedSubject.color,
            subjectSource,
            content: messageBody.trim(),
            date: null,
            score,
            breakdown,
            rawMessage: originalMessage,
            timestamp: Date.now()
        };
    }

    window.HomeworkEngine = { extract };
})();
