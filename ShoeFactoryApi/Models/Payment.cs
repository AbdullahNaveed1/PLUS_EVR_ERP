namespace ShoeFactoryApi.Models
{
    public class Payment
    {
        public int Id { get; set; }
        public string CustomerId { get; set; } = string.Empty;
        public string Customer { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public DateTime Date { get; set; }
    }
}