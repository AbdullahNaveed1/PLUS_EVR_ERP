using System.Text.Json.Serialization;
 
namespace ShoeFactoryApi.Models
{
    public class Worker
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Phone { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
 
        [JsonIgnore]
        public ICollection<WagePayment> WagePayments { get; set; } = new List<WagePayment>();
    }
}