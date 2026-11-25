namespace ShoeFactoryApi.Models
{
    public class Payment : ICancellable
    {
        public int Id { get; set; }
        public string CustomerId { get; set; } = string.Empty;
        public string Customer { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        // The day the cash was received (picked from the paper), not the day it was typed in
        public DateTime Date { get; set; }

        // When it was typed in; used to catch the same payment saved twice
        public DateTime? CreatedAt { get; set; }

        // Set when cancelled instead of deleted (see ICancellable)
        public DateTime? CancelledAt { get; set; }
        public string? CancelledBy { get; set; }
        public string? CancelReason { get; set; }
    }
}