using System.Text.Json.Serialization;

namespace ShoeFactoryApi.Models
{
    public class Article
    {
        public int Id { get; set; }
        public string ArticleNumber { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public ICollection<Product> Variants { get; set; } = new List<Product>();
    }
}