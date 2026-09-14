namespace ShoeFactoryApi.Models
{
    public class ProductPriceHistory
    {
        public int Id { get; set; }
        public int ProductId { get; set; }
        public decimal PricePunjab { get; set; }
        public decimal PriceSindh { get; set; }
        public DateTime EffectiveFrom { get; set; } = DateTime.UtcNow;
        public string Reason { get; set; } = string.Empty;

        public Product? Product { get; set; }
    }
}