# -*- coding: utf-8 -*-
"""
docs-push-gui.py — 协议文档一键推送小工具（傻瓜版）
你只需要做一件事：点「一键推送」。
协议文件在哪、推送到哪个网站仓库，程序会自动找好，
只有自动找到的路径不对时才需要点「更改」重新选择。
用法：双击 start.cmd，或运行 python scripts/docs-push-gui.py
依赖：仅 Python 标准库（tkinter + subprocess），无需装任何第三方包。
"""
import os
import shutil
import subprocess
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

# 与 scripts/publish-docs.mjs 保持一致的文件清单
DOC_FILES = ["AGREEMENT.md", "PRIVACY.md", "SECURITY.md", "OPENSOURCE.md", "CONTACT.md"]

# ---- 自动探测：脚本在 <主仓库>/scripts/ 下，所以主仓库 = 脚本的上一级 ----
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SOURCE = os.path.dirname(SCRIPT_DIR)                # 主仓库根目录（放着 5 份协议）
DEFAULT_SITE = os.path.join(DEFAULT_SOURCE, ".pages-dist")  # 网站仓库工作区（classworkbench-site）

FONT = ("Microsoft YaHei", 9)
CONSOLE = ("Consolas", 9)


def run_cmd(cmd, cwd, log):
    """在指定目录执行命令，逐行写入日志；返回(成功?, 输出)。"""
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, shell=True, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=120
        )
    except subprocess.TimeoutExpired:
        log("命令超时：请检查网络或 git 状态。", "err")
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
        root.geometry("640x560")
        root.minsize(560, 480)
        self.checks = {}

        self._build()
        self._self_check()

    # ---- 界面 ----
    def _build(self):
        # 标题
        tk.Label(self.root, text="协议文档一键推送",
                 font=("Microsoft YaHei", 15, "bold"), fg="#5b6abf", anchor="w"
                 ).pack(fill="x", padx=14, pady=(12, 2))

        # 两行路径（只读展示 + 更改按钮），下面是状态提示
        def path_row(label, var, pick):
            row = tk.Frame(self.root)
            row.pack(fill="x", padx=14, pady=1)
            tk.Label(row, text=label, width=8, anchor="w", font=FONT).pack(side="left")
            tk.Label(row, textvariable=var, anchor="w", fg="#333", font=CONSOLE
                     ).pack(side="left", fill="x", expand=True)
            tk.Button(row, text="更改", width=6, command=pick).pack(side="left")

        self.src_show = tk.StringVar(value=DEFAULT_SOURCE)
        self.site_show = tk.StringVar(value=DEFAULT_SITE)
        self.src_lbl = tk.Label(self.root, text="", anchor="w", font=FONT)
        self.site_lbl = tk.Label(self.root, text="", anchor="w", font=FONT)
        path_row("协议文件", self.src_show, self.pick_src)
        self.src_lbl.pack(fill="x", padx=14)
        path_row("网站仓库", self.site_show, self.pick_site)
        self.site_lbl.pack(fill="x", padx=14)

        # 文件选择（默认全选，一般不用动）
        tk.Label(self.root, text="要推送的文档：", anchor="w",
                 font=("Microsoft YaHei", 10)).pack(fill="x", padx=14, pady=(10, 2))
        file_frame = tk.Frame(self.root)
        file_frame.pack(fill="x", padx=14)
        for i, f in enumerate(DOC_FILES):
            var = tk.BooleanVar(value=True)
            tk.Checkbutton(file_frame, text=f, variable=var, anchor="w").grid(
                row=i // 3, column=i % 3, sticky="w", padx=4, pady=2)
            self.checks[f] = var

        # 一键推送大按钮
        self.push_btn = tk.Button(
            self.root, text="一  键  推  送", command=self.do_push,
            bg="#5b6abf", fg="white", activebackground="#4a58ad", activeforeground="white",
            font=("Microsoft YaHei", 13, "bold"), padx=30, pady=10, cursor="hand2"
        )
        self.push_btn.pack(pady=10)

        # 日志
        tk.Label(self.root, text="运行日志", anchor="w",
                 font=("Microsoft YaHei", 10)).pack(fill="x", padx=14)
        self.log_box = tk.Text(self.root, height=11, state="disabled",
                               font=CONSOLE, bg="#fafafa")
        self.log_box.pack(fill="both", expand=True, padx=14, pady=(2, 12))
        self.log_box.tag_config("err", foreground="#d45a5a")
        self.log_box.tag_config("ok", foreground="#3a8a5a")

    # ---- 环境自检：一眼看清是否正常（✓ 绿 / ✗ 红 / ⚠ 橙） ----
    def _self_check(self):
        src = self.src_show.get().strip()
        site = self.site_show.get().strip()

        if os.path.isdir(src):
            exist = sum(1 for f in DOC_FILES if os.path.isfile(os.path.join(src, f)))
            if exist == len(DOC_FILES):
                self.src_lbl.config(text=f"✓ 已找到全部 {exist} 份协议文件", fg="#3a8a5a")
            else:
                self.src_lbl.config(text=f"⚠ 只找到 {exist}/{len(DOC_FILES)} 份，请点『更改』确认目录", fg="#d47f2a")
        else:
            self.src_lbl.config(text="✗ 目录不存在，请点『更改』重新选择", fg="#d45a5a")

        if os.path.isdir(site):
            ok, _ = run_cmd("git rev-parse --is-inside-work-tree", site, self._quiet)
            if ok:
                self.site_lbl.config(text="✓ 网站仓库正常，可以推送", fg="#3a8a5a")
            else:
                self.site_lbl.config(text="✗ 不是 git 仓库，请点『更改』选择正确的仓库", fg="#d45a5a")
        else:
            self.site_lbl.config(text="✗ 目录不存在，请点『更改』重新选择", fg="#d45a5a")

    def _quiet(self, _text, _tag=None):
        pass

    # ---- 更改目录 ----
    def pick_src(self):
        p = filedialog.askdirectory(initialdir=self.src_show.get() or os.getcwd())
        if p:
            self.src_show.set(os.path.normpath(p))
            self._self_check()

    def pick_site(self):
        p = filedialog.askdirectory(initialdir=self.site_show.get() or os.getcwd())
        if p:
            self.site_show.set(os.path.normpath(p))
            self._self_check()

    def log(self, text, tag=None):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{time.strftime('%H:%M:%S')}] {text}\n", tag or ())
        self.log_box.see("end")
        self.log_box.configure(state="disabled")
        self.root.update_idletasks()

    # ---- 一键推送 ----
    def do_push(self):
        src = self.src_show.get().strip()
        site = self.site_show.get().strip()
        picked = [f for f, var in self.checks.items() if var.get()]

        if not os.path.isdir(src):
            messagebox.showerror("路径不对", f"找不到协议文件所在目录：\n{src}\n\n请点『更改』重新选择。")
            return
        if not os.path.isdir(site):
            messagebox.showerror("路径不对", f"找不到网站仓库目录：\n{site}\n\n请点『更改』重新选择。")
            return
        if not picked:
            messagebox.showwarning("没有选择", "请至少勾选一份要推送的文档。")
            return

        ok, _ = run_cmd("git rev-parse --is-inside-work-tree", site, self._quiet)
        if not ok:
            messagebox.showerror("不是 git 仓库", f"该目录不是 git 仓库：\n{site}")
            return

        self.push_btn.configure(state="disabled", text="推送中，请稍候…")
        threading.Thread(target=self._worker, args=(src, site, picked), daemon=True).start()

    def _worker(self, src, site, picked):
        try:
            out_dir = os.path.join(site, "docs")
            os.makedirs(out_dir, exist_ok=True)

            # 1) 复制文档到网站仓库 docs/
            self.log(f"① 复制 {len(picked)} 份文档到网站仓库 docs/")
            if len(picked) < len(DOC_FILES):
                self.log("   未勾选的文档保持线上原样，不会被删除", "ok")
            missing = []
            for f in picked:
                s = os.path.join(src, f)
                if not os.path.isfile(s):
                    missing.append(f)
                    continue
                shutil.copyfile(s, os.path.join(out_dir, f))
                self.log(f"   ✓ {f}", "ok")
            if missing:
                self.log("   以下文件不存在，已跳过：", "err")
                for f in missing:
                    self.log(f"   ✗ {f}", "err")

            # 2) git 提交并推送
            self.log("② 提交并推送到 GitHub …")
            run_cmd("git add docs", site, self.log)
            run_cmd('git commit -m "docs: sync agreements from main repo"', site, self.log)
            ok, _ = run_cmd("git push", site, self.log)
            if not ok:
                self.log("✗ 推送失败：若提示无跟踪分支，请先执行 git push -u origin main", "err")
                self._finish(False)
                return

            # 3) 完成
            self.log("③ 完成！网站即将更新，约 1~几分钟后生效：", "ok")
            self.log("   https://windows-11-pro.github.io/classworkbench-site/", "ok")
            self._finish(True)
        except Exception as e:
            self.log(f"异常：{e}", "err")
            self._finish(False)

    def _finish(self, success):
        self.push_btn.configure(state="normal", text="一  键  推  送")
        if success:
            messagebox.showinfo("推送成功", "协议文档已推送到 GitHub。\n约 1~几分钟后，应用即可自动拉到最新文档。")
        else:
            messagebox.showerror("推送失败", "请查看上方日志中的红色提示，处理后再试。")


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
