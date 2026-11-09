using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class AddMaterialKindAndProductionSizes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SizesJson",
                table: "ProductionRecords",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                table: "MaterialEntries",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "received");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SizesJson",
                table: "ProductionRecords");

            migrationBuilder.DropColumn(
                name: "Kind",
                table: "MaterialEntries");
        }
    }
}
