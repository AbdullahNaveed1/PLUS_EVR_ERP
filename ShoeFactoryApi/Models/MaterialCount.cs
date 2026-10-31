using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    /// <summary>
    /// End-of-day count of how much of a material is left in the factory.
    /// Usage between two counts = previous count + material received (MaterialEntries) - this count.
    /// One row per material per date.
    /// </summary>
    public class MaterialCount
    {
        [Key]
        public Guid Id { get; set; }

        public DateOnly Date { get; set; }

        [Required]
        [MaxLength(100)]
        public string Material { get; set; } = string.Empty;

        public decimal RemainingQty { get; set; }

        [Required]
        [MaxLength(30)]
        public string Unit { get; set; } = string.Empty;

        [MaxLength(100)]
        public string? CountedBy { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
