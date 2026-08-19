using System.Security.Cryptography;
using System.Text;

namespace QQListener;

internal sealed class MessageProcessor
{
    private readonly SidecarConfig _config;
    private readonly Dictionary<string, long> _seen = new();   // md5 -> unix ms
    private readonly object _lock = new();

    public MessageProcessor(SidecarConfig config)
    {
        _config = config;
    }

    public NotificationData? Process(IList<string> texts, string appName)
    {
        if (texts == null || texts.Count == 0) return null;

        // 规范化文本
        var norm = texts
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => string.Join(" ", t.Split((string[]?)null, StringSplitOptions.RemoveEmptyEntries)))
            .ToList();
        if (norm.Count == 0) return null;

        // ---- 去重（MD5 + 冷却）----
        var key = Md5Hex(string.Join("|", norm));
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        lock (_lock)
        {
            if (_seen.TryGetValue(key, out var last))
            {
                var cooldownMs = _config.CooldownSeconds * 1000L;
                if (now - last < cooldownMs)
                {
                    return null;
                }
            }
            _seen[key] = now;

            // 定期清理过期条目，避免字典无限增长（修复 QQListener Python 版的内存泄漏）
            if (_seen.Count > 1000)
            {
                var cutoff = now - _config.CooldownSeconds * 1000L * 10;
                var stale = _seen.Where(kv => kv.Value < cutoff).Select(kv => kv.Key).ToList();
                foreach (var k in stale) _seen.Remove(k);
            }
        }

        // ---- 文本拼装 ----
        //   norm.Count == 1 时：唯一一行同时充当 sender 和 message
        //   （某些 QQ 通知格式下整条正文塞在第一行，避免被 message=="" 直接丢弃）
        //   norm.Count >= 2 时：第一行 sender，其余拼接成 message
        var sender = norm[0];
        var message = norm.Count > 1
            ? string.Join("\n", norm.Skip(1))
            : norm[0];

        return new NotificationData
        {
            Sender = sender,
            Message = message,
            AppName = appName,
            RawTexts = norm
        };
    }

    private static string Md5Hex(string s)
    {
        var bytes = Encoding.UTF8.GetBytes(s);
        var hash = MD5.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
