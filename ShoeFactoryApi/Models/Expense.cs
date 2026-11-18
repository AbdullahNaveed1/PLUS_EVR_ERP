namespace ShoeFactoryApi.Models
{
    public class Expense : ICancellable
    {
        public int Id { get; set; }
        public string Category { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Notes { get; set; } = string.Empty;
        public DateTime Date { get; set; } = DateTime.UtcNow;

        // Set when cancelled instead of deleted (see ICancellable)
        public DateTime? CancelledAt { get; set; }
        public string? CancelledBy { get; set; }
        public string? CancelReason { get; set; }
    }
}
