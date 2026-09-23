using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class CustomersController : ControllerBase
    {
        private readonly FactoryDbContext _context;
        public CustomersController(FactoryDbContext context) => _context = context;

        [HttpGet]
        public async Task<ActionResult<IEnumerable<Customer>>> GetCustomers()
            => await _context.Customers.ToListAsync();

        [HttpGet("{id}")]
        public async Task<ActionResult<Customer>> GetCustomer(int id)
        {
            var customer = await _context.Customers.FindAsync(id);
            return customer == null ? NotFound() : customer;
        }

        [HttpGet("by-phone/{phone}")]
        public async Task<ActionResult<Customer>> GetCustomerByPhone(string phone)
        {
            var customer = await _context.Customers.FirstOrDefaultAsync(c => c.Phone == phone);
            return customer == null ? NotFound(new { message = "Customer not found" }) : customer;
        }

        [HttpPost]
        public async Task<ActionResult<Customer>> PostCustomer(Customer customer)
        {
            _context.Customers.Add(customer);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetCustomer), new { id = customer.Id }, customer);
        }

        // FIX #23 — targeted update; prevents balance/phone/name clobbering on description-only edits
        [HttpPut("{id}")]
        public async Task<IActionResult> PutCustomer(int id, Customer customer)
        {
            if (id != customer.Id) return BadRequest();

            var existing = await _context.Customers.FirstOrDefaultAsync(c => c.Id == id);
            if (existing == null) return NotFound();

            if (!string.IsNullOrWhiteSpace(customer.Name)) existing.Name = customer.Name;
            if (!string.IsNullOrWhiteSpace(customer.Phone)) existing.Phone = customer.Phone;
            if (!string.IsNullOrWhiteSpace(customer.Region)) existing.Region = customer.Region;
            existing.Description = customer.Description;
            existing.Balance = customer.Balance;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCustomer(int id)
        {
            var customer = await _context.Customers.FindAsync(id);
            if (customer == null) return NotFound();
            _context.Customers.Remove(customer);
            await _context.SaveChangesAsync();
            return NoContent();
        }
    }
}