using System.ComponentModel.DataAnnotations;

namespace EasyCargo3D.Models
{
    public class ContainerType
    {
        public int Id { get; set; }

        [Required, MaxLength(50)]
        public string Code { get; set; } = "";      

        [Required, MaxLength(100)]
        public string Name { get; set; } = "";       

        public double Length { get; set; }         
        public double Width { get; set; }            
        public double Height { get; set; }            
        public double MaxWeight { get; set; }         

        [MaxLength(20)]
        public string Icon { get; set; } = "&#x1F4E6;";

        public bool IsActive { get; set; } = true;
        public int SortOrder { get; set; } = 0;
    }
}
