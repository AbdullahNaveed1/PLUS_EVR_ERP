using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;

namespace ShoeFactoryApi.Auth
{
    /// <summary>
    /// Runs on every signed-in request and checks the user against the database, so changes made
    /// on the Users page apply at once: deleted users and changed roles must sign in again, and
    /// Staff can only save changes in the tabs an Admin gave them. Reading data is always allowed
    /// because tabs share lists (Billing needs customers and products, for example).
    /// </summary>
    public class AccessFilter : IAsyncActionFilter
    {
        // Controller -> tabs whose users may add / edit / delete through it
        private static readonly Dictionary<string, string[]> WriteTabs = new(StringComparer.OrdinalIgnoreCase)
        {
            ["Sales"] = new[] { "sales" },
            ["Payments"] = new[] { "customers", "sales" },
            ["Customers"] = new[] { "customers", "sales" },
            ["Products"] = new[] { "inventory" },
            ["Articles"] = new[] { "inventory" },
            ["Inventory"] = new[] { "inventory" },
            ["Production"] = new[] { "production" },
            ["MaterialCounts"] = new[] { "production" },
            ["Bom"] = new[] { "production" },
            ["RawMaterials"] = new[] { "rawmaterials", "entry" },
            ["MaterialEntries"] = new[] { "entry", "rawmaterials" },
            ["Expenses"] = new[] { "expenses" },
            ["Wages"] = new[] { "wages" },
            ["Workers"] = new[] { "wages" }
        };

        private readonly FactoryDbContext _db;
        public AccessFilter(FactoryDbContext db) { _db = db; }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var principal = context.HttpContext.User;
            if (principal.Identity?.IsAuthenticated != true)
            {
                await next();
                return;
            }

            var name = principal.Identity.Name;
            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == name);
            var tokenRole = principal.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
            if (user == null || user.Role != tokenRole)
            {
                context.Result = new ObjectResult(new { message = "Your account was changed or removed. Please sign in again." }) { StatusCode = 401 };
                return;
            }

            if (user.Role == "Admin" || HttpMethods.IsGet(context.HttpContext.Request.Method))
            {
                await next();
                return;
            }

            var controller = (context.ActionDescriptor as ControllerActionDescriptor)?.ControllerName ?? string.Empty;
            var allowed = AllowedTabs(user.AllowedTabs);
            if (allowed != null && WriteTabs.TryGetValue(controller, out var tabs) && !tabs.Any(allowed.Contains))
            {
                context.Result = new ObjectResult(new { message = "You don't have access to change this. Ask an Admin." }) { StatusCode = 403 };
                return;
            }

            await next();
        }

        // null = every tab
        public static HashSet<string>? AllowedTabs(string? stored) =>
            string.IsNullOrWhiteSpace(stored)
                ? null
                : stored.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }
}
