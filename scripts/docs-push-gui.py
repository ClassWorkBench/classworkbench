# -*- coding: utf-8 -*-
"""
docs-push-gui.py — 协议文档一键推送（GitHub Pages）小工具
功能：
  1. 选择"主仓库目录"（放 AGREEMENT.md / PRIVACY.md 等 5 份协议源文件的地方）
  2. 选择"站点目录"（classworkbench-site 工作区，默认 .pages-dist）
  3. 勾选要推送的文件
  4. 一键推送：复制 .md → 站点/docs/ → git add/commit/push → 触发 Pages 部署
用法：
  python scripts/docs-push-gui.py
依赖：仅 Python 标准库（tkinter + subprocess），无需装第三方包。
"""
import os
import shutil
import subprocess
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# 与 npm scripts/publish-docs.mjs 保持一致的文件清单
DOC_FILES = ["AGREEMENT.md", "PRIVACY.md", "SECURITY.md", "OPENSOURCE.md", "CONTACT.md"]

# 若主仓库/站点目录留空时自动探测的默认相对路径
DEFAULT_SOURCE = os.getcwd()
DEFAULT_SITE = os.path.join(DEFAULT_SOURCE, ".pages-dist")


def run_cmd(cmd, cwd, log):
    """在指定目录执行命令，实时把输出写入日志；返回(成功?, 输出文本)。"""
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=120
        )
    except subprocess.TimeoutExpired:
        log("命令超时：可能需要检查网络或 git 状态。")
        return False, ""
    for line in (proc.stdout or "").rstrip().splitlines():
        log(line)
    for line in (proc.stderr or "").rstrip().splitlines():
        log(line)
    return proc.returncode == 0, (proc.stdout or "") + (proc.stderr or "")


