using System.ComponentModel.DataAnnotations.Schema;

namespace ShoeFactoryApi.Models
{
    public class Sale
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
        public DateTime Date { get; set; } = DateTime.UtcNow;

        [Column(TypeName = "jsonb")]
        public string LineItemsJson { get; set; } = "[]";
    }
}