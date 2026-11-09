using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// Goods a customer sent back against one bill. The returned pairs go back into stock and
    /// the amount (bill rate after discount) comes off the customer's balance.
    /// </summary>
    public class SalesReturn
    {
        [Key]
        public int Id { get; set; }

        public int SaleId { get; set; }

        // Copied from the bill so the customer ledger can find it the same way it finds bills
        [MaxLength(100)]
        public string CustomerId { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Customer { get; set; } = string.Empty;

        public DateOnly Date { get; set; }

        // JSON list of returned lines: lineIndex, productId, model, size, pairs, price, discountPerPair, amount
        public string ItemsJson { get; set; } = "[]";

        public decimal Total { get; set; }

        [MaxLength(500)]
        public string? Reason { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
