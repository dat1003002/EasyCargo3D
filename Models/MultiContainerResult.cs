namespace EasyCargo3D.Models
{
    public class MultiContainerResult
    {
        public List<LoadingPlan> Plans { get; set; } = new();
        public int TotalItemUnits { get; set; }
        public int PackedItemUnits { get; set; }
        public List<CargoItem> UnpackedItems { get; set; } = new();
    }
}
