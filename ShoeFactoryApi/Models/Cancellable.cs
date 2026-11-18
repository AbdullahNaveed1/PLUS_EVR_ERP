using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// A posted record that Staff cancel (kept, with who and why) instead of deleting. Cancelled rows
    /// are left out of every list and total by a query filter; only Admins can still delete for real.
    /// </summary>
    public interface ICancellable
    {
        DateTime? CancelledAt { get; set; }
        string? CancelledBy { get; set; }
        string? CancelReason { get; set; }
    }

    /// <summary>A month an Admin has closed: nothing dated in it can be added, changed or removed until it is reopened.</summary>
    public class ClosedPeriod
    {
        // First day of the month
        [Key]
        public DateOnly Month { get; set; }

        public DateTime ClosedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(100)]
        public string ClosedBy { get; set; } = string.Empty;
    }
}
