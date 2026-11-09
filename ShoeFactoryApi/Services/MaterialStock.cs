using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Keeps Raw Materials tab stock in step with Material Entry rows: a live "received" row adds
    /// its quantity, a live "used" row (manual or from a recipe) takes it away. Deleted (voided)
    /// rows count for nothing. Callers save the context afterwards.
    /// </summary>
    public static class MaterialStock
    {
        private static decimal Signed(MaterialEntry entry) =>
            entry.Kind == MaterialEntryKinds.Used ? -entry.Quantity : entry.Quantity;

        // Links the row to its Raw Materials item (by id, else by name) and moves the stock
        public static async Task<string?> Apply(FactoryDbContext db, MaterialEntry entry, int? rawMaterialId)
        {
            if (entry.Voided) return null;

            var name = entry.Material.Trim().ToLower();
            var raw = rawMaterialId.HasValue
                ? await db.RawMaterials.FindAsync(rawMaterialId.Value)
                : await db.RawMaterials.OrderBy(r => r.Id).FirstOrDefaultAsync(r => r.Name.Trim().ToLower() == name);
            if (raw == null) return $"'{entry.Material}' is not on the Raw Materials tab. Add it there first.";

            entry.RawMaterialId = raw.Id;
            entry.Material = raw.Name;
            entry.Unit = raw.Unit;
            raw.StockQty += Signed(entry);
            return null;
        }

        // Undoes what Apply did, e.g. before an edit or when the row is deleted
        public static async Task Reverse(FactoryDbContext db, MaterialEntry entry)
        {
            if (entry.Voided || !entry.RawMaterialId.HasValue) return;
            var raw = await db.RawMaterials.FindAsync(entry.RawMaterialId.Value);
            if (raw != null) raw.StockQty -= Signed(entry);
        }
    }
}
