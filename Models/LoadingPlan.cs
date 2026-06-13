namespace EasyCargo3D.Models
{
    public class LoadingPlan
    {
        public Container Container { get; set; } = new();
        public List<CargoItem> CargoItems { get; set; } = new();
        public List<PackedItem> PackedItems { get; set; } = new();
        public double VolumeUtilization { get; set; }
        public double WeightUtilization { get; set; }
        public double TotalWeight { get; set; }
        public double TotalVolume { get; set; }
        public WeightBalance? WeightBalance { get; set; }
        public double WoodWeight { get; set; }
        public int WoodCount { get; set; }
    }
}
