using EasyCargo3D.Models;

namespace EasyCargo3D.Services
{
    public interface IPalletTypeService
    {
        Task<List<PalletType>> GetAllAsync();
        Task<PalletType?> GetByIdAsync(int id);
        Task<PalletType?> GetByCodeAsync(string code);
        Task<PalletType> CreateAsync(PalletType model);
        Task<PalletType> UpdateAsync(PalletType model);
        Task DeleteAsync(int id);
    }
}
