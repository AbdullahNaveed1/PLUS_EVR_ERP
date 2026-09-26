using System;
using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    public class ProductionRecord
    {
        [Key]
        public int Id { get; set; }

        public DateTime Date { get; set; } = DateTime.UtcNow.Date;

        [Required]
        [MaxLength(100)]
        public string ArticleNumber { get; set; } = string.Empty;

        public decimal Dozens { get; set; }

        public decimal Pairs { get; set; }

        [MaxLength(500)]
        public string? Notes { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
