using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ShoeFactoryApi.DTOs;
using ShoeFactoryApi.Services;

namespace ShoeFactoryApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize] // Requires a valid JWT token for all endpoints
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
        [Authorize(Roles = "Admin,Manager")] // Enterprise security: Only Admins or Managers can deduct stock
        public async Task<IActionResult> DeductStock([FromBody] StockDeductDto request)
        {
            if (request.Quantity <= 0)
            {
                return BadRequest(new { message = "Quantity must be greater than zero." });
            }

            await _inventoryService.DeductStockAndLogTransactionAsync(
                request.ProductId,
                request.Quantity,
                request.ReferenceNumber
            );

            _logger.LogInformation("Stock successfully deducted for Product ID {ProductId}, Quantity: {Quantity}",
                request.ProductId, request.Quantity);

            return Ok(new { message = "Stock successfully updated and transaction logged atomically." });
        }
    }
}