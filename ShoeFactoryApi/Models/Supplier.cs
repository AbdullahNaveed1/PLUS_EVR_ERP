using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>A party the factory buys material from. Balance = opening + purchases − payments.</summary>
    public class Supplier
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? Phone { get; set; }

        [MaxLength(500)]
        public string? Address { get; set; }

        // What was owed to this supplier before the app was used (negative = advance paid)
        public decimal OpeningBalance { get; set; }

        [MaxLength(1000)]
        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>Money paid to a supplier; lowers what the factory owes them.</summary>
    public class SupplierPayment
    {
        [Key]
        public int Id { get; set; }

        public int SupplierId { get; set; }

        public DateOnly Date { get; set; }

        public decimal Amount { get; set; }

        // Cash, bank transfer, cheque no, etc.
        [MaxLength(500)]
        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
