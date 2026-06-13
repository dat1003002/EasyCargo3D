using EasyCargo3D.Models;
using EasyCargo3D.Repositories;

namespace EasyCargo3D.Services
{
    public class PalletTypeService : IPalletTypeService
    {
        private readonly IPalletTypeRepository _repo;
        public PalletTypeService(IPalletTypeRepository repo) => _repo = repo;

        public Task<List<PalletType>> GetAllAsync()          => _repo.GetAllActiveAsync();
        public Task<PalletType?> GetByIdAsync(int id)        => _repo.GetByIdAsync(id);
        public Task<PalletType?> GetByCodeAsync(string code) => _repo.GetByCodeAsync(code);
        public Task<PalletType> CreateAsync(PalletType model) => _repo.CreateAsync(model);
        public Task<PalletType> UpdateAsync(PalletType model) => _repo.UpdateAsync(model);
        public Task DeleteAsync(int id)                       => _repo.DeleteAsync(id);
    }
}
