namespace EasyCargo3D.Models
{
    public class LoadingRequest
    {
        public string ContainerType { get; set; } = "20ft";
        public List<CargoItem> Items { get; set; } = new();
    }
}
