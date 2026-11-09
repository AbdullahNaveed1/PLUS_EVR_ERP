using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Auth;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Controllers
{
    /// <summary>
    /// Admin-only management of logins. Users cannot change their own password; an Admin resets it.
    /// Every change here is recorded in the audit log by the database context.
    /// </summary>
    [ApiController]
    [Route("api/users")]
    [Authorize(Roles = "Admin")]
    public class UsersController : ControllerBase
    {
        private static readonly string[] Roles = { "Admin", "Staff" };
        private const int MinPasswordLength = 6;

        private readonly FactoryDbContext _db;
        public UsersController(FactoryDbContext db) { _db = db; }

        [HttpGet]
        public async Task<IEnumerable<object>> GetAll()
        {
            var users = await _db.Users.AsNoTracking().OrderBy(u => u.Username).ToListAsync();
            return users.Select(ToResponse);
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] UserInput input)
        {
            var username = input.Username?.Trim() ?? string.Empty;
            if (username.Length == 0) return BadRequest(new { message = "Enter a username." });
            if (await _db.Users.AnyAsync(u => u.Username.ToLower() == username.ToLower()))
                return BadRequest(new { message = $"A user called '{username}' already exists." });
            if (!Roles.Contains(input.Role)) return BadRequest(new { message = "Role must be Admin or Staff." });
            if ((input.Password ?? string.Empty).Length < MinPasswordLength)
                return BadRequest(new { message = $"Password must be at least {MinPasswordLength} characters." });

            var user = new User
            {
                Username = username,
                Role = input.Role!,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password),
                AllowedTabs = TabsToStore(input.Role!, input.AllowedTabs)
            };
            _db.Users.Add(user);
            await _db.SaveChangesAsync();
            return Ok(ToResponse(user));
        }

        // Role and tab access; the username stays the same so the history stays readable
        [HttpPut("{id:int}")]
        public async Task<IActionResult> Update(int id, [FromBody] UserInput input)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();
            if (!Roles.Contains(input.Role)) return BadRequest(new { message = "Role must be Admin or Staff." });
            if (user.Role == "Admin" && input.Role != "Admin" && await IsLastAdmin(user))
                return BadRequest(new { message = "This is the only Admin. Make another user Admin first." });

            user.Role = input.Role!;
            user.AllowedTabs = TabsToStore(user.Role, input.AllowedTabs);
            await _db.SaveChangesAsync();
            return Ok(ToResponse(user));
        }

        [HttpPost("{id:int}/reset-password")]
        public async Task<IActionResult> ResetPassword(int id, [FromBody] UserInput input)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();
            if ((input.Password ?? string.Empty).Length < MinPasswordLength)
                return BadRequest(new { message = $"Password must be at least {MinPasswordLength} characters." });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(input.Password);
            await _db.SaveChangesAsync();
            return Ok(new { message = $"Password reset for {user.Username}." });
        }

        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            var user = await _db.Users.FindAsync(id);
            if (user == null) return NotFound();
            if (string.Equals(user.Username, User.Identity?.Name, StringComparison.OrdinalIgnoreCase))
                return BadRequest(new { message = "You can't delete your own account." });
            if (user.Role == "Admin" && await IsLastAdmin(user))
                return BadRequest(new { message = "This is the only Admin and can't be deleted." });

            _db.Users.Remove(user);
            await _db.SaveChangesAsync();
            return NoContent();
        }

        private Task<bool> IsLastAdmin(User user) =>
            _db.Users.AllAsync(u => u.Id == user.Id || u.Role != "Admin");

        // Admins always see every tab, so nothing is stored for them
        private static string? TabsToStore(string role, string[]? tabs)
        {
            if (role == "Admin" || tabs == null) return null;
            var clean = tabs.Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().ToArray();
            return string.Join(",", clean);
        }

        private static object ToResponse(User u) => new
        {
            id = u.Id,
            username = u.Username,
            role = u.Role,
            allowedTabs = u.Role == "Admin" ? null : AccessFilter.AllowedTabs(u.AllowedTabs)?.ToArray() ?? Array.Empty<string>()
        };
    }

    public class UserInput
    {
        public string? Username { get; set; }
        public string? Password { get; set; }
        public string? Role { get; set; }
        public string[]? AllowedTabs { get; set; }
    }
}
