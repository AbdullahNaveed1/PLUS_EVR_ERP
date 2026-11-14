using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// Piece rate (thekka): what a worker earns per dozen made. Blank article = every article,
    /// blank size = every size. The most specific matching rate wins (article + size, then article,
    /// then size, then the worker's general rate).
    /// </summary>
    public class WageRate
    {
        [Key]
        public int Id { get; set; }

        public int WorkerId { get; set; }

        [MaxLength(100)]
        public string? ArticleNumber { get; set; }

        [MaxLength(30)]
        public string? Size { get; set; }

        public decimal RatePerDozen { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// A worker's week (Saturday to Friday) closed on payday: what was earned, advances taken,
    /// what carried in, what was paid, and what carries to the next week.
    /// </summary>
    public class WeeklySettlement
    {
        [Key]
        public int Id { get; set; }

        public int WorkerId { get; set; }

        // The Saturday the week starts on
        public DateOnly WeekStart { get; set; }

        public decimal Earned { get; set; }
        public decimal Advances { get; set; }
        public decimal CarryIn { get; set; }
        public decimal Final { get; set; }
        public decimal Paid { get; set; }

        // Final − Paid: positive = still owed to the worker, negative = advance to recover next week
        public decimal CarryOut { get; set; }

        // The payment made on settling (none when nothing was paid)
        public int? WagePaymentId { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public static class WagePaymentKinds
    {
        public const string Advance = "advance";
        public const string Settlement = "settlement";
    }
}
