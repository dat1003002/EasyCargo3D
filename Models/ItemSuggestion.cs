namespace EasyCargo3D.Models
{
    public class ItemSuggestion
    {
        public CargoItem Item { get; set; } = new();
        public int SuggestedQty { get; set; }
    }
}
