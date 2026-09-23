using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    public class InventoryService : IInventoryService
    {
        private readonly FactoryDbContext _context;
        private readonly ILogger<InventoryService> _logger;

        public InventoryService(FactoryDbContext context, ILogger<InventoryService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task DeductStockAndLogTransactionAsync(int productId, int quantity, string referenceNumber)
        {
            if (quantity <= 0) throw new ArgumentException("Quantity must be positive.");

            using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                var product = await _context.Products.FirstOrDefaultAsync(p => p.Id == productId)
                    ?? throw new InvalidOperationException($"Product {productId} not found.");

                // Live stock only — no sold-qty column exists
                product.Qty -= quantity;

                await _context.SaveChangesAsync();
                await tx.CommitAsync();

                _logger.LogInformation("Stock deducted: Product={ProductId} Qty={Qty} Ref={Ref}",
                    productId, quantity, referenceNumber);
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }
    }
}