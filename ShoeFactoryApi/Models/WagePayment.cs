namespace ShoeFactoryApi.Models
{
    public class WagePayment
    {
        public int Id { get; set; }
        public int WorkerId { get; set; }
        public decimal Amount { get; set; }
        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
        public string Notes { get; set; } = string.Empty;

        // "advance" (daily wage taken during the week, deducted on payday) or "settlement" (the payday payment)
        public string Kind { get; set; } = WagePaymentKinds.Advance;

        // Advance dated before the wages start date that still comes off its week's hisab
        public bool CountInHisab { get; set; }

        public Worker? Worker { get; set; }
    }
}