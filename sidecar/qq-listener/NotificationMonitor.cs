using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace QQListener;

internal sealed class NotificationMonitor
{
    private readonly SidecarConfig _config;
    private readonly MessageProcessor _processor;
    private readonly HashSet<uint> _knownIds = new();

    public NotificationMonitor(SidecarConfig config)
    {
        _config = config;
        _processor = new MessageProcessor(config);
    }

    public async Task RunAsync(CancellationToken ct)
    {
        // ---- 申请访问权限 ----
        UserNotificationListener listener = UserNotificationListener.Current;
        if (listener is null)
        {
            Program.Emit(EventType.Error, new ErrorData { Message = "无法获取 UserNotificationListener" });
            return;
        }

        UserNotificationListenerAccessStatus access;
        try
        {
            access = await listener.RequestAccessAsync();
        }
        catch (Exception ex)
        {
            Program.Emit(EventType.Error, new ErrorData { Message = "请求通知访问权限失败", Context = ex.Message });
            return;
        }

        if (access != UserNotificationListenerAccessStatus.Allowed)
        {
            Program.Emit(EventType.AccessDenied, new ErrorData
            {
                Message = "通知访问权限未授予，请在 Windows 设置 → 通知 中允许"
            });
            return;
        }

        // ---- 初始化已知通知 ID（避免启动时回放历史通知）----
        try
        {
            var initial = await listener.GetNotificationsAsync(NotificationKinds.Toast);
            if (initial != null)
            {
                foreach (var n in initial)
                {
                    if (n != null) _knownIds.Add(n.Id);
                }
            }
        }
        catch (Exception ex)
        {
            Program.Emit(EventType.Log, new LogData { Level = "warn", Message = "获取初始通知失败：" + ex.Message });
        }

        Program.Emit(EventType.Ready);

        // ---- 主轮询循环 ----
        var interval = TimeSpan.FromSeconds(Math.Max(0.1, _config.ScanIntervalSeconds));
        while (!ct.IsCancellationRequested)
        {
            try
            {
                IReadOnlyList<UserNotification>? notifs = null;
                try
                {
                    notifs = await listener.GetNotificationsAsync(NotificationKinds.Toast);
                }
                catch (Exception ex)
                {
                    // 偶发 COM 异常，记录后继续
                    Program.Emit(EventType.Log, new LogData { Level = "warn", Message = "GetNotifications 失败：" + ex.Message });
                }

                if (notifs != null && notifs.Count > 0)
                {
                    var currentIds = new HashSet<uint>();
                    foreach (var n in notifs)
                    {
                        if (n is null) continue;
                        currentIds.Add(n.Id);
                        if (_knownIds.Contains(n.Id)) continue;

                        try
                        {
                            ProcessOne(n);
                        }
                        catch (Exception ex)
                        {
                            Program.Emit(EventType.Log, new LogData { Level = "warn", Message = "处理通知失败：" + ex.Message });
                        }
                        _knownIds.Add(n.Id);
                    }
                    // 清理已消失的通知 ID，避免 _knownIds 无限增长
                    _knownIds.IntersectWith(currentIds);
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                Program.Emit(EventType.Log, new LogData { Level = "error", Message = "轮询异常：" + ex.Message });
            }

            try
            {
                await Task.Delay(interval, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private void ProcessOne(UserNotification n)
    {
        // ---- 应用名过滤 ----
        string appName = "";
        try
        {
            if (n.AppInfo?.DisplayInfo?.DisplayName is { } dn) appName = dn;
        }
        catch { /* 忽略 */ }

        if (_config.QqOnly && !appName.Contains("QQ", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        // ---- 抽取文本元素 ----
        var texts = new List<string>();
        try
        {
            var visual = n.Notification?.Visual;
            if (visual != null)
            {
                var bindings = visual.Bindings;
                if (bindings != null)
                {
                    foreach (var b in bindings)
                    {
                        if (b is null) continue;
                        var elements = b.GetTextElements();
                        if (elements == null) continue;
                        foreach (var t in elements)
                        {
                            if (t != null && !string.IsNullOrWhiteSpace(t.Text))
                            {
                                texts.Add(t.Text.Trim());
                            }
                        }
                    }
                }
            }
        }
        catch
        {
            return;
        }

        if (texts.Count == 0) return;

        // ---- 调用消息处理器（去重/冷却/黑白名单/重要判定）----
        var result = _processor.Process(texts, appName);
        if (result == null) return;

        // ---- 输出原始通知事件 ----
        Program.Emit(EventType.Notification, result);
    }
}
