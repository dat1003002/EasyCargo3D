using EasyCargo3D.Models;

namespace EasyCargo3D.Repositories
{
    public interface IContainerTypeRepository
    {
        Task<List<ContainerType>> GetAllActiveAsync();
        Task<ContainerType?> GetByIdAsync(int id);
        Task<ContainerType?> GetByCodeAsync(string code);
        Task<ContainerType> CreateAsync(ContainerType entity);
        Task<ContainerType> UpdateAsync(ContainerType entity);
        Task DeleteAsync(int id);
    }
}
