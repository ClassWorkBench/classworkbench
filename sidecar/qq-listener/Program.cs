using System.Text;
using System.Text.Json;
using System.Runtime.InteropServices;

namespace QQListener;



internal static class Program
{
    // stdout 用 UTF-8 无 BOM 输出，避免中文乱码
    static Program()
    {
        Console.OutputEncoding = new System.Text.UTF8Encoding(false);
    }

    private static async Task<int> Main(string[] args)
    {
        // ---- 解析配置 ----
        SidecarConfig config;
        try
        {
            config = await LoadConfigAsync(args);
        }
        catch (Exception ex)
        {
            Emit(EventType.Error, new ErrorData { Message = "配置加载失败", Context = ex.Message });
            return 1;
        }

        Emit(EventType.Log, new LogData { Level = "info", Message = "qq-listener 启动" });

        // ---- Windows 版本检查 ----
        if (!RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            Emit(EventType.Error, new ErrorData { Message = "仅支持 Windows" });
            return 2;
        }
        if (Environment.OSVersion.Version.Build < 19041)
        {
            Emit(EventType.Error, new ErrorData { Message = "需要 Windows 10 1903+ (build 19041+)" });
            return 3;
        }

        // ---- 启动监听 ----
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            Emit(EventType.Log, new LogData { Level = "info", Message = "收到 Ctrl+C，停止中" });
            cts.Cancel();
        };

        var monitor = new NotificationMonitor(config);
        try
        {
            await monitor.RunAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            // 正常停止
        }
        catch (Exception ex)
        {
            Emit(EventType.Error, new ErrorData { Message = "监听异常", Context = ex.Message });
            return 4;
        }

        Emit(EventType.Stopped);
        return 0;
    }

    // ---- 配置加载：优先 stdin，其次 --config 路径，最后默认 ----
    private static async Task<SidecarConfig> LoadConfigAsync(string[] args)
    {
        // 1) 命令行 --config <path>
        string? configPath = null;
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == "--config" || args[i] == "-c")
            {
                configPath = args[i + 1];
                break;
            }
        }

        if (configPath != null && File.Exists(configPath))
        {
            var json = await File.ReadAllTextAsync(configPath);
            return JsonSerializer.Deserialize(json, SidecarJsonContext.WithChineseEncoder.SidecarConfig) ?? new SidecarConfig();
        }

        // 2) stdin（如果有 piped 输入）
        if (Console.IsInputRedirected)
        {
            using var reader = Console.OpenStandardInput();
            using var sr = new StreamReader(reader);
            var line = await sr.ReadToEndAsync();
            if (!string.IsNullOrWhiteSpace(line))
            {
                return JsonSerializer.Deserialize(line, SidecarJsonContext.WithChineseEncoder.SidecarConfig) ?? new SidecarConfig();
            }
        }

        // 3) 默认配置
        return new SidecarConfig();
    }

    // ---- 统一 stdout 输出（NDJSON） ----
    // AOT 下不能序列化 object? 字段（反射被禁），改成字符串拼接 + 强类型 TypeInfo 分发
    public static void Emit(EventType type, object? data = null)
    {
        var sb = new StringBuilder();
        sb.Append("{\"type\":\"").Append(type.ToString()).Append("\"");
        sb.Append(",\"ts\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        sb.Append(",\"data\":");
        sb.Append(data switch
        {
            null => "null",
            NotificationData n => JsonSerializer.Serialize(n, SidecarJsonContext.WithChineseEncoder.NotificationData),
            LogData l => JsonSerializer.Serialize(l, SidecarJsonContext.WithChineseEncoder.LogData),
            ErrorData e => JsonSerializer.Serialize(e, SidecarJsonContext.WithChineseEncoder.ErrorData),
            _ => "null"
        });
        sb.Append('}');
        Console.WriteLine(sb.ToString());
        Console.Out.Flush();
    }
}
