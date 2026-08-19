using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace QQListener;

// ============================================
// AOT 友好的 JSON 序列化上下文
// NativeAOT 禁用反射序列化，必须用 source generator 显式列出所有需要序列化/反序列化的类型
// Encoder 不能放进 JsonSourceGenerationOptions 特性，需通过构造函数注入
// ============================================
[JsonSourceGenerationOptions(
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(NotificationData))]
[JsonSerializable(typeof(LogData))]
[JsonSerializable(typeof(ErrorData))]
[JsonSerializable(typeof(SidecarConfig))]
public partial class SidecarJsonContext : JsonSerializerContext
{
    // 带中文不转义的 Options 的实例（供 Emit 使用）
    public static readonly SidecarJsonContext WithChineseEncoder = new(new JsonSerializerOptions
    {
        WriteIndented = false,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    });
}
