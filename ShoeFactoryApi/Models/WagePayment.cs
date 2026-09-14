namespace ShoeFactoryApi.Models
{
    public class WagePayment
    {
        public int Id { get; set; }
        public int WorkerId { get; set; }
        public decimal Amount { get; set; }
        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
        public string Notes { get; set; } = string.Empty;

        public Worker? Worker { get; set; }
    }
}