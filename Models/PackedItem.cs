namespace EasyCargo3D.Models
{
    public class PackedItem
    {
        public CargoItem Item { get; set; } = new();
        public double X { get; set; }
        public double Y { get; set; }
        public double Z { get; set; }
        public int RotationY { get; set; } = 0;
    }
}
