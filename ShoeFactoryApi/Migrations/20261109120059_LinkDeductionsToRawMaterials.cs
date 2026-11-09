using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class LinkDeductionsToRawMaterials : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RawMaterialId",
                table: "MaterialEntries",
                type: "integer",
                nullable: true);

            // One time: link deductions made before this change to the Raw Materials item with the
            // same name, and take their live (not deleted) quantities out of its Stock Qty
            migrationBuilder.Sql(@"
                UPDATE ""MaterialEntries"" e
                SET ""RawMaterialId"" = (
                    SELECT r.""Id"" FROM ""RawMaterials"" r
                    WHERE lower(trim(r.""Name"")) = lower(trim(e.""Material""))
                    ORDER BY r.""Id"" LIMIT 1)
                WHERE e.""Kind"" = 'used';

                UPDATE ""MaterialEntries"" e
                SET ""Material"" = r.""Name"", ""Unit"" = r.""Unit""
                FROM ""RawMaterials"" r
                WHERE e.""RawMaterialId"" = r.""Id"";

                UPDATE ""RawMaterials"" r
                SET ""StockQty"" = r.""StockQty"" - used.qty
                FROM (
                    SELECT ""RawMaterialId"" AS id, SUM(""Quantity"") AS qty
                    FROM ""MaterialEntries""
                    WHERE ""Kind"" = 'used' AND NOT ""Voided"" AND ""RawMaterialId"" IS NOT NULL
                    GROUP BY ""RawMaterialId""
                ) used
                WHERE r.""Id"" = used.id;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RawMaterialId",
                table: "MaterialEntries");
        }
    }
}
