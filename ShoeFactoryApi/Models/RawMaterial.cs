using System;
using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    public class RawMaterial
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Name { get; set; } = string.Empty;

        [MaxLength(50)]
        public string Unit { get; set; } = "unit";

        public decimal UnitCost { get; set; }

        public decimal StockQty { get; set; }

        [MaxLength(500)]
        public string? Notes { get; set; }

        public DateTime DateAdded { get; set; } = DateTime.UtcNow;
    }
}
