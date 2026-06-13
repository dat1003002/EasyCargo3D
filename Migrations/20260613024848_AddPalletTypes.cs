using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace EasyCargo3D.Migrations
{
    /// <inheritdoc />
    public partial class AddPalletTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PalletTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Length = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Width = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Height = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Weight = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Color = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PalletTypes", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "PalletTypes",
                columns: new[] { "Id", "Code", "Color", "Height", "IsActive", "Length", "Name", "SortOrder", "Weight", "Width" },
                values: new object[,]
                {
                    { 1, "euro", "#F39C12", 144.0, true, 120.0, "Euro Pallet 120x80", 1, 500.0, 80.0 },
                    { 2, "amer", "#3498DB", 144.0, true, 120.0, "American Pallet 120x100", 2, 600.0, 100.0 },
                    { 3, "half", "#2ECC71", 100.0, true, 60.0, "Half Pallet 60x80", 3, 250.0, 80.0 },
                    { 4, "ind", "#E74C3C", 150.0, true, 120.0, "Industrial 120x120", 4, 700.0, 120.0 },
                    { 5, "custom", "#9B59B6", 86.0, true, 52.0, "Custom Box", 5, 0.0, 40.0 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_PalletTypes_Code",
                table: "PalletTypes",
                column: "Code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PalletTypes");
        }
    }
}
