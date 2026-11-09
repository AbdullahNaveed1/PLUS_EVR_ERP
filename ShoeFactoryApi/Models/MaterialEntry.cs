using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// One material movement: "received" (goods entered the factory) or "used" (deducted for production).
    /// Never hard-deleted — "delete" sets Voided so it can be undone.
    /// </summary>
    public class MaterialEntry
    {
        [Key]
        public Guid Id { get; set; }

        public DateOnly Date { get; set; }

        [Required]
        [MaxLength(100)]
        public string Material { get; set; } = string.Empty;

        public decimal Quantity { get; set; }

        // "received" or "used"; stock balance = received − used
        [Required]
        [MaxLength(20)]
        public string Kind { get; set; } = MaterialEntryKinds.Received;

        [Required]
        [MaxLength(30)]
        public string Unit { get; set; } = string.Empty;

        // ===== Optional fields =====
        [MaxLength(100)]
        public string? ArticleNo { get; set; }

        [MaxLength(30)]
        public string? Size { get; set; }

        [MaxLength(200)]
        public string? Supplier { get; set; }

        [MaxLength(100)]
        public string? BillNo { get; set; }

        public decimal? Rate { get; set; }

        public decimal? Amount { get; set; }

        [MaxLength(1000)]
        public string? Remarks { get; set; }

        [MaxLength(100)]
        public string? EnteredBy { get; set; }

        public bool Voided { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }

    public static class MaterialEntryKinds
    {
        public const string Received = "received";
        public const string Used = "used";
    }
}
