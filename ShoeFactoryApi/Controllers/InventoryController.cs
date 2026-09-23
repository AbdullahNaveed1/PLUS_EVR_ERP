using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShoeFactoryApi.DTOs;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class InventoryController : ControllerBase
    {
        private readonly IInventoryService _inventoryService;
        private readonly ILogger<InventoryController> _logger;

        public InventoryController(IInventoryService inventoryService, ILogger<InventoryController> logger)
        {
            _inventoryService = inventoryService;
            _logger = logger;
        }

        [HttpPost("deduct")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeductStock([FromBody] StockDeductDto request)
        {
            if (request.Quantity <= 0)
                return BadRequest(new { message = "Quantity must be greater than zero." });

            await _inventoryService.DeductStockAndLogTransactionAsync(
                request.ProductId, request.Quantity, request.ReferenceNumber);

            return Ok(new { message = "Stock updated atomically." });
        }

        // NEW — bulk endpoint for invoice deductions
        [HttpPost("deduct-bulk")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> DeductBulk([FromBody] List<StockDeductDto> items)
        {
            if (items == null || items.Count == 0)
                return BadRequest(new { message = "No items to deduct." });

            foreach (var item in items)
            {
                if (item.Quantity <= 0) continue;
                await _inventoryService.DeductStockAndLogTransactionAsync(
                    item.ProductId, item.Quantity, item.ReferenceNumber);
            }
            return Ok(new { message = $"{items.Count} item(s) deducted." });
        }
    }
}