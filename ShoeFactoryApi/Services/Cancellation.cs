using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>Marks a posted record cancelled (who, when, why); the query filter then hides it from every list and total.</summary>
    public static class Cancellation
    {
        public const int MaxReasonLength = 300;

        // Error message for a missing or too long reason, or null when it is fine
        public static string? Validate(CancelInput? input)
        {
            var reason = input?.Reason?.Trim();
            if (string.IsNullOrEmpty(reason)) return "Give a reason for cancelling.";
            if (reason.Length > MaxReasonLength) return $"Keep the reason under {MaxReasonLength} characters.";
            return null;
        }

        public static void Apply(ICancellable record, string? user, CancelInput input)
        {
            record.CancelledAt = DateTime.UtcNow;
            record.CancelledBy = user ?? "unknown";
            record.CancelReason = input.Reason!.Trim();
        }
    }

    public class CancelInput
    {
        public string? Reason { get; set; }
    }
}
