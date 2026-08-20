// ============================================
// scripts/publish-docs.mjs — 一键发布协议文档到 GitHub Pages
// 数据源：主仓库根目录的 5 份 .md（唯一真源）
// 目标：.pages-dist/docs/（classworkbench-site 独立仓库）→ push 触发 Pages 重部署
// 用途：让应用的三级兜底中"GitHub Pages"这一层能拉到最新协议。
// 依赖：本机已安装 git（并有 classworkbench-site 的推送权限）。
// 用法：npm run docs:publish
// ============================================
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');          // 主仓库根目录
const SITE = path.join(ROOT, '.pages-dist');          // classworkbench-site 工作区
const DOCS_OUT = path.join(SITE, 'docs');

const DOC_FILES = ['AGREEMENT.md', 'PRIVACY.md', 'SECURITY.md', 'OPENSOURCE.md', 'CONTACT.md'];

function sh(cmd, cwd, { silent = false } = {}) {
    const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: silent ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    return out && out.trim();
}

function ensureGitRepo() {
    try {
        sh('git rev-parse --show-toplevel', SITE, { silent: true });
    } catch {
        console.error(`[publish-docs] 不是 git 仓库：${SITE}`);
        process.exit(1);
    }
}

function copyDocs() {
    fs.mkdirSync(DOCS_OUT, { recursive: true });
    for (const f of DOC_FILES) {
        const src = path.join(ROOT, f);
        if (!fs.existsSync(src)) {
            console.warn(`[publish-docs] 跳过缺失文件：${f}`);
            continue;
        }
        fs.copyFileSync(src, path.join(DOCS_OUT, f));
        console.log(`  → ${f}`);
    }
}

function main() {
    if (!fs.existsSync(SITE)) {
        console.error(`[publish-docs] 找不到站点工作区：${SITE}`);
        console.error('请先把 classworkbench-site 克隆/链接到该目录，或调整 SITE 路径。');
        process.exit(1);
    }
    ensureGitRepo();

    console.log('1) 同步 .md → docs/');
    copyDocs();

    const remote = sh('git remote -v', SITE, { silent: true }) || '';
    if (!remote.includes('classworkbench-site')) {
        console.warn('   ⚠ 当前站点的远程仓库不是 classworkbench-site，请确认。');
    }

    console.log('2) 提交并推送（触发 Pages 重部署）');
    sh('git add docs', SITE);
    sh('git commit -m "docs: sync agreements from main repo"', SITE, { silent: true });
    try {
        sh('git push', SITE, { silent: true });
    } catch {
        console.error('   推送失败（如无远程跟踪分支，请先 git push -u origin main）');
        process.exit(1);
    }

    console.log('3) 完成。等待约 1~几分钟后 Pages 生效：');
    console.log('   https://windows-11-pro.github.io/classworkbench-site/docs/AGREEMENT.md');
    console.log('   （应用内的 GitHub Pages 兜底层会自动拉到最新协议）');
}

main();