namespace ShoeFactoryApi.DTOs
{
    public class StockDeductDto
    {
        public int ProductId { get; set; }
        public int Quantity { get; set; }
        public string ReferenceNumber { get; set; } = string.Empty;
    }
}