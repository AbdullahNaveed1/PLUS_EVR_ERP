using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace ShoeFactoryApi.Models
{
    public class Product
    {
        public int Id { get; set; }
        public int? ArticleId { get; set; }
        public string ArticleNumber { get; set; } = string.Empty;
        public string Model { get; set; } = string.Empty;
        public string Size { get; set; } = string.Empty;
        public string Color { get; set; } = string.Empty;
        public int Qty { get; set; }

        [Column("price_punjab")]
        public decimal PricePunjab { get; set; }

        [Column("price_sindh")]
        public decimal PriceSindh { get; set; }

        [JsonIgnore]
        public Article? Article { get; set; }
    }
}