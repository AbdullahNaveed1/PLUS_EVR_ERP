using System.ComponentModel.DataAnnotations.Schema;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// Where a bill line's goods are sent from. Saggian is the factory, and its stock is the only stock the app
    /// keeps; Farkhabad is a storage facility, so its lines are billed but never taken out of stock.
    /// </summary>
    public static class Facilities
    {
        public const string Saggian = "Saggian";
        public const string Farkhabad = "Farkhabad";

        public static bool IsFarkhabad(string? facility) => string.Equals(facility?.Trim(), Farkhabad, StringComparison.OrdinalIgnoreCase);
    }

    public class Sale : ICancellable
    {
        public int Id { get; set; }
        public string CustomerId { get; set; } = string.Empty;
        public string Customer { get; set; } = string.Empty;
        public string Region { get; set; } = "Punjab";
        public decimal Total { get; set; }
        public decimal RawTotal { get; set; }
        public decimal Discount { get; set; }
        public string TransportCompany { get; set; } = "N/A";
        public string BuiltyNo { get; set; } = "N/A";
        // Manual bill number from the physical bill book; repeats allowed
        public string BillNo { get; set; } = string.Empty;
        public DateTime Date { get; set; } = DateTime.UtcNow;

        [Column(TypeName = "jsonb")]
        public string LineItemsJson { get; set; } = "[]";

        // Set when cancelled instead of deleted (see ICancellable)
        public DateTime? CancelledAt { get; set; }
        public string? CancelledBy { get; set; }
        public string? CancelReason { get; set; }
    }
}