namespace EasyCargo3D.Models
{
    public class OptimizeRequest
    {
        public string ContainerType { get; set; } = "20ft";
        public List<CargoItem> ItemTypes { get; set; } = new();
    }
}
