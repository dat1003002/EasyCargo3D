using EasyCargo3D.Data;
using EasyCargo3D.Models;
using Microsoft.EntityFrameworkCore;

namespace EasyCargo3D.Repositories
{
    public class PalletTypeRepository : IPalletTypeRepository
    {
        private readonly AppDbContext _db;
        public PalletTypeRepository(AppDbContext db) => _db = db;

        public Task<List<PalletType>> GetAllActiveAsync() =>
            _db.PalletTypes
               .Where(x => x.IsActive)
               .OrderBy(x => x.SortOrder)
               .ToListAsync();

        public Task<PalletType?> GetByIdAsync(int id) =>
            _db.PalletTypes.FirstOrDefaultAsync(x => x.Id == id);

        public Task<PalletType?> GetByCodeAsync(string code) =>
            _db.PalletTypes.FirstOrDefaultAsync(x => x.Code == code && x.IsActive);

        public async Task<PalletType> CreateAsync(PalletType entity)
        {
            _db.PalletTypes.Add(entity);
            await _db.SaveChangesAsync();
            return entity;
        }

        public async Task<PalletType> UpdateAsync(PalletType entity)
        {
            _db.PalletTypes.Update(entity);
            await _db.SaveChangesAsync();
            return entity;
        }

        public async Task DeleteAsync(int id)
        {
            var entity = await _db.PalletTypes.FindAsync(id);
            if (entity != null)
            {
                entity.IsActive = false; // soft delete
                await _db.SaveChangesAsync();
            }
        }
    }
}
