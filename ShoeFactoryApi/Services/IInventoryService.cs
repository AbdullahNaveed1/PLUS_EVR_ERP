using System.Threading.Tasks;

namespace ShoeFactoryApi.Services
{
    public interface IInventoryService
    {
        Task DeductStockAndLogTransactionAsync(int productId, int quantity, string referenceNumber);
    }
}