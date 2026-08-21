using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;

namespace PublishHelper;

/// <summary>
/// 班级工作台发布助手 —— 一键发布应用新版本 + 同步协议文档。
/// </summary>
public partial class MainWindow : Window
{
    // 协议文档清单（与官网 docs/ 同步保持一致）
    private static readonly string[] DocFiles =
        { "AGREEMENT.md", "PRIVACY.md", "SECURITY.md", "OPENSOURCE.md", "CONTACT.md" };

    private string _rootDir = "";   // 主仓库根目录（含 package.json）
    private string _srcDir = "";    // 协议文件目录 = 主仓库根目录
    private string _siteDir = "";   // 网站仓库工作区 .pages-dist

    private readonly Dictionary<string, CheckBox> _docChecks = new();
    private bool _busy;

    public MainWindow()
    {
        InitializeComponent();
        LocateRepo();
        Loaded += OnLoaded;
    }

    // ---------- 路径自动探测：向上找含 package.json 的目录 ----------
    private void LocateRepo()
    {
        var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (dir != null && !File.Exists(Path.Combine(dir.FullName, "package.json")))
            dir = dir.Parent;
        _rootDir = dir?.FullName ?? Environment.CurrentDirectory;
        _srcDir = _rootDir;
        _siteDir = Path.Combine(_rootDir, ".pages-dist");
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        BuildDocChecks();
        SrcPathText.Text = _srcDir;
        SitePathText.Text = _siteDir;

        var cur = ReadPackageVersion();
        CurrentVersionText.Text = cur;
        NewVersionBox.Text = NextVersion(cur);
        if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GH_TOKEN"))
            && string.IsNullOrEmpty(Environment.GetEnvironmentVariable("GITHUB_TOKEN")))
        {
            TokenHint.Visibility = Visibility.Visible;
        }

