using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

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

        // Size breakdown stored as JSON; each size's pairs are added to that product's stock
        [JsonIgnore]
        public string SizesJson { get; set; } = "[]";

        // Filled from SizesJson by the controller; null on input means "keep the saved sizes"
        [NotMapped]
        public List<ProductionSize>? Sizes { get; set; }
    }

    public class ProductionSize
    {
        public int? ProductId { get; set; }
        public string Size { get; set; } = string.Empty;
        public string? Color { get; set; }
        public decimal Dozens { get; set; }
        public decimal Pairs { get; set; }

        public decimal TotalPairs => Dozens * 12m + Pairs;
    }
}
