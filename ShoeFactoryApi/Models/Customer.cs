namespace ShoeFactoryApi.Models
{
    public class Customer
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string? Description { get; set; }
        public string Region { get; set; } = "Punjab"; // Add this line
        public decimal Balance { get; set; }
    }
}