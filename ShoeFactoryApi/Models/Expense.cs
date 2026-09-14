namespace ShoeFactoryApi.Models
{
    public class Expense
    {
        public int Id { get; set; }
        public string Category { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string Notes { get; set; } = string.Empty;
        public DateTime Date { get; set; } = DateTime.UtcNow;
    }
}
