using Microsoft.EntityFrameworkCore;
using ShoeFactoryApi.Data;
using ShoeFactoryApi.Models;

namespace ShoeFactoryApi.Services
{
    /// <summary>
    /// Material used by a production entry, worked out from its article's recipe (amount per dozen).
    /// The deductions are ordinary "used" Material Entry rows tagged with the production id, so they
    /// show in Production Deduction, usage reports and the audit log.
    /// </summary>
    public static class RecipeDeductions
    {
        public const string Remark = "Auto from production recipe";

        // Removes this production's previous auto deductions (stock goes back), then adds them again
        // from the recipe unless the production is being deleted. Callers save the context afterwards.
        public static async Task Sync(FactoryDbContext db, ProductionRecord record, string? user, bool removeOnly = false)
        {
            var previous = await db.MaterialEntries
                .Where(e => e.ProductionRecordId == record.Id && e.Kind == MaterialEntryKinds.Used)
                .ToListAsync();
            foreach (var entry in previous)
            {
                await MaterialStock.Reverse(db, entry);
                db.MaterialEntries.Remove(entry);
            }
            if (removeOnly) return;

            var article = record.ArticleNumber.Trim().ToLower();
            var lines = await db.BomEntries
                .Where(b => b.ArticleNumber.Trim().ToLower() == article && b.QtyPerDozen > 0)
                .ToListAsync();
            var dozens = record.Dozens + record.Pairs / 12m;
            if (lines.Count == 0 || dozens <= 0) return;

            var date = DateOnly.FromDateTime(record.Date);
            foreach (var line in lines)
            {
                var entry = new MaterialEntry
                {
                    Id = Guid.NewGuid(),
                    Kind = MaterialEntryKinds.Used,
                    Date = date,
                    Material = string.Empty,
                    Quantity = decimal.Round(line.QtyPerDozen * dozens, 4, MidpointRounding.AwayFromZero),
                    ArticleNo = record.ArticleNumber,
                    Remarks = $"{Remark}: {decimal.Round(dozens, 2)} dozen × {line.QtyPerDozen:0.####} per dozen",
                    EnteredBy = user,
                    ProductionRecordId = record.Id,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                // Recipe lines always point at an existing Raw Materials item; skip any that was deleted since
                if (await MaterialStock.Apply(db, entry, line.RawMaterialId) == null)
                    db.MaterialEntries.Add(entry);
            }
        }
    }
}
