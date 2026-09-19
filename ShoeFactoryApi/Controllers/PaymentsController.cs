using System;
using System.ComponentModel.DataAnnotations;

namespace ShoeFactoryApi.Models
{
    public class Payment
    {
        public int Id { get; set; }

        [Required]
        public string CustomerId { get; set; } = string.Empty;

        [Required]
        public string Customer { get; set; } = string.Empty;

        [Range(0.01, double.MaxValue, ErrorMessage = "Amount must be greater than zero.")]
        public decimal Amount { get; set; }

        public DateTime Date { get; set; } = DateTime.UtcNow;
    }
}