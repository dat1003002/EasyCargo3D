namespace EasyCargo3D.Models
{
    public class MultiContainerRequest
    {
        public string ContainerType { get; set; } = "40hc";
        public int ContainerCount { get; set; } = 8;
        public double MaxWeightPerContainer { get; set; } = 19000;
        public List<CargoItem> Items { get; set; } = new();
    }
}
