using System.Diagnostics;
using System.IO;
using System.Net.Http;
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

    // GitHub 仓库（与 main/updater.js、main/docs-sync.js 保持一致）
    private const string GITHUB_API = "https://api.github.com";
    private const string OWNER = "ClassWorkBench";
    private const string REPO = "classworkbench";

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

            var pagesOk = File.Exists(Path.Combine(_siteDir, "index.html"))
                && File.Exists(Path.Combine(_siteDir, "manual.html"));
            PagesDot.Fill = new SolidColorBrush(pagesOk
                ? (Color)ColorConverter.ConvertFromString("#3DDC84")
                : (Color)ColorConverter.ConvertFromString("#FF5A5A"));
            PagesStatusText.Text = pagesOk
                ? "待推送：index.html · manual.html · promo/"
                : "网站仓库缺少 index.html 或 manual.html";

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
        var effectiveToken = string.IsNullOrEmpty(token) ? envToken : token;

        // 发布前自检：分支 / 工作区 / 版本重复（仅在线发布）
        if (online && !await PreflightChecks(newVer, effectiveToken!)) return;

        SetBusy(true, ReleaseButton, ReleaseButtonText, "发布中…");
        Log(ReleaseLog, $"────────── 开始发布 v{newVer} ──────────", "#6EA8FE");
        try
        {
            var oldVer = ReadPackageVersion();
            // ① 更新 package.json 版本（构建失败会还原）
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
                UpdatePackageVersion(oldVer);
                Log(ReleaseLog, $"✗ 构建{(online ? "/发布" : "")}失败（退出码 {code}），已还原版本号为 {oldVer}", "#FF8A8A");
                MessageBox.Show(this, "构建失败，请查看上方红色日志。", "构建失败", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }
            Log(ReleaseLog, $"✓ 构建{(online ? "并发布到 GitHub" : "")}完成", "#9FE8B5");

            // ③ 转正 GitHub Release 并写入发布说明（GitHub REST API，不再依赖 gh CLI）
            if (online)
            {
                // electron-builder 上传完资产后偶尔会把 release 留在草稿态，
                // 草稿不算 latest，应用会查不到更新——这里统一转正并写入 body。
                Log(ReleaseLog, "③ 转正 GitHub Release 并写入发布说明", "#9FE8B5");
                var notes = ReleaseNotesBox.Text.Trim();
                var finalize = await FinalizeRelease(newVer, notes, effectiveToken!);
                if (finalize != 0) Log(ReleaseLog, "   ⚠ 转正/写说明失败，请按上方日志排查（Token 需有 repo 权限）", "#FFB24D");
                else Log(ReleaseLog, notes.Length > 0
                    ? "   ✓ Release 已转正，发布说明已写入（应用内即可看到）"
                    : "   ✓ Release 已发布为正式版本", "#9FE8B5");
            }

            // ④ 提交并推送版本号改动（仅在线发布时）
            if (online)
            {
                Log(ReleaseLog, "④ 提交并推送版本号改动到主仓库", "#9FE8B5");
                await RunCmdAsync("git", "add package.json", _rootDir, s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                var c = await RunCmdAsync("git", $"commit -m \"chore(release): v{newVer}\"", _rootDir,
                    s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                if (c != 0) Log(ReleaseLog, "⚠ 提交未产生新提交（可能无改动）", "#FFB24D");
                var p = await RunCmdAsync("git", "push", _rootDir, s => Log(ReleaseLog, s), s => Log(ReleaseLog, s, "#FF8A8A"));
                if (p != 0) Log(ReleaseLog, "⚠ 代码推送失败，请稍后手动 git push", "#FFB24D");
                else Log(ReleaseLog, "✓ 版本号已提交并推送", "#9FE8B5");

                // ⑤ 同步官网下载链接（index.html / manual.html → 最新版本）
                Log(ReleaseLog, "⑤ 更新官网下载链接 → v" + newVer, "#9FE8B5");
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

    /// <summary>
    /// 发布前自检：分支 / 工作区干净 / 版本是否已发布。
    /// 任一项被用户取消则返回 false，中止发布。
    /// </summary>
    private async Task<bool> PreflightChecks(string newVer, string token)
    {
        // ① 分支
        var branch = RunQuick("git", "rev-parse --abbrev-ref HEAD", _rootDir);
        if (!string.IsNullOrEmpty(branch) && branch != "main" && branch != "master")
        {
            Log(ReleaseLog, $"⚠ 当前分支：{branch}（不是 main），建议切回 main 再发布", "#FFB24D");
            if (MessageBox.Show(this, $"当前分支：{branch}\n建议在 main 上发布。仍要继续吗？", "分支检查",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return false;
        }

        // ② 工作区干净
        var dirty = RunQuick("git", "status --porcelain", _rootDir);
        if (!string.IsNullOrEmpty(dirty))
        {
            var lines = dirty.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            var preview = string.Join('\n', lines.Take(5));
            if (lines.Length > 5) preview += "\n…";
            Log(ReleaseLog, "⚠ 工作区有未提交改动，仍继续发布", "#FFB24D");
            if (MessageBox.Show(this, $"工作区有未提交改动：\n{preview}\n\n版本号改动会一并提交。仍要发布吗？", "工作区检查",
                MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return false;
        }

        // ③ 版本是否已发布（v{newVer} 的 Release 是否已存在）
        try
        {
            using var client = CreateGitHubClient(token);
            var resp = await client.GetAsync($"{GITHUB_API}/repos/{OWNER}/{REPO}/releases/tags/v{newVer}");
            if (resp.IsSuccessStatusCode)
            {
                Log(ReleaseLog, $"⚠ v{newVer} 已存在 Release，重复发布可能失败", "#FFB24D");
                if (MessageBox.Show(this, $"GitHub 上已存在 v{newVer} 的 Release。\n重复发布可能报错。仍要继续吗？", "版本已存在",
                    MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return false;
            }
        }
        catch (Exception ex)
        {
            Log(ReleaseLog, "⚠ 版本重复检查失败（网络/Token），已跳过：" + ex.Message, "#FFB24D");
        }
        return true;
    }

    /// <summary>
    /// 转正 GitHub Release 并可选写入发布说明（GitHub REST API，不依赖 gh CLI）。
    /// 返回 0 表示成功；非 0 表示失败。
    /// </summary>
    private async Task<int> FinalizeRelease(string newVer, string notes, string token)
    {
        using var client = CreateGitHubClient(token);
        var tag = $"v{newVer}";
        HttpResponseMessage get;
        try
        {
            get = await client.GetAsync($"{GITHUB_API}/repos/{OWNER}/{REPO}/releases/tags/{tag}");
        }
        catch (Exception ex)
        {
            Log(ReleaseLog, "   ⚠ 查询 Release 失败：" + ex.Message, "#FFB24D");
            return 1;
        }
        if (!get.IsSuccessStatusCode)
        {
            Log(ReleaseLog, $"   ⚠ 找不到 Release {tag}（HTTP {(int)get.StatusCode}），可能未上传或 tag 名不一致", "#FFB24D");
            return 1;
        }
        var rel = JsonNode.Parse(await get.Content.ReadAsStringAsync());
        var id = rel?["id"]?.GetValue<long>();
        if (id is null)
        {
            Log(ReleaseLog, "   ⚠ 无法解析 Release id", "#FFB24D");
            return 1;
        }

        // PATCH：转正 + 可选写入发布说明（一次请求，notes 为空时保留原 body）
        var patch = new JsonObject { ["draft"] = false };
        if (!string.IsNullOrWhiteSpace(notes)) patch["body"] = notes;
        using var req = new HttpRequestMessage(new HttpMethod("PATCH"),
            $"{GITHUB_API}/repos/{OWNER}/{REPO}/releases/{id}")
        {
            Content = new StringContent(patch.ToJsonString(), Encoding.UTF8, "application/json")
        };
        try
        {
            using var resp = await client.SendAsync(req);
            if (!resp.IsSuccessStatusCode)
            {
                Log(ReleaseLog, $"   ⚠ 转正/写说明失败（HTTP {(int)resp.StatusCode}），请确认 Token 有 repo 权限", "#FFB24D");
                return 1;
            }
        }
        catch (Exception ex)
        {
            Log(ReleaseLog, "   ⚠ 转正/写说明失败：" + ex.Message, "#FFB24D");
            return 1;
        }
        return 0;
    }

    private static HttpClient CreateGitHubClient(string token)
    {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("User-Agent", "ClassWorkBench-PublishHelper/1.0");
        client.DefaultRequestHeaders.Add("Accept", "application/vnd.github+json");
        client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        return client;
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
            Log(DocsLog, "   https://classworkbench.github.io/classworkbench-site/", "#9FE8B5");
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

    // =====================================================================
    //  推送说明书 / 宣传册（index.html + manual.html + promo/）
    // =====================================================================
    private async void PushPages_Click(object sender, RoutedEventArgs e)
    {
        if (_busy) return;

        if (!Directory.Exists(_siteDir) || !Directory.Exists(Path.Combine(_siteDir, ".git")))
        {
            MessageBox.Show(this, $"找不到网站仓库：\n{_siteDir}", "路径不对", MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }
        foreach (var f in new[] { "index.html", "manual.html" })
        {
            if (!File.Exists(Path.Combine(_siteDir, f)))
            {
                MessageBox.Show(this, $"网站仓库缺少 {f}：\n{Path.Combine(_siteDir, f)}", "文件缺失",
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
        }

        SetBusy(true, PushPagesButton, PushPagesButtonText, "推送中…");
        Log(DocsLog, "────────── 开始推送说明书/宣传册 ──────────", "#6EA8FE");
        try
        {
            // ① 提交并推送（promo 配图随页面一起更新）
            Log(DocsLog, "① 提交 index.html / manual.html / promo → 网站仓库", "#9FE8B5");
            await RunCmdAsync("git", "add index.html manual.html promo", _siteDir,
                s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            var c = await RunCmdAsync("git", "commit -m \"docs: 更新说明书与宣传页\"", _siteDir,
                s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            if (c != 0)
            {
                Log(DocsLog, "⚠ 没有可提交的改动（页面文件未变化）", "#FFB24D");
                MessageBox.Show(this, "页面文件没有变化，无需推送。", "无改动", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            var p = await RunCmdAsync("git", "push", _siteDir,
                s => Log(DocsLog, s), s => Log(DocsLog, s, "#FF8A8A"));
            if (p != 0)
            {
                Log(DocsLog, "✗ 推送失败，请查看上方红色日志。", "#FF8A8A");
                MessageBox.Show(this, "推送失败，请查看上方红色日志。", "推送失败", MessageBoxButton.OK, MessageBoxImage.Error);
                return;
            }

            Log(DocsLog, "② 完成！约 1~几分钟后 GitHub Pages 生效", "#9FE8B5");
            Log(DocsLog, "   https://classworkbench.github.io/classworkbench-site/", "#9FE8B5");
            MessageBox.Show(this, "说明书与宣传册已推送，\n约 1~几分钟后网站生效。", "推送成功",
                MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            Log(DocsLog, "异常：" + ex.Message, "#FF8A8A");
            MessageBox.Show(this, "推送过程出错：" + ex.Message, "推送出错", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            SetBusy(false, PushPagesButton, PushPagesButtonText, "推送说明书 / 宣传册");
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
        if (PushDocsButton != null) PushDocsButton.IsEnabled = !busy;
        if (PushPagesButton != null) PushPagesButton.IsEnabled = !busy;
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
