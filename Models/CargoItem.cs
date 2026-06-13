namespace EasyCargo3D.Models
{
    public class CargoItem
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public double Length { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public double Weight { get; set; }
        public int Quantity { get; set; } = 1;
        public string Color { get; set; } = "#4A90D9";
        public bool Stackable { get; set; } = true;
        public string Description { get; set; } = "";
        public bool IsWood { get; set; } = false;
    }
}
