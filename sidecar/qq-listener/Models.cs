using System.Text.Json.Serialization;

namespace QQListener;

// ============================================
// 配置（Electron 通过 stdin 注入或命令行参数传 JSON 路径）
// ============================================
public sealed class SidecarConfig
{
    /// <summary>轮询间隔（秒），默认 0.5s</summary>
    public double ScanIntervalSeconds { get; set; } = 0.5;

    /// <summary>同条消息冷却（秒），默认 3s</summary>
    public int CooldownSeconds { get; set; } = 3;

    /// <summary>只处理 QQ 通知</summary>
    public bool QqOnly { get; set; } = true;

    /// <summary>老师名单（按 QQ 昵称匹配）</summary>
    public List<string> Teachers { get; set; } = new();
}

// ============================================
// stdout 输出事件（NDJSON 协议）
// ============================================
public enum EventType
{
    Ready,            // sidecar 启动完成
    Notification,     // 原始通知
    Log,              // 日志
    Error,            // 错误
    AccessDenied,     // 通知访问被拒绝
    Stopped           // 主动停止
}

public sealed class OutputEvent
{
    [JsonPropertyName("type")]
    public EventType Type { get; set; }

    [JsonPropertyName("ts")]
    public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    [JsonPropertyName("data")]
    public object? Data { get; set; }
}

public sealed class NotificationData
{
    [JsonPropertyName("sender")] public string Sender { get; set; } = "";
    [JsonPropertyName("message")] public string Message { get; set; } = "";
    [JsonPropertyName("appName")] public string AppName { get; set; } = "";
    [JsonPropertyName("rawTexts")] public List<string> RawTexts { get; set; } = new();
}

public sealed class LogData
{
    [JsonPropertyName("level")] public string Level { get; set; } = "info";
    [JsonPropertyName("message")] public string Message { get; set; } = "";
}

public sealed class ErrorData
{
    [JsonPropertyName("message")] public string Message { get; set; } = "";
    [JsonPropertyName("context")] public string? Context { get; set; }
}