        // 环境自检（后台执行，避免卡界面）
        Task.Run(CheckEnvironment);
        NewVersionBox.Focus();
    }

    // ---------- 环境自检 ----------
    private void CheckEnvironment()
    {
        var nodeOk = !string.IsNullOrEmpty(RunQuick("node", "--version"));
        var gitOk = !string.IsNullOrEmpty(RunQuick("git", "--version"));
        var builderOk = File.Exists(Path.Combine(_rootDir, "node_modules", ".bin", "electron-builder.cmd"));

        var siteIsGit = !string.IsNullOrEmpty(RunQuick("git", "rev-parse --is-inside-work-tree", _siteDir));
        var srcFiles = DocFiles.Count(f => File.Exists(Path.Combine(_srcDir, f)));

        var branch = RunQuick("git", "rev-parse --abbrev-ref HEAD", _rootDir);
        var remote = RunQuick("git", "config --get remote.origin.url", _rootDir);
        remote = remote.Replace("https://github.com/", "").TrimEnd(".git".ToCharArray());
        if (remote.Length == 0) remote = "无远程仓库";

        var allOk = nodeOk && gitOk && builderOk && siteIsGit && srcFiles == DocFiles.Length;

        Dispatcher.Invoke(() =>
        {
            EnvDot.Fill = new SolidColorBrush(allOk
                ? (Color)ColorConverter.ConvertFromString("#3DDC84")
                : (Color)ColorConverter.ConvertFromString("#FFB24D"));
            EnvStatusText.Text = allOk ? "环境就绪，可以发布" : "环境有缺失（见下方日志）";

            GitInfoText.Text = string.IsNullOrEmpty(branch) ? "" : $"{branch} · {remote}";

            // 协议文档视图状态
            SrcDot.Fill = new SolidColorBrush(srcFiles == DocFiles.Length
                ? (Color)ColorConverter.ConvertFromString("#3DDC84")
                : (Color)ColorConverter.ConvertFromString("#FFB24D"));
            SrcStatusText.Text = srcFiles == DocFiles.Length
                ? $"已找到全部 {srcFiles} 份协议文件"
                : $"只找到 {srcFiles}/{DocFiles.Length} 份协议文件";

            SiteDot.Fill = new SolidColorBrush(siteIsGit
                ? (Color)ColorConverter.ConvertFromString("#3DDC84")
                : (Color)ColorConverter.ConvertFromString("#FF5A5A"));
            SiteStatusText.Text = siteIsGit
                ? "网站仓库正常，可以推送"
                : "不是 git 仓库，请点『更改』选择正确目录";

            if (!allOk)
            {
                Log(ReleaseLog, "环境自检：", "#FFB24D");
                Log(ReleaseLog, "  node：" + (nodeOk ? "✓" : "✗ 未安装 Node.js"), nodeOk ? "#9FE8B5" : "#FF8A8A");
                Log(ReleaseLog, "  git：" + (gitOk ? "✓" : "✗ 未安装 git"), gitOk ? "#9FE8B5" : "#FF8A8A");
                Log(ReleaseLog, "  electron-builder：" + (builderOk ? "✓" : "✗ 未安装，请先 npm install"), builderOk ? "#9FE8B5" : "#FF8A8A");
                Log(ReleaseLog, "  网站仓库：" + (siteIsGit ? "✓" : "✗ .pages-dist 不是 git 仓库"), siteIsGit ? "#9FE8B5" : "#FF8A8A");
            }
        });
    }

    // ---------- 文档勾选项 ----------
    private void BuildDocChecks()
    {
        foreach (var f in DocFiles)
        {
            var cb = new CheckBox
            {
                Content = f,
                IsChecked = true,
                FontSize = 12.5,
                Foreground = (Brush)FindResource("TextPrimaryBrush"),
                Margin = new Thickness(0, 5, 18, 5)
            };
            _docChecks[f] = cb;
            DocList.Children.Add(cb);
        }
    }

    // ---------- 视图切换 ----------
    private void Nav_Click(object sender, RoutedEventArgs e)
    {
        var showRelease = NavRelease.IsChecked == true;
        ReleaseView.Visibility = showRelease ? Visibility.Visible : Visibility.Collapsed;
        DocsView.Visibility = showRelease ? Visibility.Collapsed : Visibility.Visible;
        PageTitle.Text = showRelease ? "发布新版本" : "同步协议文档";
    }

    // ---------- 窗口控制 ----------
    private void MinBtn_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;
    private void CloseBtn_Click(object sender, RoutedEventArgs e) => Close();
    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();
    private void SidebarHeader_MouseLeftButtonDown(object sender, MouseButtonEventArgs e) => DragMove();

    // ---------- 版本号 ----------
    private string ReadPackageVersion()
    {
        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(_rootDir, "package.json")));
            return doc.RootElement.GetProperty("version").GetString() ?? "0.0.0";
        }
        catch { return "—"; }
    }

    private void UpdatePackageVersion(string newVer)
    {
        var path = Path.Combine(_rootDir, "package.json");
        var node = JsonNode.Parse(File.ReadAllText(path))!;
        node["version"] = newVer;
        File.WriteAllText(path, node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    private static string NextVersion(string cur)
    {
        if (TryParseVersion(cur, out var v))
        {
            v[2]++;
            return string.Join(".", v);
        }
        return "";
    }

    private void PlusVersion_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: string kind }) return;
        var baseVer = NewVersionBox.Text.Trim();
        if (!TryParseVersion(baseVer, out var v))
        {
            baseVer = CurrentVersionText.Text.Trim();
            if (!TryParseVersion(baseVer, out v)) return;
        }
        if (kind == "patch") v[2]++;
        else if (kind == "minor") v[1]++;
        NewVersionBox.Text = string.Join(".", v);
    }

    private static bool TryParseVersion(string s, out int[] v)
    {
        v = new int[3];
        if (string.IsNullOrWhiteSpace(s)) return false;
        var parts = s.Split('.');
        if (parts.Length != 3) return false;
        for (var i = 0; i < 3; i++)
            if (!int.TryParse(parts[i], out v[i])) return false;
        return true;
    }

    // =====================================================================
    //  发布新版本
    // =====================================================================
    private async void ReleaseButton_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;

        var newVer = NewVersionBox.Text.Trim();
        if (!TryParseVersion(newVer, out _))
        {
            MessageBox.Show(this, "请输入合法的版本号，格式如 1.2.3", "版本号不对",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (newVer == CurrentVersionText.Text.Trim()
            && MessageBox.Show(this, "新版本号与当前版本相同，确定继续发布吗？", "版本号相同",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;

        var online = PublishOnline.IsChecked == true;
        var token = TokenBox.Password;
        var envToken = Environment.GetEnvironmentVariable("GH_TOKEN");
        if (string.IsNullOrEmpty(envToken)) envToken = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
        if (online && string.IsNullOrEmpty(token) && string.IsNullOrEmpty(envToken))
        {
            MessageBox.Show(this, "发布到 GitHub 需要 Token：请在下方粘贴 GitHub Token，\n或提前设置系统环境变量 GH_TOKEN。", "缺少 Token",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        SetBusy(true, ReleaseButton, ReleaseButtonText, "发布中…");
        Log(ReleaseLog, $"────────── 开始发布 v{newVer} ──────────", "#6EA8FE");
        try
        {
            // ① 更新 package.json 版本
            Log(ReleaseLog, "① 更新 package.json 版本 → " + newVer, "#9FE8B5");
            UpdatePackageVersion(newVer);

            // ② 构建（可选发布到 GitHub Releases）
            var builder = Path.Combine(_rootDir, "node_modules", ".bin", "electron-builder.cmd");
            if (!File.Exists(builder))
            {
                Log(ReleaseLog, "✗ 找不到 electron-builder，请先执行 npm install", "#FF8A8A");
                MessageBox.Show(this, "未安装依赖，请先执行 npm install", "缺少依赖", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            var buildArgs = online ? "--publish always" : "--publish never";
            Log(ReleaseLog, "② 执行 electron-builder " + buildArgs, "#9FE8B5");
            var env = new Dictionary<string, string>
            {
                // 本机装有自定义根证书时，Node 默认证书库不信任会报 TLS 校验失败；
                // 让 Node 同时使用系统证书库（Node ≥ 22.12 支持，缺失时无害）。
                ["NODE_OPTIONS"] = "--use-system-ca"
            };
            if (online && !string.IsNullOrEmpty(token)) env["GH_TOKEN"] = token;
            var code = await RunCmdAsync("cmd.exe", $"/c \"\"{builder}\" {buildArgs}\"", _rootDir,
                s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"), env, Encoding.UTF8);
            if (code != 0)
            {
                Log(ReleaseLog, $"✗ 构建{(online ? "/发布" : "")}失败（退出码 {code}）", "#FF8A8A");
                MessageBox.Show(this, "构建失败，请查看上方红色日志。", "构建失败", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            Log(ReleaseLog, $"✓ 构建{(online ? "并发布到 GitHub" : "")}完成", "#9FE8B5");

            // ③ 提交并推送版本号改动（仅在线发布时）
            if (online)
            {
                Log(ReleaseLog, "③ 提交并推送版本号改动到主仓库", "#9FE8B5");
                await RunCmdAsync("git", "add package.json", _rootDir, s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                var c = await RunCmdAsync("git", $"commit -m \"chore(release): v{newVer}\"", _rootDir,
                    s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                if (c != 0) Log(ReleaseLog, "⚠ 提交未产生新提交（可能无改动）", "#FFB24D");
                var p = await RunCmdAsync("git", "push", _rootDir, s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                if (p != 0) Log(ReleaseLog, "⚠ 代码推送失败，请稍后手动 git push", "#FFB24D");
                else Log(ReleaseLog, "✓ 版本号已提交并推送", "#9FE8B5");

                // ④ 同步官网下载链接（index.html / manual.html → 最新版本）
                Log(ReleaseLog, "④ 更新官网下载链接 → v" + newVer, "#9FE8B5");
                await UpdateSiteDownloadLinks(newVer, ReleaseLog);
            }

            Log(ReleaseLog, "────────── 发布完成 ✓ ──────────", "#9FE8B5");
            MessageBox.Show(this, online
                ? $"v{newVer} 已发布到 GitHub Releases。\n应用内点击「检查更新」即可在线升级；\n官网下载链接已同步。"
                : $"v{newVer} 本地构建完成。", "发布完成", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            Log(ReleaseLog, "异常：" + ex.Message, "#FF8A8A");
            MessageBox.Show(this, "发布过程出错：" + ex.Message, "发布出错", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            SetBusy(false, ReleaseButton, ReleaseButtonText, "开 始 发 布");
        }
    }

    // =====================================================================
    //  同步协议文档
    // =====================================================================
    private void PickSrc_Click(object sender, RoutedEventArgs e) => PickFolder(ref _srcDir, SrcPathText);
    private void PickSite_Click(object sender, RoutedEventArgs e) => PickFolder(ref _siteDir, SitePathText);

    /// <summary>
    /// 更新 classworkbench-site 的下载链接为指定版本并推送。
    /// 站点不可用或无改动时只记录警告，不阻断发布。
    /// </summary>
    private async Task UpdateSiteDownloadLinks(string newVer, RichTextBox logBox)
    {
        if (!Directory.Exists(_siteDir) || !Directory.Exists(Path.Combine(_siteDir, ".git")))
        {
            Log(logBox, $"   ⚠ 站点工作区不可用：{_siteDir}", "#FFB24D");
            return;
        }

        var pattern = new Regex(@"releases/download/v[\d.]+/classworkbench-setup-[\d.]+\.exe", RegexOptions.IgnoreCase);
        var replacement = $"releases/download/v{newVer}/classworkbench-setup-{newVer}.exe";
        var changed = false;

        foreach (var name in new[] { "index.html", "manual.html" })
        {
            var file = Path.Combine(_siteDir, name);
            if (!File.Exists(file))
            {
                Log(logBox, $"   ⚠ 站点缺少 {name}，跳过", "#FFB24D");
                continue;
            }
            var content = File.ReadAllText(file, Encoding.UTF8);
            var updated = pattern.Replace(content, replacement);
            if (updated == content)
            {
                Log(logBox, $"   · {name} 无旧版下载链接，跳过", "#B7BED9");
                continue;
            }
            File.WriteAllText(file, updated, new UTF8Encoding(false));
            changed = true;
            Log(logBox, $"   ✓ {name} → v{newVer}", "#9FE8B5");
        }

        if (!changed) return;

        await RunCmdAsync("git", "add index.html manual.html", _siteDir,
            s => Log(logBox, s), s => Log(logBox, s, "#FF8A8A"));
        var commit = await RunCmdAsync("git", $"commit -m \"chore: 更新下载链接 v{newVer}\"", _siteDir,
            s => Log(logBox, s), s => Log(logBox, s, "#FF8A8A"));
        if (commit != 0)
        {
            Log(logBox, "   ⚠ 站点提交未产生新提交（可能无改动）", "#FFB24D");
            return;
        }
        var push = await RunCmdAsync("git", "push", _siteDir,
            s => Log(logBox, s), s => Log(logBox, s, "#FF8A8A"));
        Log(logBox, push == 0
            ? "   ✓ 官网下载链接已推送（Pages 约 1~几分钟后生效）"
            : "   ⚠ 站点推送失败，请手动 git push",
            push == 0 ? "#9FE8B5" : "#FFB24D");
    }

    private void PickFolder(ref string target, TextBlock display)
    {
        var dlg = new Microsoft.Win32.OpenFolderDialog { InitialDirectory = target };
        if (dlg.ShowDialog(this) == true)
        {
            target = dlg.FolderName;
            display.Text = target;
            Task.Run(CheckEnvironment);
        }
    }

    private async void PushDocs_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;

        var picked = _docChecks.Where(kv => kv.Value.IsChecked == true).Select(kv => kv.Key).ToList();
        if (picked.Count == 0)
        {
            MessageBox.Show(this, "请至少勾选一份要推送的文档。", "没有选择", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (!Directory.Exists(_srcDir))
        {
            MessageBox.Show(this, $"找不到协议文件目录：\n{_srcDir}", "路径不对", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        if (!Directory.Exists(_siteDir))
        {
            MessageBox.Show(this, $"找不到网站仓库目录：\n{_siteDir}", "路径不对", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        SetBusy(true, PushDocsButton, PushDocsButtonText, "推送中…");
        Log(DocsLog, "────────── 开始同步协议文档 ──────────", "#6EA8FE");
        try
        {
            // ① 复制到网站仓库 docs/
            var outDir = Path.Combine(_siteDir, "docs");
            Directory.CreateDirectory(outDir);
            Log(DocsLog, $"① 复制 {picked.Count} 份文档 → docs/", "#9FE8B5");
            foreach (var f in picked)
            {
                var s = Path.Combine(_srcDir, f);
                if (!File.Exists(s)) { Log(DocsLog, $"   ✗ 缺失：{f}", "#FF8A8A"); continue; }
                File.Copy(s, Path.Combine(outDir, f), true);
                Log(DocsLog, $"   ✓ {f}", "#9FE8B5");
            }

            // ② 提交并推送
            Log(DocsLog, "② 提交并推送到 GitHub …", "#9FE8B5");
            await RunCmdAsync("git", "add docs", _siteDir, s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            await RunCmdAsync("git", "commit -m \"docs: sync agreements from main repo\"", _siteDir,
                s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            var push = await RunCmdAsync("git", "push", _siteDir, s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            if (push != 0)
            {
                Log(DocsLog, "✗ 推送失败：若提示无跟踪分支，请先执行 git push -u origin main", "#FF8A8A");
                MessageBox.Show(this, "推送失败，请查看上方红色日志。", "推送失败", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            Log(DocsLog, "③ 完成！约 1~几分钟后 GitHub Pages 生效", "#9FE8B5");
            Log(DocsLog, "   https://windows-11-pro.github.io/classworkbench-site/", "#9FE8B5");
            MessageBox.Show(this, "协议文档已推送到 GitHub，\n约 1~几分钟后应用即可拉到最新文档。", "推送成功",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            Log(DocsLog, "异常：" + ex.Message, "#FF8A8A");
            MessageBox.Show(this, "推送过程出错：" + ex.Message, "推送出错", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            SetBusy(false, PushDocsButton, PushDocsButtonText, "一 键 推 送");
        }
    }

    // ---------- 通用工具 ----------
    private void SetBusy(bool busy, Button btn, TextBlock text, string label)
    {
        _busy = busy;
        btn.IsEnabled = !busy;
        text.Text = label;
        NavRelease.IsEnabled = !busy;
        NavDocs.IsEnabled = !busy;
    }

    private void Log(RichTextBox box, string text, string color = "#B7BED9")
    {
        Dispatcher.BeginInvoke(() =>
        {
            var run = new Run($"[{DateTime.Now:HH:mm:ss}] {text}\n")
            {
                Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString(color))
            };
            box.Document.Blocks.Add(new Paragraph(run) { Margin = new Thickness(0), Padding = new Thickness(0) });
            box.ScrollToEnd();
        });
    }

    private Task<int> RunCmdAsync(string fileName, string args, string cwd,
        Action<string>? onOut = null, Action<string>? onErr = null,
        IDictionary<string, string>? extraEnv = null, Encoding? encoding = null)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = args,
            WorkingDirectory = cwd,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        if (encoding != null)
        {
            psi.StandardOutputEncoding = encoding;
            psi.StandardErrorEncoding = encoding;
        }
        if (extraEnv != null)
            foreach (var kv in extraEnv) psi.Environment[kv.Key] = kv.Value;

        var tcs = new TaskCompletionSource<int>();
        var p = new Process { StartInfo = psi, EnableRaisingEvents = true };
        p.OutputDataReceived += (_, ev) => { if (ev.Data != null) onOut?.Invoke(ev.Data); };
        p.ErrorDataReceived += (_, ev) => { if (ev.Data != null) onErr?.Invoke(ev.Data); };
        p.Exited += (_, _) =>
        {
            try { p.WaitForExit(); tcs.TrySetResult(p.ExitCode); }
            catch (Exception ex) { tcs.TrySetException(ex); }
        };
        p.Start();
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();
        return tcs.Task;
    }

    private static string RunQuick(string exe, string args, string? cwd = null)
    {
        try
        {
            var psi = new ProcessStartInfo(exe, args)
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            if (cwd != null) psi.WorkingDirectory = cwd;
            using var p = Process.Start(psi)!;
            var output = p.StandardOutput.ReadToEnd() + p.StandardError.ReadToEnd();
            p.WaitForExit(5000);
            return output.Trim();
        }
        catch { return ""; }
    }
}
