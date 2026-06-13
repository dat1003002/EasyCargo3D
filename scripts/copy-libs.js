/**
 * Copy thư viện từ node_modules → wwwroot/lib
 * Chạy tự động khi dotnet build (xem EasyCargo3D.csproj)
 */
const fs   = require('fs');
const path = require('path');

const root    = path.resolve(__dirname, '..');
const nm      = path.join(root, 'node_modules');
const wwwroot = path.join(root, 'wwwroot', 'lib');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    const kb = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`  [OK] ${path.relative(root, dest)} (${kb} KB)`);
}

function copyDir(srcDir, destDir, filter) {
    ensureDir(destDir);
    fs.readdirSync(srcDir).forEach(file => {
        if (!filter || filter(file)) {
            copyFile(path.join(srcDir, file), path.join(destDir, file));
        }
    });
}

// ── Three.js r128 ──────────────────────────────────────────────
console.log('\nThree.js:');
const threeOut = path.join(wwwroot, 'three');
copyFile(path.join(nm, 'three', 'build', 'three.min.js'),
         path.join(threeOut, 'three.min.js'));
copyFile(path.join(nm, 'three', 'examples', 'js', 'loaders', 'GLTFLoader.js'),
         path.join(threeOut, 'GLTFLoader.js'));

// ── Font Awesome 6.4 ───────────────────────────────────────────
console.log('\nFont Awesome:');
const faRoot = path.join(nm, '@fortawesome', 'fontawesome-free');
copyFile(path.join(faRoot, 'css', 'all.min.css'),
         path.join(wwwroot, 'fontawesome', 'css', 'all.min.css'));
copyDir(
    path.join(faRoot, 'webfonts'),
    path.join(wwwroot, 'fontawesome', 'webfonts'),
    f => f.endsWith('.woff2') || f.endsWith('.ttf')
);

// ── Inter font ─────────────────────────────────────────────────
console.log('\nInter font:');
const interFiles = path.join(nm, '@fontsource', 'inter', 'files');
const interOut   = path.join(wwwroot, 'inter');
const weights    = ['300', '400', '500', '600', '700'];
weights.forEach(w => {
    const found = fs.readdirSync(interFiles)
        .find(f => f.includes(`latin-${w}-normal`) && f.endsWith('.woff2'));
    if (found) copyFile(path.join(interFiles, found), path.join(interOut, found));
});

// Tạo inter.css local nếu chưa có
const interCss = path.join(interOut, 'inter.css');
if (!fs.existsSync(interCss)) {
    const faces = weights.map(w => {
        const file = fs.readdirSync(interOut).find(f => f.includes(`latin-${w}-normal`) && f.endsWith('.woff2'));
        return file ? `@font-face {\n    font-family: 'Inter';\n    font-style: normal;\n    font-weight: ${w};\n    font-display: swap;\n    src: url('${file}') format('woff2');\n}` : '';
    }).filter(Boolean).join('\n');
    fs.writeFileSync(interCss, faces + '\n', 'utf8');
    console.log(`  [OK] wwwroot/lib/inter/inter.css (generated)`);
}

console.log('\nDone. All libraries copied to wwwroot/lib/\n');
