using EasyCargo3D.Models;

namespace EasyCargo3D.Services
{
    public interface IContainerTypeService
    {
        Task<List<ContainerType>> GetAllAsync();
        Task<ContainerType?> GetByIdAsync(int id);
        Task<ContainerType?> GetByCodeAsync(string code);
        Task<ContainerType> CreateAsync(ContainerType model);
        Task<ContainerType> UpdateAsync(ContainerType model);
        Task DeleteAsync(int id);
    }
}
