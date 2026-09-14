using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ShoeFactoryApi.Migrations
{
    /// <inheritdoc />
    public partial class AddParentArticles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ArticleId",
                table: "Products",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Articles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ArticleNumber = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Articles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Products_ArticleId",
                table: "Products",
                column: "ArticleId");

            migrationBuilder.CreateIndex(
                name: "IX_Articles_ArticleNumber",
                table: "Articles",
                column: "ArticleNumber",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Products_Articles_ArticleId",
                table: "Products",
                column: "ArticleId",
                principalTable: "Articles",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Products_Articles_ArticleId",
                table: "Products");

            migrationBuilder.DropTable(
                name: "Articles");

            migrationBuilder.DropIndex(
                name: "IX_Products_ArticleId",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "ArticleId",
                table: "Products");
        }
    }
}
