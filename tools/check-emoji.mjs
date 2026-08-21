#!/usr/bin/env node
/**
 * check-emoji.mjs — 校验 emoji 图标资源一致性（防止"静默回退系统 emoji"与文件缺失）
 *
 * 校验内容：
 *   1. emoji-map.js 中每个键映射的 SVG 文件必须真实存在
 *   2. 源码中每个使用到的 emoji 字符都必须在映射表中可解析（含 U+FE0F 归一化，与 emoji() 行为一致）
 *   3. 直接以 src="emoji/xxx.svg" 引用的文件必须存在
 *   4. 提示 emoji/ 下未被任何地方引用的 SVG（疑似可清理）
 *
 * 用法：node scripts/check-emoji.mjs    （或 npm run check:emoji）
 * 退出码：0 通过 / 1 存在缺失或未映射等硬错误
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const emojiDir = join(root, 'emoji');

// 1) 读取 emoji-map.js，提取 键 -> 文件
const mapSrc = readFileSync(join(emojiDir, 'emoji-map.js'), 'utf8');
const mapFiles = new Map(
    [...mapSrc.matchAll(/"([^"]+)":\s*"([^"]+\.svg)"/g)].map(m => [m[1], m[2]])
);

// 2) 收集 emoji/*.svg 文件名
const svgFiles = readdirSync(emojiDir).filter(f => f.endsWith('.svg')).sort();

// 3) 递归收集源码 .js 文件
function collectJs(dir) {
    let files = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) files = files.concat(collectJs(p));
        else if (name.endsWith('.js')) files.push(p);
    }
    return files;
}
const codeFiles = collectJs(join(root, 'src'));
for (const f of ['index.html', 'floating.html']) {
    const p = join(root, f);
    try { if (statSync(p).isFile()) codeFiles.push(p); } catch { /* 忽略缺失 */ }
}

// 4) 归一化与解析（与 emoji() 完全一致）
const norm = s => String(s).replace(/\uFE0F/g, '');
const resolveFile = ch => mapFiles.get(norm(ch)) || mapFiles.get(ch);

// 5) 扫描代码中的用法
const usedChars = new Set();
const directFiles = new Set();
for (const f of codeFiles) {
    const src = readFileSync(f, 'utf8');
    // emoji('X') 调用 与 emoji: 'X' 字典键
    for (const m of src.matchAll(/emoji\(\s*['"]([^'"]+)['"]\s*\)|emoji:\s*['"]([^'"]+)['"]/g)) {
        usedChars.add(m[1] || m[2]);
    }
    // 直接图片引用 src="emoji/xxx.svg"
    for (const m of src.matchAll(/src=["']emoji\/([^"']+\.svg)["']/g)) {
        directFiles.add(m[1]);
    }
}

// 6) 硬错误校验
let errors = 0;
for (const [ch, file] of mapFiles) {
    if (!svgFiles.includes(file)) {
        console.error(`[缺失] 映射表 ${JSON.stringify(ch)} -> ${file}：emoji/ 下不存在该文件`);
        errors++;
    }
}
for (const ch of usedChars) {
    if (!resolveFile(ch)) {
        console.error(`[未映射] emoji 字符 ${JSON.stringify(ch)} 未在 emoji-map.js 注册，将回退系统 emoji`);
        errors++;
    }
}
for (const f of directFiles) {
    if (!svgFiles.includes(f)) {
        console.error(`[缺失] 直接引用的 ${f} 不存在`);
        errors++;
    }
}

// 7) 未引用文件提示
const referenced = new Set([...mapFiles.values(), ...directFiles]);
const orphans = svgFiles.filter(f => !referenced.has(f));
if (orphans.length) {
    console.log(`[提示] 以下 SVG 未被映射表/源码引用，疑似可清理：${orphans.join(', ')}`);
}

// 8) 汇总
console.log(
    `映射条目 ${mapFiles.size} 个 | 源码使用字符 ${usedChars.size} 个 | ` +
    `直接引用 ${directFiles.size} 个 | SVG 文件 ${svgFiles.length} 个`
);
if (errors) {
    console.error(`✗ 发现 ${errors} 个问题`);
    process.exit(1);
}
console.log('✓ 图标资源一致性校验通过');