class DocPushApp:
    def __init__(self, root):
        self.root = root
        root.title("协议文档一键推送")
        root.geometry("680x560")
        root.minsize(600, 500)
        self.checks = {}

        self._build()

    def _build(self):
        pad = {"padx": 10, "pady": 4}

        # ---- 主仓库目录 ----
        tk.Label(self.root, text="① 主仓库目录（协议源文件所在）", anchor="w").pack(fill="x", **pad)
        row = tk.Frame(self.root)
        row.pack(fill="x", padx=10)
        self.src_var = tk.StringVar(value=DEFAULT_SOURCE)
        tk.Entry(row, textvariable=self.src_var).pack(side="left", fill="x", expand=True)
        tk.Button(row, text="选择目录", command=self.pick_dir(self.src_var)).pack(side="left", padx=(6, 0))

        # ---- 站点目录 ----
        tk.Label(self.root, text="② 站点目录（classworkbench-site 工作区）", anchor="w").pack(fill="x", **pad)
        row = tk.Frame(self.root)
        row.pack(fill="x", padx=10)
        self.site_var = tk.StringVar(value=DEFAULT_SITE)
        tk.Entry(row, textvariable=self.site_var).pack(side="left", fill="x", expand=True)
        tk.Button(row, text="选择目录", command=self.pick_dir(self.site_var)).pack(side="left", padx=(6, 0))

        # ---- 文件勾选 ----
        tk.Label(self.root, text="③ 选择要推送的文件", anchor="w").pack(fill="x", **pad)
        file_frame = tk.Frame(self.root)
        file_frame.pack(fill="x", padx=10)
        for i, f in enumerate(DOC_FILES):
            var = tk.BooleanVar(value=True)
            tk.Checkbutton(file_frame, text=f, variable=var).grid(
                row=i // 3, column=i % 3, sticky="w", padx=6, pady=2)
            self.checks[f] = var

        # ---- 推送按钮 ----
        self.push_btn = tk.Button(
            self.root, text="一键推送", command=self.do_push,
            bg="#5b6abf", fg="white", activebackground="#4a58ad", activeforeground="white",
            font=("Microsoft YaHei", 11, "bold"), padx=20, pady=6
        )
        self.push_btn.pack(pady=8)

        # ---- 日志输出 ----
        tk.Label(self.root, text="运行日志", anchor="w").pack(fill="x", padx=10)
        self.log_box = tk.Text(self.root, height=12, state="disabled", font=("Consolas", 9))
        self.log_box.pack(fill="both", expand=True, padx=10, pady=(4, 10))
        self.log_box.tag_config("err", foreground="#d45a5a")
        self.log_box.tag_config("ok", foreground="#3a8a5a")

    def pick_dir(self, var):
        def fn():
            p = filedialog.askdirectory(initialdir=var.get() or os.getcwd())
            if p:
                var.set(os.path.normpath(p))
        return fn

    def log(self, text, tag=None, ts=True):
        self.log_box.configure(state="normal")
        line = (f"[{__import__('time').strftime('%H:%M:%S')}] {text}\n") if ts else (text + "\n")
        self.log_box.insert("end", line, tag or ())
        self.log_box.see("end")
        self.log_box.configure(state="disabled")
        self.root.update_idletasks()

    def do_push(self):
        src = self.src_var.get().strip()
        site = self.site_var.get().strip()
        picked = [f for f, var in self.checks.items() if var.get()]

        if not os.path.isdir(src):
            messagebox.showerror("错误", f"主仓库目录不存在：\n{src}")
            return
        if not os.path.isdir(site):
            messagebox.showerror("错误", f"站点目录不存在：\n{site}")
            return
        if not picked:
            messagebox.showwarning("提示", "请至少勾选一个文件。")
            return

        # 校验站点是 git 仓库
        ok, _ = run_cmd("git rev-parse --is-inside-work-tree", site, self.log)
        if not ok:
            messagebox.showerror("错误", f"站点目录不是 git 仓库：\n{site}")
            return

        self.push_btn.configure(state="disabled", text="推送中…")
        threading.Thread(target=self._do_push_worker, args=(src, site, picked), daemon=True).start()

    def _do_push_worker(self, src, site, picked):
        try:
            out_dir = os.path.join(site, "docs")
            os.makedirs(out_dir, exist_ok=True)

            # 1) 复制选中的文件
            self.log(f"1）复制 {len(picked)} 个文件到 {os.path.relpath(out_dir, os.getcwd())}/")
            missing = []
            for f in picked:
                s = os.path.join(src, f)
                if not os.path.isfile(s):
                    missing.append(f)
                    continue
                shutil.copyfile(s, os.path.join(out_dir, f))
                self.log(f"  → {f}", "ok")

            # 2) 删除站点里已被取消勾选、但之前推送过的 .md（保持 docs/ 与勾选一致）
            for f in DOC_FILES:
                old = os.path.join(out_dir, f)
                if f not in picked and os.path.exists(old):
                    os.remove(old)
                    self.log(f"  ↺ 移除 {f}（未勾选）", "ok")

            if missing:
                self.log("以下文件不存在，已跳过：", "err")
                for f in missing:
                    self.log(f"  × {f}", "err")

            # 3) git 提交并推送
            self.log("2）git add/commit/push …")
            run_cmd("git add docs", site, self.log)
            ok, _ = run_cmd('git commit -m "docs: sync agreements from main repo"', site, self.log)
            if not ok:
                self.log("（无变更或提交失败，继续尝试推送）")
            ok, _ = run_cmd("git push", site, self.log)
            if not ok:
                self.log("推送失败：若提示无跟踪分支，请先执行 git push -u origin main", "err")
                self._finish()
                return

            self.log("3）完成！等待约 1~几分钟 Pages 生效：", "ok")
            self.log("   https://windows-11-pro.github.io/classworkbench-site/", "ok")
        except Exception as e:
            self.log(f"异常：{e}", "err")
        finally:
            self._finish()

    def _finish(self):
        self.push_btn.configure(state="normal", text="一键推送")


def main():
    root = tk.Tk()
    try:
        style = ttk.Style(root)
        style.theme_use("vista")
    except Exception:
        pass
    DocPushApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()