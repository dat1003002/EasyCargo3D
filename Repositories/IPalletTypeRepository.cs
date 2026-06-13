using EasyCargo3D.Models;

namespace EasyCargo3D.Repositories
{
    public interface IPalletTypeRepository
    {
        Task<List<PalletType>> GetAllActiveAsync();
        Task<PalletType?> GetByIdAsync(int id);
        Task<PalletType?> GetByCodeAsync(string code);
        Task<PalletType> CreateAsync(PalletType entity);
        Task<PalletType> UpdateAsync(PalletType entity);
        Task DeleteAsync(int id);
    }
}
