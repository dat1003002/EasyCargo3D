namespace EasyCargo3D.Models
{
    public class OptimizeResult
    {
        public LoadingPlan Plan { get; set; } = new();
        public List<ItemSuggestion> Suggestions { get; set; } = new();
    }
}
