using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;

namespace ShoeFactoryApi.Services
{
    public interface IInventoryService
    {
        Task DeductStockAndLogTransactionAsync(int productId, int quantity, string referenceNumber);
    }

    public class InventoryService : IInventoryService
    {
        private readonly FactoryDbContext _context;

        public InventoryService(FactoryDbContext context)
        {
            _context = context;
        }

        public async Task DeductStockAndLogTransactionAsync(int productId, int quantity, string referenceNumber)
        {
            var strategy = _context.Database.CreateExecutionStrategy();

            await strategy.ExecuteAsync(async () =>
            {
                using var transaction = await _context.Database.BeginTransactionAsync();
                try
                {
                    var product = await _context.Products.FindAsync(productId);
                    if (product == null)
                        throw new KeyNotFoundException($"Product with ID {productId} was not found.");

                    if (product.Qty < quantity)
                        throw new InvalidOperationException($"Insufficient stock for product model: {product.Model}");

                    product.Qty -= quantity;

                    await _context.SaveChangesAsync();
                    await transaction.CommitAsync();
                }
                catch
                {
                    await transaction.RollbackAsync();
                    throw;
                }
            });
        }
    }
}