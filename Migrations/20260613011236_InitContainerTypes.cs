using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace EasyCargo3D.Migrations
{
    /// <inheritdoc />
    public partial class InitContainerTypes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ContainerTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Code = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Length = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Width = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Height = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    MaxWeight = table.Column<double>(type: "float(10)", precision: 10, scale: 2, nullable: false),
                    Icon = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ContainerTypes", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "ContainerTypes",
                columns: new[] { "Id", "Code", "Height", "Icon", "IsActive", "Length", "MaxWeight", "Name", "SortOrder", "Width" },
                values: new object[,]
                {
                    { 1, "20ft", 228.0, "&#x1F6A2;", true, 585.0, 28200.0, "20ft Standard", 1, 235.0 },
                    { 2, "40ft", 228.0, "&#x1F6A2;", true, 1185.0, 26750.0, "40ft Standard", 2, 235.0 },
                    { 3, "40hc", 268.0, "&#x1F4E6;", true, 1185.0, 26460.0, "40ft High Cube", 3, 235.0 },
                    { 4, "45hc", 269.0, "&#x1F4E6;", true, 1351.0, 27600.0, "45ft High Cube", 4, 235.0 },
                    { 5, "truck", 270.0, "&#x1F69B;", true, 1360.0, 24000.0, "Truck 13.6m", 5, 240.0 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_ContainerTypes_Code",
                table: "ContainerTypes",
                column: "Code",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ContainerTypes");
        }
    }
}
