using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ShoeFactoryApi.Models
{
    public class BomEntry
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string ArticleNumber { get; set; } = string.Empty;

        [Required]
        public int RawMaterialId { get; set; }

        [ForeignKey(nameof(RawMaterialId))]
        public RawMaterial? RawMaterial { get; set; }

        public decimal QtyPerDozen { get; set; }
    }
}
