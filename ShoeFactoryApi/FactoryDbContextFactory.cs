using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace ShoeFactoryApi.Data
{
    /// <summary>
    /// Used ONLY by `dotnet ef` at design time to build migrations.
    /// It is never invoked at runtime — Railway uses the connection string
    /// built in Program.cs from DATABASE_URL.
    /// </summary>
    public class FactoryDbContextFactory : IDesignTimeDbContextFactory<FactoryDbContext>
    {
        public FactoryDbContext CreateDbContext(string[] args)
        {
            var optionsBuilder = new DbContextOptionsBuilder<FactoryDbContext>();

            // Placeholder connection string — only used so EF Core can read the model.
            // No connection is opened when running `migrations add`.
            optionsBuilder.UseNpgsql("Host=localhost;Database=design_time_only;Username=postgres;Password=postgres");

            return new FactoryDbContext(optionsBuilder.Options);
        }
    }
}