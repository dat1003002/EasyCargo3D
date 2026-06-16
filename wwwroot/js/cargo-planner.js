// ==================== APP STATE ====================
let cargoItems = [];
let selectedColor = '#E74C3C';
let selectedContainer = '20ft';
let currentPlan = null;
let wireframeMode = false;
let showLabels = true;
let itemIdCounter = 1;

// CONTAINERS được load từ SQL qua API — ban đầu rỗng, điền sau khi fetch
const CONTAINERS = {};

// ==================== LOAD CONTAINERS FROM API ====================
async function loadContainersFromAPI() {
    try {
        const res  = await fetch('/api/container-types');
        const list = await res.json();
        // Xóa object cũ, điền dữ liệu mới
        Object.keys(CONTAINERS).forEach(k => delete CONTAINERS[k]);
        list.filter(c => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder).forEach(c => {
            CONTAINERS[c.code] = { id: c.id, name: c.name, length: c.length, width: c.width, height: c.height, maxWeight: c.maxWeight, icon: c.icon };
        });
        if (!CONTAINERS[selectedContainer]) {
            selectedContainer = Object.keys(CONTAINERS)[0] || '20ft';
        }
    } catch (e) {
        console.error('Không load được danh sách container từ API:', e);
    }
}

// ==================== CONTAINER CARDS ====================
function initContainerCards() {
    const grid = document.getElementById('container-grid');
    grid.innerHTML = '';
    const canManage = (window.APP_CAN_MANAGE !== false);
    Object.entries(CONTAINERS).forEach(([key, c]) => {
        const card = document.createElement('div');
        card.className = 'container-type-card' + (key === selectedContainer ? ' active' : '');
        const actions = canManage ? `
            <div class="c-actions">
                <button class="c-btn-edit" onclick="event.stopPropagation();openEditContainerModal('${key}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="c-btn-del"  onclick="event.stopPropagation();deleteContainer('${key}')"  title="Xóa"><i class="fas fa-trash"></i></button>
            </div>` : '';
        card.innerHTML = `
            <div class="c-icon">${c.icon}</div>
            <div class="c-name">${c.name}</div>
            <div class="c-size">${c.length}×${c.width}×${c.height} cm</div>${actions}`;
        card.onclick = () => selectContainer(key);
        grid.appendChild(card);
    });
    // Nút thêm mới — chỉ Quản lý/Admin
    if (canManage) {
        const addCard = document.createElement('div');
        addCard.className = 'container-type-card container-add-card';
        addCard.innerHTML = `<div class="c-icon">&#x2795;</div><div class="c-name">Thêm mới</div>`;
        addCard.onclick = () => openAddContainerModal();
        grid.appendChild(addCard);
    }

    // Cập nhật dropdown trong tab Import
    const sel = document.getElementById('import-container-type');
    if (sel) {
        const prev = sel.value; // giữ lựa chọn cũ nếu có
        sel.innerHTML = '';
        // Placeholder bắt buộc chọn (tránh nhầm)
        const ph = document.createElement('option');
        ph.value = ''; ph.textContent = '— Chọn loại container —';
        ph.disabled = true;
        sel.appendChild(ph);
        Object.entries(CONTAINERS).forEach(([key, c]) => {
            const opt = document.createElement('option');
            opt.value = key;
            opt.textContent = c.name; // chỉ hiển thị tên
            sel.appendChild(opt);
        });
        // Khôi phục lựa chọn cũ, nếu chưa chọn thì để trống ở placeholder
        sel.value = (prev && CONTAINERS[prev]) ? prev : '';
        if (!sel.value) ph.selected = true;
    }
    // Dropdown chọn loại để THÊM vào danh sách ưu tiên
    const pick = document.getElementById('ctype-pick');
    if (pick) {
        pick.innerHTML = '';
        Object.entries(CONTAINERS).forEach(([key, c]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = c.name;
            pick.appendChild(opt);
        });
    }
    renderCtypeList();
    updateContainerSpecs();
    if (window.onImportContainerChange) window.onImportContainerChange();
}

function selectContainer(key) {
    selectedContainer = key;
    document.querySelectorAll('.container-type-card').forEach((c, i) => {
        c.classList.toggle('active', Object.keys(CONTAINERS)[i] === key);
    });
    updateContainerSpecs();
    renderScene();
}

function updateContainerSpecs() {
    const c = CONTAINERS[selectedContainer];
    document.getElementById('spec-content').innerHTML = `
        <table style="width:100%;font-size:12px;">
            <tr><td style="color:#718096;padding:3px 0;">Internal Length</td><td style="text-align:right;font-weight:600;">${c.length} cm</td></tr>
            <tr><td style="color:#718096;padding:3px 0;">Internal Width</td><td style="text-align:right;font-weight:600;">${c.width} cm</td></tr>
            <tr><td style="color:#718096;padding:3px 0;">Internal Height</td><td style="text-align:right;font-weight:600;">${c.height} cm</td></tr>
            <tr><td style="color:#718096;padding:3px 0;">Max Payload</td><td style="text-align:right;font-weight:600;">${c.maxWeight.toLocaleString()} kg</td></tr>
            <tr><td style="color:#718096;padding:3px 0;">Volume</td><td style="text-align:right;font-weight:600;">${(c.length*c.width*c.height/1000000).toFixed(1)} m³</td></tr>
        </table>`;
}

// ==================== THREE.JS SETUP ====================
const canvas = document.getElementById('three-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();

// Nền gradient studio (xanh đậm → xanh tím nhạt)
(function() {
    const cv = document.createElement('canvas'); cv.width = 2; cv.height = 256;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0,   '#243049');
    g.addColorStop(0.5, '#1a2235');
    g.addColorStop(1,   '#0e1320');
    c.fillStyle = g; c.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(cv);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    else tex.encoding = THREE.sRGBEncoding;
    scene.background = tex;
})();

// near=10/far=12000: tỉ lệ nhỏ → depth buffer chính xác, hết nháy khung (z-fighting)
const camera = new THREE.PerspectiveCamera(45, 1, 10, 12000);
camera.position.set(800, 600, 900);
camera.lookAt(0, 0, 0);

// ── Lighting studio 3 điểm ──
const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambientLight);
// Trời/đất: xanh trời trên, ấm dưới
const hemiLight = new THREE.HemisphereLight(0xbcd6ff, 0x2a2f3a, 0.75);
scene.add(hemiLight);
// Key light (chính, ấm nhẹ) — đổ bóng mềm
const dirLight = new THREE.DirectionalLight(0xfff4e6, 1.35);
dirLight.position.set(600, 950, 500);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 100;
dirLight.shadow.camera.far = 4000;
dirLight.shadow.camera.left = -1500;
dirLight.shadow.camera.right = 1500;
dirLight.shadow.camera.top = 1500;
dirLight.shadow.camera.bottom = -1500;
dirLight.shadow.bias = -0.0004;
dirLight.shadow.radius = 4;
scene.add(dirLight);
// Fill light (lạnh, đối diện) — làm dịu vùng tối
const dirLight2 = new THREE.DirectionalLight(0x6688cc, 0.45);
dirLight2.position.set(-600, 350, -500);
scene.add(dirLight2);
// Rim light (viền sau) — tách container khỏi nền
const rimLight = new THREE.DirectionalLight(0xaaccff, 0.5);
rimLight.position.set(-200, 400, -800);
scene.add(rimLight);

// ── Mặt sàn nhận bóng (shadow catcher) ──
const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(3000, 60, 0x3a4866, 0x232b3d);
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.6;
scene.add(gridHelper);

const gltfLoader = new THREE.GLTFLoader ? new THREE.GLTFLoader() : null;

// ==================== CAMERA ORBIT CONTROLS ====================
let isDragging = false, lastX = 0, lastY = 0;
// rotX: góc dọc (pitch) — âm = nhìn từ dưới, dương = nhìn từ trên
// rotY: góc ngang (yaw)
let rotX = 0.42, rotY = -0.55, zoom = 1.0;
let panX = 0, panY = 0;
let targetCenterY = 0; // tâm container theo trục Y
let currentView = 'perspective';
let autoRotate = false;
let autoRotateAngle = -0.5;

// ==================== PALLET SELECTION & DRAG ====================
const raycaster  = new THREE.Raycaster();
const mouse2d    = new THREE.Vector2();
const dragPlaneH = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPt     = new THREE.Vector3();

let selectedMesh   = null;
let selectedPi     = null;
let isDragPallet   = false;
let mouseDownPos   = { x: 0, y: 0 };

// Inject pallet info panel vào viewer
(function() {
    const d = document.createElement('div');
    d.id = 'pallet-info';
    d.style.cssText = `position:absolute;bottom:60px;left:50%;transform:translateX(-50%);
        background:rgba(15,17,23,0.96);border:1.5px solid #667eea;border-radius:12px;
        padding:14px 18px;display:none;z-index:40;backdrop-filter:blur(12px);
        min-width:300px;box-shadow:0 6px 30px rgba(0,0,0,0.6);font-size:12px;color:#e2e8f0;`;
    d.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <span id="pi-name" style="font-size:14px;font-weight:700;color:#a78bfa;"></span>
            <button onclick="deselectPallet()" style="background:none;border:none;color:#718096;cursor:pointer;font-size:18px;line-height:1;">×</button>
        </div>
        <div id="pi-dims" style="color:#718096;margin-bottom:10px;font-size:11px;"></div>
        <div style="display:flex;gap:8px;">
            <button id="pi-move-btn" onclick="togglePalletDrag()"
                style="flex:1;padding:7px;background:linear-gradient(135deg,#667eea,#764ba2);border:none;border-radius:7px;color:#fff;cursor:pointer;font-weight:600;font-size:12px;">
                ✋ Kéo di chuyển
            </button>
            <button onclick="removeSelectedPallet()"
                style="flex:1;padding:7px;background:#e53e3e;border:none;border-radius:7px;color:#fff;cursor:pointer;font-weight:600;font-size:12px;">
                ✕ Xóa khỏi cont.
            </button>
        </div>
        <div id="pi-drag-hint" style="display:none;margin-top:8px;padding:6px;background:#2d3748;border-radius:6px;color:#f6ad55;font-size:11px;text-align:center;">
            🖱️ Kéo chuột để di chuyển pallet · Click phải hoặc Esc để hủy
        </div>`;
    document.querySelector('.viewer-container').appendChild(d);
})();

function showPalletPanel(pi) {
    document.getElementById('pi-name').textContent = pi.item.name;
    document.getElementById('pi-dims').textContent =
        `${pi.item.length}×${pi.item.width}×${pi.item.height} cm · ${pi.item.weight} kg`;
    document.getElementById('pallet-info').style.display = 'block';
}

function selectPallet(mesh, pi) {
    if (selectedMesh === mesh) { deselectPallet(); return; }
    deselectPallet();
    selectedMesh = mesh; selectedPi = pi;
    // Glow emissive
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.userData.origMats = mesh.material;
    mesh.material = mats.map(m => { const c = m.clone(); c.emissive = new THREE.Color(0xffffff); c.emissiveIntensity = 0.3; return c; });
    showPalletPanel(pi);
}

function deselectPallet() {
    if (selectedMesh && selectedMesh.userData.origMats) selectedMesh.material = selectedMesh.userData.origMats;
    selectedMesh = null; selectedPi = null; isDragPallet = false;
    const p = document.getElementById('pallet-info'); if (p) p.style.display = 'none';
    const btn = document.getElementById('pi-move-btn');
    if (btn) { btn.textContent = '✋ Kéo di chuyển'; btn.style.background = 'linear-gradient(135deg,#667eea,#764ba2)'; }
    const hint = document.getElementById('pi-drag-hint'); if (hint) hint.style.display = 'none';
}

function togglePalletDrag() {
    isDragPallet = !isDragPallet;
    const btn  = document.getElementById('pi-move-btn');
    const hint = document.getElementById('pi-drag-hint');
    if (isDragPallet) {
        btn.textContent = '⏹ Thả pallet'; btn.style.background = 'linear-gradient(135deg,#f6ad55,#ed8936)';
        hint.style.display = 'block';
    } else {
        btn.textContent = '✋ Kéo di chuyển'; btn.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
        hint.style.display = 'none';
    }
}

function removeSelectedPallet() {
    if (!selectedPi || !currentPlan) return;
    currentPlan.packedItems = currentPlan.packedItems.filter(p => p !== selectedPi);
    deselectPallet(); renderScene(currentPlan);
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') deselectPallet(); });

function findPiByMesh(mesh) {
    if (!currentPlan) return null;
    const C = currentPlan.container;
    const offX = -C.length/2, offZ = -C.width/2;
    return currentPlan.packedItems.find(pi => {
        const rotated = (pi.rotationY === 90 || pi.rotationY === 270);
        const L = rotated ? pi.item.width : pi.item.length;
        const W = rotated ? pi.item.length : pi.item.width;
        const cx = offX + pi.x + L/2;
        const cz = offZ + pi.z + W/2;
        const cy = pi.y + pi.item.height/2;
        return Math.abs(mesh.position.x - cx) < 3 && Math.abs(mesh.position.y - cy) < 3 && Math.abs(mesh.position.z - cz) < 3;
    }) || null;
}

canvas.addEventListener('mousedown', e => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
    if (!isDragPallet) { isDragging = true; lastX = e.clientX; lastY = e.clientY; }
});
canvas.addEventListener('mouseup', e => {
    isDragging = false;
    const moved = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
    if (moved < 6 && !isDragPallet) handleCanvasClick(e);
    if (isDragPallet && moved < 6) togglePalletDrag(); // click để thả
});
canvas.addEventListener('mouseleave', () => { isDragging = false; });
canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse2d.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse2d.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse2d, camera);

    // --- Kéo pallet ---
    if (isDragPallet && selectedMesh && selectedPi && currentPlan) {
        dragPlaneH.constant = -selectedPi.y;
        if (raycaster.ray.intersectPlane(dragPlaneH, dragPt)) {
            const C   = currentPlan.container;
            const item = selectedPi.item;
            let nx = dragPt.x + C.length/2 - item.length/2;
            let nz = dragPt.z + C.width/2  - item.width/2;
            nx = Math.max(0, Math.min(C.length - item.length, nx));
            nz = Math.max(0, Math.min(C.width  - item.width,  nz));
            selectedPi.x = nx; selectedPi.z = nz;
            selectedMesh.position.x = -C.length/2 + nx + item.length/2;
            selectedMesh.position.z = -C.width/2  + nz + item.width/2;
            document.getElementById('pi-dims').textContent =
                `${item.length}×${item.width}×${item.height} cm · ${item.weight} kg · (x:${Math.round(nx)} z:${Math.round(nz)})`;
        }
        return;
    }

    // --- Xoay / pan camera ---
    if (isDragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (e.buttons === 1) {
            // Kéo chuột → tự động về perspective mode
            currentView = 'perspective';
            rotY += dx * 0.005;
            rotX -= dy * 0.005;
            rotX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, rotX));
        } else if (e.buttons === 4 || e.buttons === 2) {
            panX -= dx * zoom * 0.8;
            panY += dy * zoom * 0.8;
        }
        lastX = e.clientX; lastY = e.clientY;
    }

    // --- Tooltip hover ---
    const tooltip = document.getElementById('tooltip');
    if (isDragPallet || !cargoGroup || !currentPlan) { tooltip.style.display = 'none'; return; }
    const hits = raycaster.intersectObjects(cargoGroup.children, false);
    if (hits.length > 0) {
        const pi = findPiByMesh(hits[0].object);
        if (pi) {
            document.getElementById('tooltip-name').textContent = pi.item.name;
            document.getElementById('tooltip-info').textContent =
                `${pi.item.length}×${pi.item.width}×${pi.item.height} cm · ${pi.item.weight} kg`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
            tooltip.style.top  = (e.clientY - rect.top  + 14) + 'px';
        } else tooltip.style.display = 'none';
    } else tooltip.style.display = 'none';
    // Thay con trỏ khi hover cargo
    canvas.style.cursor = (hits.length > 0 && !isDragPallet) ? 'pointer' : 'default';
});
canvas.addEventListener('wheel', e => {
    zoom *= e.deltaY > 0 ? 1.1 : 0.9;
    zoom = Math.max(0.1, Math.min(20, zoom));
    e.preventDefault();
}, { passive: false });

// Touch
let lastTouchDist = 0;
canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 1) { isDragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
    if (e.touches.length === 2) lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
});
canvas.addEventListener('touchend', () => { isDragging = false; });
canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
        rotY += dx * 0.005; rotX -= dy * 0.005;
        rotX = Math.max(0.05, Math.min(Math.PI/2 - 0.05, rotX));
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        zoom *= lastTouchDist / d; zoom = Math.max(0.1, Math.min(10, zoom));
        lastTouchDist = d;
    }
    e.preventDefault();
}, { passive: false });

function resizeRenderer() {
    const p = canvas.parentElement;
    const w = p.clientWidth  || p.offsetWidth;
    const h = p.clientHeight || p.offsetHeight;
    if (w < 10 || h < 10) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.resizeRenderer = resizeRenderer;
window.addEventListener('resize', resizeRenderer);
// ResizeObserver: tự resize canvas bất cứ khi nào viewer-container thay đổi kích thước
if (window.ResizeObserver) {
    new ResizeObserver(resizeRenderer).observe(canvas.parentElement);
}
setTimeout(resizeRenderer, 100);

// ==================== ANIMATE LOOP ====================
// Ẩn tường nào đang quay mặt về camera (cutaway động) để nhìn rõ pallet bên trong
let cutawayWalls = []; // danh sách tường để ẩn/hiện theo hướng camera
let forkliftGroup = null, forkCarriage = null, forkliftAnim = null; // mô phỏng xe nâng
let containerDoors = []; // {group, open} — cửa sau để đóng/mở
let doorsClosed = false; // true khi đã lên đủ pallet → cửa đóng
let lockMats = [];       // vật liệu góc/khung/cửa để phát sáng khi khóa

// Đóng/mở cửa + niêm phong (góc phát sáng) theo trạng thái doorsClosed
function applyDoorState() {
    containerDoors.forEach(d => {
        d.group.rotation.y = doorsClosed ? 0 : d.open;
        // Cửa đóng → đổ bóng như khối kín
        d.group.traverse(o => { if (o.isMesh) o.castShadow = doorsClosed; });
    });
    // Tường (2 bên + mái + trước): đóng → đổ bóng đầy đủ; mở → tắt (tránh bóng đen sai)
    cutawayWalls.forEach(w => { w.mesh.castShadow = doorsClosed; });
    // Khi đủ pallet & cửa đóng → các góc/khung/cửa phát sáng xanh = đã niêm phong
    const glow = new THREE.Color(doorsClosed ? 0x21a85a : 0x000000);
    lockMats.forEach(m => {
        if (!m) return;
        m.emissive = glow;
        m.emissiveIntensity = doorsClosed ? 0.7 : 0;
        m.needsUpdate = true;
    });
}
const _toCam = new THREE.Vector3();
function updateCutaway() {
    if (!cutawayWalls.length) return;
    // Đã đóng container (đủ pallet) → giữ kín, hiện hết tường, không ẩn khi xoay
    if (doorsClosed) {
        for (const w of cutawayWalls) w.mesh.visible = true;
        return;
    }
    for (const w of cutawayWalls) {
        _toCam.copy(camera.position).sub(w.center);
        // normal hướng về camera (dot > 0) → tường chắn tầm nhìn → ẩn
        w.mesh.visible = _toCam.dot(w.normal) <= 0;
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (autoRotate) {
        autoRotateAngle += 0.005;
        rotY = autoRotateAngle;
    }
    if (currentView === 'perspective') {
        const r = 1200 * zoom;
        camera.position.x = panX + r * Math.sin(rotY) * Math.cos(rotX);
        camera.position.y = panY + targetCenterY + r * Math.sin(rotX);
        camera.position.z =        r * Math.cos(rotY) * Math.cos(rotX);
        camera.lookAt(panX, panY + targetCenterY, 0);
        camera.updateProjectionMatrix();
    }
    // Với top/front/side: camera đã được set cố định trong setView, chỉ cần render
    updateCutaway();
    updateForklift(performance.now());
    renderer.render(scene, camera);
}
animate();

// ==================== BUILD CONTAINER ====================
let containerGroup = null;

function buildContainer(L, W, H) {
    if (containerGroup) { scene.remove(containerGroup); containerGroup = null; }
    containerGroup = new THREE.Group();

    const fw = 8; // độ rộng khung thép
    const yBot = -H/2, yTop = H/2;

    // ── Helper ──
    function addBox(w, h, d, m, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        containerGroup.add(mesh); return mesh;
    }

    // ── Texture sàn gỗ (bamboo/hardwood planks) ──
    function makeFloorTex() {
        const cw = 512, ch = 128;
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const c  = cv.getContext('2d');
        const plankW = Math.round(cw / 8);
        for (let i = 0; i < 8; i++) {
            const hue = 28 + (i % 3) * 4;
            const lum = 28 + (i % 2) * 5;
            c.fillStyle = `hsl(${hue},52%,${lum}%)`;
            c.fillRect(i * plankW, 0, plankW - 1, ch);
            // grain lines
            c.strokeStyle = `hsla(${hue},40%,${lum-8}%,0.4)`;
            c.lineWidth = 1;
            for (let y = 6; y < ch; y += 12 + Math.random() * 6) {
                c.beginPath(); c.moveTo(i*plankW, y); c.lineTo(i*plankW+plankW-1, y + (Math.random()-0.5)*4); c.stroke();
            }
        }
        // joint lines
        c.fillStyle = 'rgba(0,0,0,0.35)';
        for (let i = 1; i < 8; i++) c.fillRect(i*plankW-1, 0, 2, ch);
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = THREE.RepeatWrapping; t.repeat.x = Math.ceil(L / 64);
        return t;
    }

    // ── Texture sóng corrugated thép xanh (sóng đứng) ──
    function makeCorrugatedTex(panelW, panelH, r, g, b, repV) {
        const cw = 256, ch = 128;
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
        const c  = cv.getContext('2d');
        c.fillStyle = `rgb(${r},${g},${b})`; c.fillRect(0, 0, cw, ch);
        // corrugation ridges (vertical stripes) — biên độ rõ hơn cho giống ảnh
        const period = 18;
        for (let x = 0; x < cw; x++) {
            const t = (x % period) / period;
            const shade = Math.round(Math.sin(t * Math.PI * 2) * 30);
            const rr = Math.max(0, Math.min(255, r + shade));
            const gg = Math.max(0, Math.min(255, g + shade));
            const bb = Math.max(0, Math.min(255, b + shade));
            c.fillStyle = `rgb(${rr},${gg},${bb})`;
            c.fillRect(x, 0, 1, ch);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(Math.ceil(panelW / 24), repV || 1);
        return tex;
    }

    // ── Texture sọc cảnh báo vàng/đen (chéo) ──
    function makeHazardTex(rep) {
        const s = 64;
        const cv = document.createElement('canvas'); cv.width = s; cv.height = s;
        const c = cv.getContext('2d');
        c.fillStyle = '#f2c200'; c.fillRect(0, 0, s, s);
        c.fillStyle = '#1a1a1a'; c.lineWidth = 0;
        for (let i = -s; i < s * 2; i += s/2) {
            c.beginPath();
            c.moveTo(i, 0); c.lineTo(i + s/4, 0);
            c.lineTo(i + s/4 - s, s); c.lineTo(i - s, s);
            c.closePath(); c.fill();
        }
        const t = new THREE.CanvasTexture(cv);
        t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep || 6, 1);
        return t;
    }

    // ── Màu xanh nhạt (kết hợp: corrugated nhẹ + trong suốt để nhìn rõ pallet) ──
    const cBlue   = [120, 175, 220];  // xanh nhạt sáng
    const cBlueDk = [100, 155, 200];  // mái/cửa tối hơn chút
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x8fbfe0, roughness: 0.75, metalness: 0.15, transparent: true, opacity: 0.85 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x3f8fcc, roughness: 0.45, metalness: 0.55 });
    const cornerMat= new THREE.MeshStandardMaterial({ color: 0xc8d2da, roughness: 0.35, metalness: 0.8 });
    const hazardMat= new THREE.MeshStandardMaterial({ map: makeHazardTex(8), roughness: 0.6, metalness: 0.2 });
    const hingeMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.4, metalness: 0.85 });
    const lockbarMat=new THREE.MeshStandardMaterial({ color: 0xe6ecf2, roughness: 0.3, metalness: 0.9 });

    // Tường ngoài: BackSide để nhìn xuyên vào trong, opacity thấp → vẫn thấy rõ pallet
    function wallMat(panelW, panelH) {
        return new THREE.MeshStandardMaterial({
            map: makeCorrugatedTex(panelW, panelH, ...cBlue, 1),
            roughness: 0.5, metalness: 0.45,
            side: THREE.BackSide, transparent: true, opacity: 0.32, depthWrite: false
        });
    }
    const roofMat = new THREE.MeshStandardMaterial({
        map: makeCorrugatedTex(W, L, ...cBlueDk, Math.ceil(L/24)),
        roughness: 0.5, metalness: 0.45,
        side: THREE.BackSide, transparent: true, opacity: 0.25, depthWrite: false
    });
    const frontMat = new THREE.MeshStandardMaterial({
        map: makeCorrugatedTex(W, H, ...cBlue, 1),
        roughness: 0.5, metalness: 0.45,
        side: THREE.BackSide, transparent: true, opacity: 0.32, depthWrite: false
    });
    // Cửa: bán trong suốt nhẹ (mở ra ngoài, không che pallet nên đậm hơn chút)
    const doorPanelMat = new THREE.MeshStandardMaterial({
        map: makeCorrugatedTex(W/2, H, ...cBlueDk, 1),
        roughness: 0.5, metalness: 0.5,
        transparent: true, opacity: 0.75
    });
    const doorRibMat = new THREE.MeshStandardMaterial({ color: 0x3f8fcc, roughness: 0.45, metalness: 0.55 });

    // Vật liệu sẽ phát sáng khi container đã niêm phong (đủ pallet + đóng cửa)
    lockMats = [cornerMat, frameMat, doorPanelMat, doorRibMat];

    // Tường sát mép trong container (khớp với không gian xếp hàng W×L) để pallet không thò ra
    const wallZ = W/2 - 0.75;

    // ── Sàn (rộng đúng bằng lòng container) ──
    addBox(L, 5, W, floorMat, 0, yBot + 2.5, 0);

    // Reset danh sách tường cho cutaway động (ẩn tường quay về camera)
    cutawayWalls = [];
    containerDoors = [];
    const cy = H / 2; // containerGroup dịch lên H/2 → toạ độ world theo Y

    // ── Hai tường bên (corrugated xanh) — không đổ bóng (tường trong suốt) ──
    [-wallZ, wallZ].forEach(z => {
        const m = addBox(L, H - fw*2, 1.5, wallMat(L, H), 0, 0, z);
        m.castShadow = false;
        cutawayWalls.push({ mesh: m, normal: new THREE.Vector3(0, 0, Math.sign(z)), center: new THREE.Vector3(0, cy, z) });
    });

    // ── Mái (sóng ngang) — không đổ bóng ──
    const roofM = addBox(L, 1.5, W, roofMat, 0, yTop - 0.75, 0);
    roofM.castShadow = false;
    cutawayWalls.push({ mesh: roofM, normal: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(0, cy + yTop - 0.75, 0) });

    // ── Tường trước — sát mép trong, không đổ bóng ──
    const frontX = -L/2 + 0.75;
    const frontM = addBox(1.5, H - fw*2, W, frontMat, frontX, 0, 0);
    frontM.castShadow = false;
    cutawayWalls.push({ mesh: frontM, normal: new THREE.Vector3(-1, 0, 0), center: new THREE.Vector3(frontX, cy, 0) });

    // ── 4 trụ cột góc dọc ──
    [[-L/2, -W/2], [-L/2, W/2], [L/2, -W/2], [L/2, W/2]].forEach(([x, z]) => {
        addBox(fw, H, fw, frameMat,
            x + (x < 0 ? fw/2 : -fw/2),
            0,
            z + (z < 0 ? fw/2 : -fw/2));
    });

    // ── 4 thanh ngang trên/dưới theo chiều dài ──
    [[-W/2, yBot], [W/2, yBot], [-W/2, yTop], [W/2, yTop]].forEach(([z, y]) => {
        addBox(L - fw*2, fw, fw, frameMat,
            0,
            y + (y < 0 ? fw/2 : -fw/2),
            z + (z < 0 ? fw/2 : -fw/2));
    });

    // ── 4 thanh ngang trên/dưới theo chiều rộng ──
    [[-L/2, yBot], [L/2, yBot], [-L/2, yTop], [L/2, yTop]].forEach(([x, y]) => {
        addBox(fw, fw, W - fw*2, frameMat,
            x + (x < 0 ? fw/2 : -fw/2),
            y + (y < 0 ? fw/2 : -fw/2),
            0);
    });

    // ── 8 khối góc casting ──
    [[-L/2,-W/2], [-L/2,W/2], [L/2,-W/2], [L/2,W/2]].forEach(([x,z]) => {
        [yBot, yTop].forEach(y => {
            const cx = x + (x<0 ? fw/2 : -fw/2);
            const cy = y + (y<0 ? fw/2 : -fw/2);
            const cz = z + (z<0 ? fw/2 : -fw/2);
            addBox(fw+6, fw+6, fw+6, cornerMat, cx, cy, cz);
        });
    });

    // ── Sọc cảnh báo vàng/đen trên xà ngang cửa sau (giống ảnh) ──
    addBox(fw+1, fw*0.7, W - fw*2, hazardMat, L/2 - fw/2, yTop - fw/2, 0);

    // ── Cửa sau 2 cánh mở rộng ~125° ──
    const doorW = (W - fw*2) / 2 - 1;
    const doorH = H - fw*2;

    [-1, 1].forEach(side => {
        const pivotX = L/2 - fw/2;
        const pivotZ = side * (W/2 - fw/2);

        const cg = new THREE.Group();
        cg.position.set(pivotX, 0, pivotZ);

        // Cửa trong local: nằm dọc trục Z, tâm cách bản lề doorW/2
        const localCZ = -side * (doorW/2 + 1);

        // Tấm cửa chính (corrugated xanh)
        const panel = new THREE.Mesh(new THREE.BoxGeometry(3.5, doorH, doorW), doorPanelMat);
        panel.position.set(0, 0, localCZ);
        cg.add(panel);

        // 4 panel ngang nổi (giống ảnh: cửa chia 4 ô)
        for (const dyf of [-0.36, -0.12, 0.12, 0.36]) {
            const rib = new THREE.Mesh(new THREE.BoxGeometry(5, doorH*0.16, doorW - 6), doorRibMat);
            rib.position.set(side*2, dyf * doorH, localCZ);
            cg.add(rib);
        }

        // 2 thanh khóa dọc
        for (const zf of [0.28, 0.62]) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, doorH * 0.82, 8), lockbarMat);
            bar.position.set(3, 0, localCZ - side * doorW * (zf - 0.5));
            cg.add(bar);
            // tay nắm
            const h = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 4), lockbarMat);
            h.position.set(5, -doorH*0.04, localCZ - side * doorW * (zf - 0.5));
            cg.add(h);
        }

        // 4 bản lề tại pivot
        for (const dy of [-doorH*0.38, -doorH*0.13, doorH*0.13, doorH*0.38]) {
            const h1 = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 7), hingeMat);
            h1.position.set(-2, dy, 0);
            cg.add(h1);
        }

        // Mở ~125° ra ngoài
        const openAngle = -side * Math.PI * 0.7;
        cg.rotation.y = openAngle;
        containerGroup.add(cg);
        containerDoors.push({ group: cg, open: openAngle });
    });
    applyDoorState(); // giữ trạng thái cửa (đóng nếu đã lên đủ)

    // ── Đèn nội thất nhẹ ──
    const intLight = new THREE.PointLight(0xfff5e0, 0.35, L);
    intLight.position.set(0, yTop - 15, 0);
    containerGroup.add(intLight);

    containerGroup.position.y = H / 2;
    scene.add(containerGroup);
}

// ==================== BOX FACE TEXTURE ====================

// Tính luminance để chọn màu chữ tương phản
function contrastColor() {
    return '#111111';
}

// Tách tên thành tối đa 2 dòng (ưu tiên cắt tại _ - khoảng trắng gần giữa, không thì cắt đôi)
function wrapTwoLines(name) {
    name = String(name || '');
    if (name.length <= 9) return [name];
    const mid = Math.floor(name.length / 2);
    const seps = ['_', '-', ' '];
    let best = -1, bestDist = 1e9;
    for (let i = 1; i < name.length - 1; i++) {
        if (seps.includes(name[i])) {
            const d = Math.abs(i - mid);
            if (d < bestDist) { bestDist = d; best = i; }
        }
    }
    if (best > 0 && bestDist <= name.length * 0.35)
        return [name.slice(0, best + 1), name.slice(best + 1)];
    return [name.slice(0, mid), name.slice(mid)]; // cắt đôi cho cân
}

function drawFaceCanvas(item, isTop) {
    const S   = 320;
    const cvs = document.createElement('canvas');
    cvs.width = S; cvs.height = S;
    const ctx = cvs.getContext('2d');

    // Parse màu gốc — làm đậm hơn 15% để tránh nhạt khi render
    const saturated = boostColor(item.color);
    const textColor = contrastColor(item.color);

    // Nền màu solid đậm (boost saturation)
    ctx.fillStyle = saturated;
    ctx.fillRect(0, 0, S, S);

    // Highlight nhẹ phía trên để có chiều sâu
    const grad = ctx.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0,   'rgba(255,255,255,0.18)');
    grad.addColorStop(0.45,'rgba(255,255,255,0.04)');
    grad.addColorStop(1,   'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // Viền đen đậm ngoài (phân biệt pallet cạnh nhau)
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, S-12, S-12);

    // Tên item — chữ TO, ĐEN, tự xuống tối đa 2 dòng cho dễ nhìn
    const lines   = wrapTwoLines(item.name);
    const pad     = 26;
    const maxW    = S - pad * 2;
    const lineGap = 1.12;
    const dimH    = isTop ? 42 : 0; // chừa chỗ cho dòng kích thước ở mặt trên
    let fontSize  = 132; // bắt đầu thật to rồi thu cho vừa
    const fits = () => {
        ctx.font = `bold ${fontSize}px Arial,sans-serif`;
        const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
        const totalH = lines.length * fontSize * lineGap + dimH;
        return widest <= maxW && totalH <= S - pad * 2;
    };
    while (!fits() && fontSize > 18) fontSize -= 2;
    ctx.font = `bold ${fontSize}px Arial,sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const lh       = fontSize * lineGap;
    const blockH   = lines.length * lh;
    const centerY  = isTop ? S/2 - dimH/2 : S/2;
    const firstY   = centerY - (blockH - lh) / 2;

    ctx.fillStyle = '#000000'; // chữ đen đậm
    lines.forEach((ln, i) => ctx.fillText(ln, S/2, firstY + i * lh));

    if (isTop) {
        // Mặt trên: kích thước D×R bên dưới tên
        const dimText = `${item.length}×${item.width} cm`;
        ctx.font      = `bold 24px Arial,sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.fillText(dimText, S/2, firstY + blockH + 6);
    }

    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace !== undefined ? THREE.SRGBColorSpace : '';
    return tex;
}

// Chuyển bất kỳ CSS color nào → [r,g,b] an toàn
const _colorCanvas = document.createElement('canvas');
_colorCanvas.width = _colorCanvas.height = 1;
const _colorCtx = _colorCanvas.getContext('2d');
function parseRGB(color) {
    _colorCtx.clearRect(0, 0, 1, 1);
    _colorCtx.fillStyle = color || '#888888';
    _colorCtx.fillRect(0, 0, 1, 1);
    const d = _colorCtx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
}
function toHex6(r, g, b) {
    return '#' + [r,g,b].map(v => Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0')).join('');
}
function lightenHex(color, amt) {
    const [r,g,b] = parseRGB(color); return toHex6(r+amt, g+amt, b+amt);
}
function darkenHex(color, amt) {
    const [r,g,b] = parseRGB(color); return toHex6(r-amt, g-amt, b-amt);
}
// Tăng saturation qua HSL để màu rực hơn
function boostColor(color) {
    const [r,g,b] = parseRGB(color);
    const rn=r/255, gn=g/255, bn=b/255;
    const max=Math.max(rn,gn,bn), min=Math.min(rn,gn,bn);
    let h,s,l=(max+min)/2;
    if(max===min){h=s=0;}else{
        const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
        h=max===rn?(gn-bn)/d+(gn<bn?6:0):max===gn?(bn-rn)/d+2:(rn-gn)/d+4;
        h/=6;
    }
    s=Math.min(1,s*1.4); l=Math.min(0.55,Math.max(0.35,l));
    const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
    const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    return toHex6(Math.round(hue2rgb(p,q,h+1/3)*255),Math.round(hue2rgb(p,q,h)*255),Math.round(hue2rgb(p,q,h-1/3)*255));
}

function createBoxMaterials(item) {
    const sideTex = drawFaceCanvas(item, false);
    const topTex  = drawFaceCanvas(item, true);

    // MeshBasicMaterial: không bị ánh sáng làm nhạt màu — màu hiện đúng như canvas
    const mkMat = tex => new THREE.MeshBasicMaterial({ map: tex });

    // BoxGeometry face order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
    return [mkMat(sideTex), mkMat(sideTex), mkMat(topTex), mkMat(sideTex), mkMat(sideTex), mkMat(sideTex)];
}

// ── Tạo material gỗ chèn với vân gỗ đơn giản ──
const woodMatCache = {};
function getWoodMaterial(L, H, W) {
    const key = `${Math.round(L)}_${Math.round(H)}_${Math.round(W)}`;
    if (woodMatCache[key]) return woodMatCache[key];

    function drawWood(cw, ch, isEnd) {
        const cvs = document.createElement('canvas');
        cvs.width = cw; cvs.height = ch;
        const ctx = cvs.getContext('2d');
        // Nền gỗ
        ctx.fillStyle = '#A0723A';
        ctx.fillRect(0, 0, cw, ch);
        if (isEnd) {
            // Vòng gỗ (end grain)
            ctx.strokeStyle = 'rgba(80,45,10,0.35)';
            ctx.lineWidth = 1;
            for (let r = 4; r < Math.min(cw, ch) / 2; r += 5) {
                ctx.beginPath();
                ctx.ellipse(cw/2, ch/2, r, r*0.6, 0, 0, Math.PI*2);
                ctx.stroke();
            }
        } else {
            // Vân gỗ dọc
            ctx.strokeStyle = 'rgba(80,45,10,0.25)';
            ctx.lineWidth = 1;
            for (let x = 0; x < cw; x += 8 + Math.random()*6) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + (Math.random()-0.5)*4, ch);
                ctx.stroke();
            }
        }
        const tex = new THREE.CanvasTexture(cvs);
        return tex;
    }

    const SCALE = 4;
    const sideTex = drawWood(Math.max(8, Math.round(L/SCALE)), Math.max(8, Math.round(H/SCALE)), false);
    const endTex  = drawWood(Math.max(8, Math.round(W/SCALE)), Math.max(8, Math.round(H/SCALE)), true);
    const topTex  = drawWood(Math.max(8, Math.round(L/SCALE)), Math.max(8, Math.round(W/SCALE)), false);
    const mk = t => new THREE.MeshBasicMaterial({ map: t });
    // +X, -X, +Y(top), -Y, +Z, -Z
    const mats = [mk(endTex), mk(endTex), mk(topTex), mk(topTex), mk(sideTex), mk(sideTex)];
    woodMatCache[key] = mats;
    return mats;
}

// ==================== RENDER CARGO ====================
let cargoGroup = null;
const matCache = {}; // cache materials theo item name+color

function renderCargo(plan) {
    if (cargoGroup) { scene.remove(cargoGroup); cargoGroup = null; }
    // Xóa cache khi render mới để tránh dùng material cũ
    Object.keys(matCache).forEach(k => delete matCache[k]);
    if (!plan || !plan.packedItems || plan.packedItems.length === 0) return;

    cargoGroup = new THREE.Group();

    const C = plan.container;
    const offX = -C.length / 2, offY = 0, offZ = -C.width / 2;

    plan.packedItems.forEach((pi, _palletIdx) => {
        const item = pi.item;
        const rotated = (pi.rotationY === 90 || pi.rotationY === 270);
        const L = rotated ? item.width  : item.length;
        const W = rotated ? item.length : item.width;
        const H = item.height;
        // Thu nhỏ hình hiển thị ~0.8cm để các hộp kề nhau không trùng mặt phẳng → hết chớp (z-fighting)
        const GAP = 0.8;
        const geo = new THREE.BoxGeometry(Math.max(L - GAP, 1), Math.max(H - GAP, 1), Math.max(W - GAP, 1));

        let materials;
        if (item.isWood) {
            // Render gỗ chèn: texture vân gỗ đơn giản
            materials = getWoodMaterial(L, H, W);
        } else {
            const cacheKey = item.name + item.color;
            if (!matCache[cacheKey]) matCache[cacheKey] = createBoxMaterials(item);
            materials = matCache[cacheKey];
        }

        const mesh = new THREE.Mesh(geo, materials);
        const cx = offX + pi.x + L/2, cy = offY + pi.y + H/2, cz = offZ + pi.z + W/2;
        mesh.position.set(cx, cy, cz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.pi = pi; // tham chiếu pallet (cho animation băng tải)
        mesh.userData.idx = _palletIdx; // chỉ số trong packedItems (để lưu trạng thái đã lên)

        const edgeColor = item.isWood ? 0x5C3A1E : 0x000000;
        const edgeOpacity = item.isWood ? 0.8 : 0.5;
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity })
        );
        mesh.add(edges);
        cargoGroup.add(mesh);
    });

    // Vị trí đã được căn giữa sẵn trong thuật toán xếp → không dịch thêm
    cargoGroup.position.set(0, 0, 0);

    scene.add(cargoGroup);
}

// ==================== RENDER SCENE ====================
function renderScene(plan) {
    if (plan !== undefined) currentPlan = plan;
    const c = CONTAINERS[selectedContainer];
    doorsClosed = false; // plan mới → cửa mở lại
    clearForklift();      // dừng mô phỏng xe nâng cũ
    clearLashing();       // xóa dây néo cũ
    buildContainer(c.length, c.width, c.height);
    renderCargo(currentPlan);
    updateStats(currentPlan);
    fitCameraToContainer(c);
}

function fitCameraToContainer(c) {
    // Tâm container ở giữa chiều cao
    targetCenterY = c.height / 2;
    // Zoom tự động để thấy toàn bộ container
    const maxDim = Math.max(c.length, c.width, c.height);
    zoom = maxDim / 1200;
    panX = 0; panY = 0;
}

// ==================== XẾP CUỘN BĂNG TẢI (hình trụ NẰM NGANG) ====================
let ROLL_D = 100, ROLL_W = 120; // đường kính cuộn, bề rộng cuộn (chiều dài trục)

// Thân cuộn: cao su ĐEN trơn (hơi bóng)
function _rollSideTex() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#0a0a0a'); g.addColorStop(0.5, '#000000'); g.addColorStop(1, '#0a0a0a');
    c.fillStyle = g; c.fillRect(0, 0, 128, 64);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1);
    return t;
}
// Mặt đầu cuộn: ĐEN, vân lớp xoắn mờ (xám tối) + lỗ tâm
function _rollCapTex() {
    const s = 128; const cv = document.createElement('canvas'); cv.width = cv.height = s;
    const c = cv.getContext('2d');
    c.fillStyle = '#030303'; c.beginPath(); c.arc(s/2, s/2, s/2, 0, Math.PI*2); c.fill();
    c.strokeStyle = 'rgba(90,90,95,0.22)'; c.lineWidth = 1;   // vân lớp xoắn rất mờ
    for (let r = 5; r < s/2; r += 3) { c.beginPath(); c.arc(s/2, s/2, r, 0, Math.PI*2); c.stroke(); }
    c.fillStyle = '#000000'; c.beginPath(); c.arc(s/2, s/2, 9, 0, Math.PI*2); c.fill(); // lỗ tâm
    return new THREE.CanvasTexture(cv);
}

function loadRolls() {
    const c = CONTAINERS[selectedContainer];
    if (!c) { alert('Chưa chọn container!'); return; }
    const D = ROLL_D, W = ROLL_W, r = D / 2;

    // Cuộn NẰM, trục dọc theo chiều dài (X): X=bề rộng cuộn, Z=đường kính, Y=đường kính
    const nx = Math.floor(c.length / W);   // số cuộn nối tiếp theo chiều dài
    const nz = Math.floor(c.width  / D);   // số cuộn cạnh nhau theo chiều rộng
    const ny = Math.floor(c.height / D);   // số tầng chồng lên
    if (nx < 1 || nz < 1 || ny < 1) { alert('Cuộn lớn hơn container!'); return; }

    const startX = -c.length / 2 + W / 2 + 2;                       // dồn sát trước
    const startZ = -c.width  / 2 + (c.width - nz * D) / 2 + D / 2;  // căn giữa trái/phải

    doorsClosed = false;
    currentPlan = null;
    buildContainer(c.length, c.width, c.height);
    if (cargoGroup) { scene.remove(cargoGroup); }
    cargoGroup = new THREE.Group();

    const sideMat = new THREE.MeshStandardMaterial({ map: _rollSideTex(), roughness: 0.55, metalness: 0.15 });
    const capMat  = new THREE.MeshStandardMaterial({ map: _rollCapTex(),  roughness: 0.75, metalness: 0.1 });
    const mats = [sideMat, capMat, capMat]; // trụ: [thân, 2 mặt đầu]
    const geo  = new THREE.CylinderGeometry(r, r, W - 1, 32);

    let count = 0;
    for (let iy = 0; iy < ny; iy++) {
        const y = iy * D + D / 2;          // tâm cuộn theo chiều cao (nằm trên sàn / cuộn dưới)
        for (let ix = 0; ix < nx; ix++) {
            for (let iz = 0; iz < nz; iz++) {
                const m = new THREE.Mesh(geo, mats);
                m.position.set(startX + ix * W, y, startZ + iz * D);
                m.rotation.z = Math.PI / 2;  // trục trụ nằm ngang theo X
                m.castShadow = true; m.receiveShadow = true;
                cargoGroup.add(m);
                count++;
            }
        }
    }
    cargoGroup.position.set(0, 0, 0);
    scene.add(cargoGroup);
    fitCameraToContainer(c);
    showToast(`🛢️ Đã xếp ${count} cuộn nằm (${nx}×${nz} × ${ny} tầng) · ĐK ${D} rộng ${W} cm`, true);
}

// Nút "Xếp cuộn" (inject vào viewer)
(function() {
    const host = document.querySelector('.viewer-container');
    if (!host) return;
    const b = document.createElement('button');
    b.id = 'roll-btn';
    b.title = 'Xếp cuộn (hình trụ đứng) vào container';
    b.innerHTML = '🛢️';
    b.style.cssText = `position:absolute;bottom:70px;right:16px;width:46px;height:46px;
        background:rgba(15,17,23,0.85);border:1.5px solid #4a5568;border-radius:10px;
        color:#e2e8f0;cursor:pointer;font-size:22px;z-index:45;backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.5);`;
    b.onclick = loadRolls;
    host.appendChild(b);
})();

// ==================== DÂY NÉO CHÉO (lashing) ở đầu hở ====================
let lashingGroup = null;
let lashDoorGroup = null;  // nhóm dây néo PHÍA CỬA (nơi xe nâng vào) — ẩn khi mô phỏng
const LASH_GAP = 6; // cm: dây cách mặt hàng

function clearLashing() {
    if (lashingGroup) { scene.remove(lashingGroup); lashingGroup = null; }
    lashDoorGroup = null;
}

function _strap(a, b, mat) { // thanh dây nối 2 điểm a→b
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, 3, 7), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
    m.castShadow = true;
    return m;
}

function addLashing() {
    if (!cargoGroup || !currentPlan || !(currentPlan.packedItems || []).length) {
        alert('Chưa có hàng để néo!'); return;
    }
    clearLashing();
    const C = currentPlan.container;
    const bbox = new THREE.Box3().setFromObject(cargoGroup);
    if (!isFinite(bbox.min.x)) return;

    lashingGroup = new THREE.Group();
    const strapMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7, metalness: 0.1 });
    const ringMat  = new THREE.MeshStandardMaterial({ color: 0xc2cad2, roughness: 0.4, metalness: 0.85 });

    const wallZ = C.width / 2 - 4;          // điểm neo sát vách container
    const yBot  = 8;                        // gần sàn
    const yTop  = Math.max(bbox.max.y - 6, yBot + 30); // gần đỉnh khối hàng

    // 2 nhóm riêng: đầu CỬA (xe nâng vào) và đầu TRƯỚC
    lashDoorGroup = new THREE.Group();
    const frontG = new THREE.Group();
    lashingGroup.add(lashDoorGroup); lashingGroup.add(frontG);

    // Néo chữ X tại 1 mặt phẳng X (đầu hở)
    function lashFace(xPlane, g) {
        const bl = new THREE.Vector3(xPlane, yBot, -wallZ);
        const tr = new THREE.Vector3(xPlane, yTop,  wallZ);
        const tl = new THREE.Vector3(xPlane, yTop, -wallZ);
        const br = new THREE.Vector3(xPlane, yBot,  wallZ);
        g.add(_strap(bl, tr, strapMat)); // chéo /
        g.add(_strap(tl, br, strapMat)); // chéo \
        [bl, tr, tl, br].forEach(p => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(5, 1.6, 8, 16), ringMat);
            ring.position.copy(p); ring.rotation.y = Math.PI / 2;
            g.add(ring);
        });
    }

    lashFace(bbox.max.x + LASH_GAP, lashDoorGroup);  // đầu phía CỬA (xe vào)
    lashFace(bbox.min.x - LASH_GAP, frontG);         // đầu phía TRƯỚC

    // ── Nhãn + vạch đo khoảng cách từ hàng tới 2 đầu container ──
    const dimMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.5, emissive: 0x6b5300, emissiveIntensity: 0.4 });
    const yMid = Math.min(yTop * 0.55, 90);
    function dimAt(x0, x1, g) {
        const dist = Math.round(Math.abs(x1 - x0));
        const a = new THREE.Vector3(x0, 6, 0), b = new THREE.Vector3(x1, 6, 0);
        g.add(_strap(a, b, dimMat));
        g.add(_label(`${dist} cm`, new THREE.Vector3((x0 + x1) / 2, yMid, 0)));
    }
    dimAt(bbox.max.x,  C.length / 2, lashDoorGroup);  // hàng → đầu cửa
    dimAt(bbox.min.x, -C.length / 2, frontG);         // hàng → đầu trước
    scene.add(lashingGroup);

    const gapDoor = Math.round(C.length / 2 - bbox.max.x);
    showToast(`🪢 Đã néo 2 dây chéo · khoảng cách tới đầu container hiển thị bằng nhãn (đầu cửa ~${gapDoor}cm)`, true);
}

// Nhãn chữ nổi trong 3D (sprite luôn quay về camera)
function _label(text, pos) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 72;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(15,17,23,0.9)';
    c.strokeStyle = '#ffd24a'; c.lineWidth = 3;
    const r = 12, w = 256, h = 72;
    c.beginPath();
    c.moveTo(r, 2); c.arcTo(w-2, 2, w-2, h-2, r); c.arcTo(w-2, h-2, 2, h-2, r);
    c.arcTo(2, h-2, 2, 2, r); c.arcTo(2, 2, w-2, 2, r); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#ffd24a'; c.font = 'bold 40px Arial,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w/2, h/2);
    const tex = new THREE.CanvasTexture(cv);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.position.copy(pos); sp.scale.set(120, 34, 1);
    return sp;
}

// Nút "Dây néo" (inject vào viewer)
(function() {
    const host = document.querySelector('.viewer-container');
    if (!host) return;
    const b = document.createElement('button');
    b.id = 'lashing-btn';
    b.title = 'Néo 2 dây chéo giữ hàng ở đầu hở';
    b.innerHTML = '🪢';
    b.style.cssText = `position:absolute;bottom:124px;right:16px;width:46px;height:46px;
        background:rgba(15,17,23,0.85);border:1.5px solid #4a5568;border-radius:10px;
        color:#e2e8f0;cursor:pointer;font-size:22px;z-index:45;backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,0,0,0.5);`;
    b.onclick = addLashing;
    host.appendChild(b);
})();

// ==================== MÔ PHỎNG XE NÂNG ====================
function buildForklift() {
    if (forkliftGroup) { scene.remove(forkliftGroup); forkliftGroup = null; }
    forkliftGroup = new THREE.Group();
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf2b200, roughness: 0.45, metalness: 0.45 });
    const yelDk  = new THREE.MeshStandardMaterial({ color: 0xcf9700, roughness: 0.5,  metalness: 0.4  });
    const dark   = new THREE.MeshStandardMaterial({ color: 0x26262b, roughness: 0.55, metalness: 0.6  });
    const steel  = new THREE.MeshStandardMaterial({ color: 0x6b7079, roughness: 0.4,  metalness: 0.8  });
    const tire   = new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.95 });
    const rim    = new THREE.MeshStandardMaterial({ color: 0xb8bdc4, roughness: 0.4,  metalness: 0.85 });
    const fork   = new THREE.MeshStandardMaterial({ color: 0xc2c8d0, roughness: 0.35, metalness: 0.85 });
    const glass  = new THREE.MeshStandardMaterial({ color: 0x223 , roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.5 });
    const beacon = new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xff6a00, emissiveIntensity: 0.8, roughness: 0.4 });
    const lightM = new THREE.MeshStandardMaterial({ color: 0xfff3c0, emissive: 0xffd24a, emissiveIntensity: 0.6 });

    const add = (mat, w, h, d, x, y, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
        forkliftGroup.add(m); return m;
    };
    const cyl = (mat, r, h, x, y, z, axis) => {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), mat);
        if (axis === 'z') m.rotation.x = Math.PI / 2;
        if (axis === 'x') m.rotation.z = Math.PI / 2;
        m.position.set(x, y, z); m.castShadow = true;
        forkliftGroup.add(m); return m;
    };

    // ── Bánh xe (lốp + vành) — trục theo Z ──
    const wheel = (x, z, R) => {
        cyl(tire, R, 18, x, R, z, 'z');
        cyl(rim,  R * 0.5, 19, x, R, z, 'z');
    };
    wheel(-28, -44, 26); wheel(-28, 44, 26);   // bánh lái trước (to)
    wheel(72, -42, 22);  wheel(72, 42, 22);    // bánh sau

    // ── Thân + gầm ──
    add(dark,   130, 16, 92, 22, 16, 0);       // gầm
    add(yellow, 118, 44, 88, 24, 50, 0);       // thân chính
    add(yelDk,  120, 10, 90, 24, 73, 0);       // gờ trên thân
    // Đối trọng sau (bo)
    add(dark,   30, 60, 88, 82, 50, 0);
    add(yelDk,  10, 60, 88, 66, 50, 0);

    // ── Khoang lái: mui, ghế, vô lăng ──
    add(yelDk, 46, 14, 74, 34, 86, 0);                 // sàn ca-bin
    add(dark,  34, 14, 48, 52, 96, 0);                 // đệm ghế
    add(dark,  10, 36, 48, 70, 114, 0);                // tựa ghế
    cyl(steel, 3, 34, 30, 104, 0, 'x');                // trục vô lăng (nghiêng) — gần
    const sw = new THREE.Mesh(new THREE.TorusGeometry(11, 2.4, 8, 20), dark);
    sw.position.set(16, 120, 0); sw.rotation.y = Math.PI / 2; forkliftGroup.add(sw); // vô lăng

    // ── Khung bảo vệ (ROPS) ──
    [[-6,-40],[-6,40],[74,-40],[74,40]].forEach(([x,z]) => add(steel, 7, 150, 7, x, 162, z));
    add(steel, 96, 7, 94, 34, 238, 0);                 // mui che trên
    // vài thanh ngang lưới mui
    [-30, 0, 30].forEach(z => add(steel, 96, 4, 4, 34, 238, z));
    // Đèn xoay cảnh báo
    cyl(beacon, 7, 12, 34, 248, 0);

    // ── Đèn pha trước + ống xả ──
    [-30, 30].forEach(z => add(lightM, 6, 12, 14, -36, 40, z));
    cyl(steel, 4, 36, 70, 96, 30, 0);                  // ống xả đứng

    // ── Cột nâng (mast): 2 ray + thanh ngang + xi-lanh thủy lực ──
    add(steel, 12, 230, 12, -36, 118, -30);
    add(steel, 12, 230, 12, -36, 118,  30);
    [40, 120, 200].forEach(y => add(steel, 12, 8, 64, -36, y, 0)); // thanh ngang
    cyl(steel, 5, 220, -36, 115, 0);                   // xi-lanh giữa

    // ── Càng nâng (carriage) — di chuyển theo Y ──
    forkCarriage = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(10, 56, 72), dark);
    plate.position.set(-42, 6, 0); forkCarriage.add(plate);
    // Lưới chắn sau càng (load backrest) — chống hàng đổ về sau
    const br = new THREE.Mesh(new THREE.BoxGeometry(6, 60, 76), dark);
    br.position.set(-40, 42, 0); forkCarriage.add(br);
    for (let z = -30; z <= 30; z += 15) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 60, 5), steel);
        bar.position.set(-37, 42, z); forkCarriage.add(bar);
    }
    [22, 58].forEach(y => { const h = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 76), steel); h.position.set(-37, y, 0); forkCarriage.add(h); });
    [-20, 20].forEach(z => {
        // càng hình L: phần đứng + phần nằm (càng dài để đỡ pallet)
        const up = new THREE.Mesh(new THREE.BoxGeometry(8, 40, 14), fork);
        up.position.set(-42, -8, z); forkCarriage.add(up);
        const fl = new THREE.Mesh(new THREE.BoxGeometry(290, 8, 14), fork);
        fl.position.set(-187, -19, z); fl.castShadow = true; forkCarriage.add(fl);
    });
    forkCarriage.position.y = 24;
    forkliftGroup.add(forkCarriage);

    // Thu hẹp bề ngang để xe lọt trong 1 làn pallet (không đè sang pallet bên cạnh)
    forkliftGroup.scale.set(1, 1, 0.6);

    // ── Chắn bùn bánh trước ──
    [-44, 44].forEach(z => add(yelDk, 64, 6, 32, -26, 50, z));

    // ── Xi-lanh nghiêng (mast → thân) ──
    [-24, 24].forEach(z => {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 46, 10), steel);
        c.position.set(-16, 44, z); c.rotation.z = Math.PI / 2.5; c.castShadow = true;
        forkliftGroup.add(c);
    });

    // ── Gương chiếu hậu ──
    add(dark, 4, 12, 4, 70, 150, -44);
    add(steel, 10, 8, 3, 64, 157, -47);

    // ── Người lái: thân + đầu + mũ bảo hộ + tay ──
    const skin  = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2f7fc4, roughness: 0.75 });
    const helmet= new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.45 });
    add(shirt, 22, 32, 36, 50, 112, 0);                 // thân
    const head = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), skin);
    head.position.set(47, 136, 0); head.castShadow = true; forkliftGroup.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(10.5, 16, 10, 0, Math.PI*2, 0, Math.PI/2), helmet);
    cap.position.set(47, 137, 0); forkliftGroup.add(cap);
    // 2 cánh tay với tới vô lăng
    [-12, 12].forEach(z => {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 30, 8), shirt);
        arm.position.set(33, 116, z); arm.rotation.z = Math.PI / 3; forkliftGroup.add(arm);
    });

    forkliftGroup.visible = false;
    scene.add(forkliftGroup);
}

function clearForklift() {
    if (forkliftGroup) { scene.remove(forkliftGroup); forkliftGroup = null; }
    forkCarriage = null; forkliftAnim = null;
}

function playForkliftSim() {
    if (!cargoGroup || !currentPlan || !(currentPlan.packedItems||[]).length) {
        alert('Chưa có pallet! Hãy "Tính theo số lượng" hoặc "Tự động tối ưu" trước.'); return;
    }
    buildForklift();
    const pool = cargoGroup.children.filter(m => m.userData.pi && !m.userData.pi.item?.isWood);
    if (!pool.length) { alert('Không có pallet để mô phỏng!'); return; }

    const dX = m => { const p = m.userData.pi; return (p.rotationY===90||p.rotationY===270)?p.item.width:p.item.length; };
    const wZ = m => { const p = m.userData.pi; return (p.rotationY===90||p.rotationY===270)?p.item.length:p.item.width; };
    // Các pallet ĐỠ ngay bên dưới m (mặt trên trùng đáy m, có chồng X/Z)
    const supportsOf = m => {
        const P = m.userData.pi;
        if (P.y <= 1) return [];
        return pool.filter(q => {
            if (q === m) return false;
            const Q = q.userData.pi;
            if (Math.abs((Q.y + Q.item.height) - P.y) > 2) return false;
            const ox = Math.min(P.x + dX(m), Q.x + dX(q)) - Math.max(P.x, Q.x);
            const oz = Math.min(P.z + wZ(m), Q.z + wZ(q)) - Math.max(P.z, Q.z);
            return ox > 1 && oz > 1;
        });
    };
    const supMap = new Map(pool.map(m => [m, supportsOf(m)]));

    // Sắp xếp tôn trọng PHỤ THUỘC: chỉ xếp khi mọi pallet đỡ bên dưới đã xếp.
    // Trong các pallet sẵn sàng → ưu tiên SÂU nhất (x) → TẦNG DƯỚI (y) → sang ngang (z)
    const placed = new Set();
    const meshes = [];
    while (meshes.length < pool.length) {
        const ready = pool.filter(m => !placed.has(m) && supMap.get(m).every(s => placed.has(s)));
        if (!ready.length) { pool.filter(m => !placed.has(m)).forEach(m => { meshes.push(m); placed.add(m); }); break; }
        ready.sort((a, b) => {
            const A = a.userData.pi, B = b.userData.pi;
            return (A.x - B.x) || (A.y - B.y) || (A.z - B.z);
        });
        meshes.push(ready[0]); placed.add(ready[0]);
    }

    const C = currentPlan.container;
    const doorStartX = C.length / 2 + 260;
    const gx = cargoGroup.position.x, gy = cargoGroup.position.y, gz = cargoGroup.position.z;
    const items = meshes.map(m => {
        const finalLocal = m.position.clone();
        const tw = new THREE.Vector3(finalLocal.x + gx, finalLocal.y + gy, finalLocal.z + gz); // world tâm pallet
        const pi = m.userData.pi;
        const palletH = pi.item.height;
        const depthX = (pi.rotationY === 90 || pi.rotationY === 270) ? pi.item.width : pi.item.length; // độ dài pallet theo trục X
        const widthZ = (pi.rotationY === 90 || pi.rotationY === 270) ? pi.item.length : pi.item.width;
        const upper = pi.y > 1; // pallet tầng trên
        m.visible = false;
        return { mesh: m, finalLocal, tw, palletH, depthX, widthZ, upper, needPush: false };
    });

    // Xác định pallet nào khi đặt sẽ bị THÂN XE chạm pallet đã xếp → mới cần pha "lùi + đẩy"
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.upper) continue;
        const ffx = it.tw.x + (315 - it.depthX / 2);   // vị trí xe khi đặt bình thường
        const bxMin = ffx - 42, bxMax = ffx + 100;     // vùng thân/cột xe (đặc)
        const bzMin = it.tw.z - 30, bzMax = it.tw.z + 30;
        it.needPush = items.slice(0, i).some(p => {
            const pxMin = p.tw.x - p.depthX / 2, pxMax = p.tw.x + p.depthX / 2;
            const pzMin = p.tw.z - p.widthZ / 2, pzMax = p.tw.z + p.widthZ / 2;
            return pxMin < bxMax && pxMax > bxMin && pzMin < bzMax && pzMax > bzMin;
        });
    }
    doorsClosed = false; applyDoorState();
    if (lashDoorGroup) lashDoorGroup.visible = false; // chỉ ẩn dây néo PHÍA CỬA (xe vào)
    forkliftGroup.visible = true;
    forkliftAnim = { items, i: 0, phase: 'in', t0: performance.now(), doorStartX, gx, gy, gz };
}

function updateForklift(now) {
    const A = forkliftAnim;
    if (!A || !forkliftGroup) return;
    if (lashDoorGroup) lashDoorGroup.visible = false; // ép ẩn dây néo phía cửa suốt lúc xếp
    if (A.i >= A.items.length) {
        forkliftGroup.visible = false; forkliftAnim = null;
        if (lashDoorGroup) lashDoorGroup.visible = true; // xếp xong → hiện lại dây néo phía cửa
        showToast('✅ Xe nâng đã xếp xong — đã néo lại dây phía cửa', true);
        if (typeof window._onForkliftDone === 'function') { const cb = window._onForkliftDone; window._onForkliftDone = null; cb(); }
        return;
    }
    const it = A.items[A.i];
    // Pallet luôn nằm ở ĐẦU NGỌN CÀNG: mép sâu của pallet bám đầu càng (≈ -315),
    // nên dù pallet to/nhỏ hay xoay ngang, thân xe vẫn đứng hẳn phía cửa (vùng trống)
    // → càng vươn vào đặt, KHÔNG cần chạy sâu, không xuyên pallet đã đặt.
    const carryX = -(315 - it.depthX / 2);
    const finalForkliftX = it.tw.x - carryX;            // xe khi pallet ở VỊ TRÍ CUỐI
    const carriageY = it.tw.y - it.palletH / 2 + 14.5;  // nâng càng tới tầng pallet
    forkliftGroup.position.z = it.tw.z;

    const PUSH = 75, BACK = 45;                          // đẩy vào / lùi ra cho tầng trên
    const dropForkliftX = finalForkliftX + PUSH;        // xe khi pallet đặt HỜ (lệch ra cửa)
    const dropWorldX = it.tw.x + PUSH;

    const setCarry = () => { // pallet bám càng theo vị trí xe
        const cw = new THREE.Vector3(forkliftGroup.position.x + carryX,
                                     forkCarriage.position.y - 14.5 + it.palletH / 2,
                                     forkliftGroup.position.z);
        it.mesh.visible = true;
        it.mesh.position.set(cw.x - A.gx, cw.y - A.gy, cw.z - A.gz);
    };
    const setMeshX = (worldX) => {
        it.mesh.visible = true;
        it.mesh.position.set(worldX - A.gx, it.finalLocal.y, it.finalLocal.z);
    };

    const DUR = { in: 800, place: 250, back: 350, push: 450, out: 600 };
    const t = now - A.t0;

    // ===== ĐẶT BÌNH THƯỜNG (không vướng): vào → đặt → ra =====
    if (!it.needPush) {
        if (A.phase === 'in') {
            forkCarriage.position.y = carriageY;
            const p = Math.min(1, t / DUR.in), e = 1 - Math.pow(1 - p, 2);
            forkliftGroup.position.x = A.doorStartX + (finalForkliftX - A.doorStartX) * e;
            setCarry();
            if (p >= 1) { A.phase = 'place'; A.t0 = now; }
        } else if (A.phase === 'place') {
            if (t >= DUR.place) { it.mesh.position.copy(it.finalLocal); it.mesh.visible = true; A.phase = 'out'; A.t0 = now; }
        } else if (A.phase === 'out') {
            const p = Math.min(1, t / DUR.out);
            forkCarriage.position.y = 24 + (carriageY - 24) * (1 - p);
            forkliftGroup.position.x = finalForkliftX + (A.doorStartX - finalForkliftX) * p;
            if (p >= 1) { A.i++; A.phase = 'in'; A.t0 = now; }
        }
        return;
    }

    // ===== BỊ VƯỚNG: vào (đặt hờ lệch ra cửa) → lùi → đẩy càng vào cho sát → ra =====
    if (A.phase === 'in') {
        forkCarriage.position.y = carriageY;
        const p = Math.min(1, t / DUR.in), e = 1 - Math.pow(1 - p, 2);
        forkliftGroup.position.x = A.doorStartX + (dropForkliftX - A.doorStartX) * e;
        setCarry(); // pallet tới vị trí HỜ (tw.x + PUSH)
        if (p >= 1) { A.phase = 'drop'; A.t0 = now; }
    } else if (A.phase === 'drop') {
        // hạ càng nhẹ để pallet tựa lên pallet dưới
        forkCarriage.position.y = carriageY - 4;
        setMeshX(dropWorldX);
        if (t >= DUR.place) { A.phase = 'back'; A.t0 = now; }
    } else if (A.phase === 'back') {
        // lùi xe ra để rút càng, pallet nằm yên ở vị trí hờ
        const p = Math.min(1, t / DUR.back);
        forkliftGroup.position.x = dropForkliftX + BACK * p;
        forkCarriage.position.y = carriageY - 4;
        setMeshX(dropWorldX);
        if (p >= 1) { A.phase = 'push'; A.t0 = now; }
    } else if (A.phase === 'push') {
        // tiến lại, đầu càng đẩy pallet từ vị trí hờ vào vị trí cuối cho sát
        const p = Math.min(1, t / DUR.push);
        const fx = (dropForkliftX + BACK) + (finalForkliftX - (dropForkliftX + BACK)) * p;
        forkliftGroup.position.x = fx;
        forkCarriage.position.y = carriageY - 4;
        // pallet chỉ bị đẩy khi đầu càng chạm mặt sau (sau khi đã đóng khe BACK)
        const pushedWorldX = dropWorldX - Math.max(0, (dropForkliftX - fx));
        setMeshX(pushedWorldX);
        if (p >= 1) { it.mesh.position.copy(it.finalLocal); A.phase = 'out'; A.t0 = now; }
    } else if (A.phase === 'out') {
        const p = Math.min(1, t / DUR.out);
        forkCarriage.position.y = 24 + ((carriageY - 4) - 24) * (1 - p);
        forkliftGroup.position.x = finalForkliftX + (A.doorStartX - finalForkliftX) * p;
        if (p >= 1) { A.i++; A.phase = 'in'; A.t0 = now; }
    }
}

function updateStats(plan) {
    const safe = v => (plan ? Math.round(v || 0) : 0);
    const palletCount = plan ? (plan.packedItems || []).filter(p => !p.item?.isWood).length : 0;
    document.getElementById('stat-vol').textContent    = safe(plan && plan.volumeUtilization);
    document.getElementById('stat-wt').textContent     = safe(plan && plan.weightUtilization);
    document.getElementById('stat-items').textContent  = palletCount;
    document.getElementById('stat-weight').textContent = safe(plan && plan.totalWeight);
    document.getElementById('stat-volume').textContent = plan ? ((plan.totalVolume || 0) / 1e6).toFixed(2) : 0;
    document.getElementById('prog-vol').style.width    = Math.min(100, plan ? (plan.volumeUtilization || 0) : 0) + '%';
    document.getElementById('prog-wt').style.width     = Math.min(100, plan ? (plan.weightUtilization  || 0) : 0) + '%';

    // Hiển thị thống kê gỗ chèn
    const woodEl = document.getElementById('wood-stat');
    if (woodEl) {
        if (plan && plan.woodCount > 0) {
            woodEl.style.display = '';
            woodEl.innerHTML = `<i class="fas fa-tree" style="color:#8B5E3C"></i> Gỗ chèn: <b>${plan.woodCount}</b> khối &nbsp;·&nbsp; <b>${Number(plan.woodWeight).toLocaleString('vi-VN',{maximumFractionDigits:1})}</b> kg`;
        } else {
            woodEl.style.display = 'none';
        }
    }

    // Hiện/ẩn nút xếp gỗ: chỉ hiện khi có plan và chưa có gỗ
    const woodBtnWrap = document.getElementById('wood-btn-wrap');
    if (woodBtnWrap) {
        const hasPacked = plan && plan.packedItems && plan.packedItems.filter(p => !p.item?.isWood).length > 0;
        const hasWood   = plan && plan.woodCount > 0;
        woodBtnWrap.style.display = (hasPacked && !hasWood) ? '' : 'none';
    }

    updateLegend(plan);
    updateWeightBalance(plan);
    if (plan) {
        const sp = document.getElementById('stats-panel');
        if (sp) { sp.style.display = ''; if (window.resizeRenderer) window.resizeRenderer(); }
    }
}

function updateWeightBalance(plan) {
    const el = document.getElementById('weight-balance-panel');
    if (!el) return;
    const wb = plan?.weightBalance;
    if (!wb || wb.totalWeight === 0) { el.style.display = 'none'; return; }

    const fmt = v => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 });
    const pct  = v => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%';

    function zoneColor(offsetPct) {
        const a = Math.abs(offsetPct);
        if (a <= 5)  return '#48bb78';
        if (a <= 10) return '#f6ad55';
        return '#fc8181';
    }

    const total    = wb.totalWeight || 1;
    const frontPct = (wb.frontWeight / total * 100);
    const backPct  = (wb.backWeight  / total * 100);
    const leftPct  = (wb.leftWeight  / total * 100);
    const rightPct = (wb.rightWeight / total * 100);
    const xColor   = zoneColor(wb.offsetXPct);
    const zColor   = zoneColor(wb.offsetZPct);
    const balanced = wb.balanced;

    // Tính kg 4 góc xấp xỉ (FL=front∩left, FR=front∩right, BL=back∩left, BR=back∩right)
    const fl = wb.flWeight ?? (wb.frontWeight * wb.leftWeight  / total);
    const fr = wb.frWeight ?? (wb.frontWeight * wb.rightWeight / total);
    const bl = wb.blWeight ?? (wb.backWeight  * wb.leftWeight  / total);
    const br = wb.brWeight ?? (wb.backWeight  * wb.rightWeight / total);

    function quadColor(kg) {
        const r = kg / total;
        if (r <= 0.3) return '#48bb78';
        if (r <= 0.4) return '#f6ad55';
        return '#fc8181';
    }

    function quadBg(kg) {
        const r = kg / total;
        if (r <= 0.30) return 'rgba(72,187,120,0.12)';
        if (r <= 0.40) return 'rgba(246,173,85,0.12)';
        return 'rgba(252,129,129,0.12)';
    }

    el.style.display = '';
    el.innerHTML = `
    <div class="wb-header">
        <span class="wb-title-text"><i class="fas fa-balance-scale"></i> Phân bổ tải trọng</span>
        <span class="wb-badge ${balanced ? 'wb-ok' : 'wb-warn'}">${balanced ? '✓ Cân bằng' : '⚠ Lệch tải'}</span>
        <span class="wb-total-pill">${fmt(wb.totalWeight)} <small>kg tổng</small></span>
    </div>

    <div class="wb-body">
        <!-- Sơ đồ 4 góc + bars dọc -->
        <div class="wb-grid-wrap">
            <div class="wb-grid-hlabel">
                <span>Trái</span><span>Phải</span>
            </div>
            <div class="wb-grid">
                <div class="wb-vlabel"><span>Trước</span><span>Sau</span></div>
                <div class="wb-cells">
                    <div class="wb-cell" style="background:${quadBg(fl)};border-color:${quadColor(fl)}">
                        <span class="wbc-kg">${fmt(fl)}</span>
                        <span class="wbc-unit">kg</span>
                        <span class="wbc-pct">${(fl/total*100).toFixed(1)}%</span>
                    </div>
                    <div class="wb-cell" style="background:${quadBg(fr)};border-color:${quadColor(fr)}">
                        <span class="wbc-kg">${fmt(fr)}</span>
                        <span class="wbc-unit">kg</span>
                        <span class="wbc-pct">${(fr/total*100).toFixed(1)}%</span>
                    </div>
                    <div class="wb-cell" style="background:${quadBg(bl)};border-color:${quadColor(bl)}">
                        <span class="wbc-kg">${fmt(bl)}</span>
                        <span class="wbc-unit">kg</span>
                        <span class="wbc-pct">${(bl/total*100).toFixed(1)}%</span>
                    </div>
                    <div class="wb-cell" style="background:${quadBg(br)};border-color:${quadColor(br)}">
                        <span class="wbc-kg">${fmt(br)}</span>
                        <span class="wbc-unit">kg</span>
                        <span class="wbc-pct">${(br/total*100).toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bars -->
        <div class="wb-bars">
            <div class="wb-row-label">Trước / Sau</div>
            <div class="wb-split-bar">
                <div class="wb-split-val">
                    <b>${fmt(wb.frontWeight)}</b><small>kg</small>
                    <em>${frontPct.toFixed(1)}%</em>
                </div>
                <div class="wb-split-track">
                    <div class="wb-split-left"  style="width:${frontPct.toFixed(1)}%;background:${xColor}"></div>
                    <div class="wb-split-right" style="width:${backPct.toFixed(1)}%;background:${xColor}88"></div>
                </div>
                <div class="wb-split-val wb-split-val-r">
                    <b>${fmt(wb.backWeight)}</b><small>kg</small>
                    <em>${backPct.toFixed(1)}%</em>
                </div>
            </div>
            <div class="wb-deviate" style="color:${xColor}">Lệch ${pct(wb.offsetXPct)}</div>

            <div class="wb-row-label" style="margin-top:8px">Trái / Phải</div>
            <div class="wb-split-bar">
                <div class="wb-split-val">
                    <b>${fmt(wb.leftWeight)}</b><small>kg</small>
                    <em>${leftPct.toFixed(1)}%</em>
                </div>
                <div class="wb-split-track">
                    <div class="wb-split-left"  style="width:${leftPct.toFixed(1)}%;background:${zColor}"></div>
                    <div class="wb-split-right" style="width:${rightPct.toFixed(1)}%;background:${zColor}88"></div>
                </div>
                <div class="wb-split-val wb-split-val-r">
                    <b>${fmt(wb.rightWeight)}</b><small>kg</small>
                    <em>${rightPct.toFixed(1)}%</em>
                </div>
            </div>
            <div class="wb-deviate" style="color:${zColor}">Lệch ${pct(wb.offsetZPct)}</div>
        </div>
    </div>`;
}

function updateLegend(plan) {
    const el = document.getElementById('legend');
    if (!plan || !plan.packedItems || !plan.packedItems.length) {
        el.innerHTML = '<div class="stats-empty-state"><i class="fas fa-calculator"></i><p>Bấm <strong>Tính toán</strong> để xem kết quả</p></div>';
        return;
    }
    const seen = {};
    plan.packedItems.forEach(pi => { seen[pi.item.name] = pi.item.color; });
    el.innerHTML = Object.entries(seen).map(([name, color]) =>
        `<div style="display:flex;align-items:center;gap:6px;font-size:11px;">
            <div style="width:10px;height:10px;border-radius:2px;background:${color};flex-shrink:0;"></div>
            <span>${name}</span>
        </div>`
    ).join('');
}

// ==================== CAMERA HELPERS ====================
function resetCamera() {
    rotX = 0.42; rotY = -0.55; panX = 0; panY = 0;
    currentView = 'perspective';
    const c = CONTAINERS[selectedContainer];
    fitCameraToContainer(c);
    document.querySelectorAll('.view-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
}

function setView(view) {
    document.querySelectorAll('.view-btn').forEach(b => {
        if (b.id === 'btn-rotate') return; // nút Auto Rotate có trạng thái riêng
        b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(`'${view}'`));
    });
    const c = CONTAINERS[selectedContainer];
    panX = 0; panY = 0;
    currentView = 'perspective'; // luôn dùng perspective orbit

    if (view === 'perspective') {
        rotX = 0.42; rotY = -0.55;
        fitCameraToContainer(c);
    } else if (view === 'top') {
        // Nhìn thẳng từ trên xuống
        rotX = Math.PI / 2 - 0.05;
        rotY = 0;
        fitCameraToContainer(c);
    } else if (view === 'front') {
        // Nhìn từ đầu container (trục X)
        rotX = 0.08;
        rotY = Math.PI / 2;
        fitCameraToContainer(c);
    } else if (view === 'side') {
        // Nhìn từ cạnh container (trục Z)
        rotX = 0.08;
        rotY = 0;
        fitCameraToContainer(c);
    }
}

function zoomIn()  { zoom = Math.max(0.1, zoom * 0.8); }
function zoomOut() { zoom = Math.min(20,  zoom * 1.2); }

function toggleWireframe() {
    wireframeMode = !wireframeMode;
    if (cargoGroup) cargoGroup.traverse(o => {
        if (o.isMesh && o.material && !o.material.isLineBasicMaterial) o.material.wireframe = wireframeMode;
    });
}

function toggleLabels() {
    showLabels = !showLabels;
    // Tên hiện trực tiếp trên mặt hộp — toggle ẩn/hiện toàn bộ cargo
    if (cargoGroup) cargoGroup.visible = showLabels;
}

function toggleAutoRotate() {
    autoRotate = !autoRotate;
    autoRotateAngle = rotY;
    document.getElementById('btn-rotate').classList.toggle('active', autoRotate);
}

function handleCanvasClick(e) {
    if (!cargoGroup || !currentPlan) return;
    const rect = canvas.getBoundingClientRect();
    mouse2d.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse2d.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse2d, camera);
    const hits = raycaster.intersectObjects(cargoGroup.children, false);
    if (hits.length > 0) {
        const pi = findPiByMesh(hits[0].object);
        if (pi && !pi.item?.isWood) { toggleLoaded(hits[0].object, pi); return; }
    }
}

// Kích thước theo hướng xoay
function _depthOf(p) { return (p.rotationY === 90 || p.rotationY === 270) ? p.item.width  : p.item.length; }
function _widthOf(p) { return (p.rotationY === 90 || p.rotationY === 270) ? p.item.length : p.item.width;  }

// Có được phép lên pallet này chưa? (từ trong ra ngoài + tầng dưới trước)
// Cửa ở +X → "trong" = X nhỏ. Pallet sâu hơn (X nhỏ hơn, cùng làn) và pallet đỡ bên dưới phải lên trước.
function canLoad(pi) {
    const T = 1;
    for (const q of currentPlan.packedItems) {
        if (q === pi || q.item?.isWood || q.loaded) continue;
        const qd = _depthOf(q), qw = _widthOf(q);
        const pd = _depthOf(pi), pw = _widthOf(pi);
        // chồng theo Z (cùng làn trái/phải)
        const zOv = q.z < pi.z + pw - T && q.z + qw > pi.z + T;
        // chồng theo Y (cùng tầng cao)
        const yOv = q.y < pi.y + pi.item.height - T && q.y + q.item.height > pi.y + T;
        // q nằm SÂU hơn pi (phía trong) cùng làn & cùng tầng → phải lên trước
        const deeper = (q.x + qd <= pi.x + T) && zOv && yOv;
        // q đỡ ngay BÊN DƯỚI pi → phải lên trước (xếp tầng dưới trước)
        const xOv = q.x < pi.x + pd - T && q.x + qd > pi.x + T;
        const below = Math.abs(q.y + q.item.height - pi.y) < T && xOv && zOv;
        if (deeper || below) return false;
    }
    return true;
}

// Tô màu pallet theo trạng thái đã lên (xanh) hay chưa
function _paintLoaded(mesh, loaded) {
    if (loaded) {
        if (!mesh.userData.origMats) mesh.userData.origMats = mesh.material;
        const mats = Array.isArray(mesh.userData.origMats) ? mesh.userData.origMats : [mesh.userData.origMats];
        mesh.material = mats.map(m => { const c = m.clone(); c.color = new THREE.Color(0x3fbf57); return c; });
    } else if (mesh.userData.origMats) {
        mesh.material = mesh.userData.origMats;
    }
}

// Lưu trạng thái 1 pallet lên server (chống rớt mạng)
async function _persistPallet(mesh, pi) {
    if (!window._execPlan) return;
    try {
        await fetch('/Plans/SetPalletLoaded', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ id: window._execPlan.planId, ci: window._execPlan.containerIdx, idx: mesh.userData.idx, loaded: pi.loaded })
        });
    } catch (e) { /* nếu rớt mạng, vẫn giữ trạng thái local; bấm lại sẽ lưu */ }
}

// Khôi phục các pallet đã lên (từ DB) khi mở lại container
function applyLoadedFromServer(indices) {
    if (!cargoGroup || !indices) return;
    const set = new Set(indices);
    cargoGroup.children.forEach(m => {
        if (m.userData && m.userData.pi && set.has(m.userData.idx)) {
            m.userData.pi.loaded = true;
            _paintLoaded(m, true);
        }
    });
    updateLoadedStatus();
}

// Bấm pallet → hỏi xác nhận → đánh dấu "đã lên container" (xanh) + LƯU DB. Đủ hết → đóng cửa.
function toggleLoaded(mesh, pi) {
    if (!pi.loaded) {
        if (!canLoad(pi)) {
            alert('⚠️ Phải xếp TỪ TRONG RA NGOÀI!\nHãy xếp pallet phía trong (sâu hơn) và tầng dưới trước rồi mới đến pallet này.');
            return;
        }
        if (!confirm('Xác nhận pallet này ĐÃ LÊN container?')) return;
        pi.loaded = true; _paintLoaded(mesh, true);
    } else {
        if (!confirm('Bỏ đánh dấu pallet này (chưa lên)?')) return;
        pi.loaded = false; _paintLoaded(mesh, false);
    }
    _persistPallet(mesh, pi);   // lưu ngay vào DB
    updateLoadedStatus();
}

function updateLoadedStatus() {
    if (!currentPlan) return;
    const pallets = currentPlan.packedItems.filter(p => !p.item?.isWood);
    const total = pallets.length;
    const done  = pallets.filter(p => p.loaded).length;
    const allDone = total > 0 && done === total;
    showToast(allDone ? `✅ Đã lên đủ ${done}/${total} pallet — đóng cửa container`
                      : `📦 Đã lên ${done}/${total} pallet`, allDone);
    if (allDone !== doorsClosed) { doorsClosed = allDone; applyDoorState(); }
    // báo cho quy trình thực hiện: đủ pallet hay chưa
    if (typeof window._onLoadedProgress === 'function') window._onLoadedProgress(done, total, allDone);
}

let _toastTimer = null;
function showToast(msg, strong) {
    let t = document.getElementById('load-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'load-toast';
        t.style.cssText = `position:absolute;top:72px;left:50%;transform:translateX(-50%);
            background:rgba(15,17,23,0.95);border:1px solid #38a169;padding:8px 18px;border-radius:20px;
            font-size:13px;font-weight:700;z-index:50;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);`;
        const host = document.querySelector('.viewer-container');
        if (host) host.appendChild(t);
    }
    t.textContent = msg;
    t.style.color = strong ? '#9ae6b4' : '#cbd5e0';
    t.style.borderColor = strong ? '#38a169' : '#4a5568';
    t.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.style.display = 'none'; }, 2200);
}

// ==================== TAB SWITCHING ====================
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const tabEl = document.querySelector(`.tab[onclick*="'${tab}'"]`);
    if (tabEl) tabEl.classList.add('active');
    const pane = document.getElementById('tab-' + tab);
    if (pane) { pane.classList.add('active'); pane.style.display = 'block'; }
}

// ==================== CARGO MANAGEMENT ====================
function addCargoItem() {
    const name   = document.getElementById('item-name').value.trim() || ('Item ' + itemIdCounter);
    const length = parseFloat(document.getElementById('item-l').value)      || 100;
    const width  = parseFloat(document.getElementById('item-w').value)      || 80;
    const height = parseFloat(document.getElementById('item-h').value)      || 60;
    const weight = parseFloat(document.getElementById('item-weight').value) || 0;
    const qty    = parseInt(document.getElementById('item-qty').value)      || 1;
    const desc   = document.getElementById('item-desc').value.trim();
    cargoItems.push({ id: itemIdCounter++, name, length, width, height, weight, quantity: qty, color: selectedColor, stackable: true, description: desc });
    renderCargoList();
    updateItemCount();
    document.getElementById('item-name').value = '';
    document.getElementById('item-desc').value = '';
}

function removeItem(id) {
    cargoItems = cargoItems.filter(i => i.id !== id);
    renderCargoList();
    updateItemCount();
}

function clearAll() {
    cargoItems = []; currentPlan = null;
    renderCargoList(); updateItemCount(); renderScene();
}

function resetAll() {
    clearAll(); resetCamera();
    document.getElementById('optimize-result').style.display = 'none';
    switchTab('container');
}

function renderCargoList() {
    const el = document.getElementById('cargo-list');
    if (!el) return; // tab "Thêm cargo" cũ đã đổi thành lịch sử
    if (!cargoItems.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No items yet.<br>Go to "Add Cargo" tab to add items.</p></div>`;
        return;
    }
    el.innerHTML = cargoItems.map(item => `
        <div class="cargo-item">
            <div class="cargo-color-bar" style="background:${item.color}"></div>
            <div class="cargo-info">
                <div class="cargo-name">${item.name}</div>
                <div class="cargo-dims">${item.length}×${item.width}×${item.height} cm · ${item.weight} kg</div>
            </div>
            <span class="cargo-qty">×${item.quantity}</span>
            <button onclick="removeItem(${item.id})" style="background:none;border:none;color:#fc8181;cursor:pointer;font-size:15px;padding:4px;">✕</button>
        </div>
    `).join('');
}

function updateItemCount() {
    // Badge #item-count giờ hiển thị SỐ KẾ HOẠCH (do loadPlansPanel cập nhật), không đếm cargo nữa
}

// Color picker
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        selectedColor = dot.dataset.color;
    });
});

// Presets
const PRESETS = {
    pallet: { name: 'Euro Pallet', length: 120, width: 80,  height: 144, weight: 500,  color: '#F39C12' },
    drum:   { name: 'Drum 200L',   length: 58,  width: 58,  height: 88,  weight: 230,  color: '#3498DB' },
    box:    { name: 'Small Box',   length: 40,  width: 30,  height: 30,  weight: 15,   color: '#2ECC71' },
    bag:    { name: 'Big Bag',     length: 90,  width: 90,  height: 110, weight: 1000, color: '#9B59B6' },
};
function addPreset(type) {
    const p = PRESETS[type]; if (!p) return;
    document.getElementById('item-name').value   = p.name;
    document.getElementById('item-l').value      = p.length;
    document.getElementById('item-w').value      = p.width;
    document.getElementById('item-h').value      = p.height;
    document.getElementById('item-weight').value = p.weight;
    document.getElementById('item-qty').value    = 1;
    selectedColor = p.color;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('active', d.dataset.color === p.color));
    switchTab('cargo');
}

// ==================== CALCULATE ====================
async function calculatePacking() {
    if (!cargoItems.length) { alert('Vui lòng thêm ít nhất 1 kiện hàng!'); return; }
    showLoading(true);
    try {
        const res  = await fetch('/Home/Calculate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ containerType: selectedContainer, items: cargoItems }) });
        const plan = await res.json();
        renderScene(plan);
        switchTab('list');
    } catch(e) { alert('Lỗi: ' + e.message); }
    finally    { showLoading(false); }
}

// ==================== OPTIMIZE ====================
async function optimizePacking() {
    if (!cargoItems.length) { alert('Vui lòng thêm ít nhất 1 loại kiện hàng!'); return; }
    showLoading(true);
    document.getElementById('optimize-result').style.display = 'none';
    try {
        const body   = { containerType: selectedContainer, itemTypes: cargoItems.map(i => ({ ...i, quantity: 1 })) };
        const res    = await fetch('/Home/Optimize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const result = await res.json();
        renderScene(result.plan);
        if (result.suggestions && result.suggestions.length > 0) {
            document.getElementById('optimize-list').innerHTML = result.suggestions.map(s =>
                `<div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;">
                    <div style="width:10px;height:10px;border-radius:2px;background:${s.item.color};flex-shrink:0;"></div>
                    <span style="flex:1;">${s.item.name}</span>
                    <b style="color:#68d391;">×${s.suggestedQty}</b>
                </div>`
            ).join('');
            document.getElementById('optimize-result').style.display = 'block';
            result.suggestions.forEach(s => { const f = cargoItems.find(i => i.name === s.item.name); if (f) f.quantity = s.suggestedQty; });
            renderCargoList(); updateItemCount();
        }
    } catch(e) { alert('Lỗi tối ưu: ' + e.message); }
    finally    { showLoading(false); }
}

// ==================== EXPORT PDF (4 góc nhìn) ====================
function exportPlan() {
    if (!currentPlan) { alert('Chưa có kết quả để export!'); return; }
    exportPDF();
}

async function exportPDF() {
    if (!currentPlan) { alert('Chưa có kết quả để export!'); return; }
    showLoading(true);
    deselectPallet();

    const C      = currentPlan.container;
    const cY     = C.height / 2;

    // Chụp ở độ phân giải cao để chữ sắc nét
    const CAP_W = 1800, CAP_H = 1100;
    const oldSize = new THREE.Vector2(); renderer.getSize(oldSize);
    const oldRatio = renderer.getPixelRatio();
    const oldAspect = camera.aspect;
    renderer.setPixelRatio(1);
    renderer.setSize(CAP_W, CAP_H, false);
    const aspect = CAP_W / CAP_H;
    camera.aspect = aspect;

    const fovV = camera.fov * Math.PI / 180;
    // Khoảng cách để khít một mặt rộng w × cao h (chừa lề nhẹ)
    const fitDist = (w, h, margin = 1.1) => {
        const dV = (h / 2) / Math.tan(fovV / 2);
        const dH = (w / 2) / (Math.tan(fovV / 2) * aspect);
        return Math.max(dV, dH) * margin;
    };

    const VIEWS = [
        {
            label: 'Góc nhìn 3D (Perspective)',
            setup() {
                const d = fitDist(C.length, Math.max(C.height, C.width), 1.25);
                camera.position.set(d * 0.62, cY + d * 0.5, C.width / 2 + d * 0.62);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Nhìn từ trên (Top View)',
            setup() {
                const d = fitDist(C.length, C.width);
                camera.position.set(0, cY + d, 0.1);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Mặt trước – Đầu container (Front)',
            setup() {
                const d = fitDist(C.width, C.height);
                camera.position.set(-C.length / 2 - d, cY, 0);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Mặt bên (Side View)',
            setup() {
                const d = fitDist(C.length, C.height);
                camera.position.set(0, cY, C.width / 2 + d);
                camera.lookAt(0, cY, 0);
            }
        },
    ];

    const images = [];
    for (const v of VIEWS) {
        v.setup();
        camera.updateProjectionMatrix();
        // Ẩn tường phía gần camera để luôn thấy pallet bên trong khi chụp
        for (const w of cutawayWalls) {
            _toCam.copy(camera.position).sub(w.center);
            w.mesh.visible = _toCam.dot(w.normal) <= 0;
        }
        renderer.render(scene, camera);
        images.push({ label: v.label, src: renderer.domElement.toDataURL('image/jpeg', 0.95) });
    }

    // Khôi phục renderer + camera
    renderer.setPixelRatio(oldRatio);
    renderer.setSize(oldSize.x, oldSize.y, false);
    camera.aspect = oldAspect;
    camera.updateProjectionMatrix();
    currentView = 'perspective';

    // Bảng tổng hợp
    const groups = {};
    currentPlan.packedItems.forEach(pi => {
        const k = pi.item.name;
        if (!groups[k]) groups[k] = { item: pi.item, count: 0, tw: 0 };
        groups[k].count++; groups[k].tw += pi.item.weight;
    });
    const gList      = Object.values(groups);
    const totalItems = gList.reduce((s, g) => s + g.count, 0);
    const totalW     = gList.reduce((s, g) => s + g.tw, 0);

    const tableRows = gList.map(g => `
        <tr>
            <td><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${g.item.color};vertical-align:middle;margin-right:6px;"></span>${g.item.name}</td>
            <td>${g.item.length}×${g.item.width}×${g.item.height} cm</td>
            <td style="text-align:right;">${g.item.weight.toLocaleString()}</td>
            <td style="text-align:right;font-weight:bold;">${g.count}</td>
            <td style="text-align:right;">${Math.round(g.tw).toLocaleString()}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>Loading Plan – EasyCargo 3D</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  *  { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:14px; color:#111; background:#fff; }
  header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:10px; border-bottom:3px solid #2c3e50; padding-bottom:8px; }
  h1  { font-size:22px; color:#1a2533; }
  .meta { font-size:12px; color:#444; text-align:right; line-height:1.6; font-weight:600; }
  .summary { display:flex; gap:16px; margin-bottom:10px; font-size:14px; flex-wrap:wrap; }
  .summary span { background:#eef3f8; border-left:4px solid #2c3e50; padding:5px 12px; border-radius:0 4px 4px 0; font-weight:600; }
  .views { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
  .view-box { border:1px solid #bbb; border-radius:5px; overflow:hidden; }
  .view-label { background:#2c3e50; color:#fff; font-size:13px; font-weight:bold; padding:5px 10px; }
  .view-box img { width:100%; display:block; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th { background:#2c3e50; color:#fff; padding:8px 10px; text-align:left; font-size:13px; }
  td { padding:7px 10px; border-bottom:1px solid #ddd; }
  tr:nth-child(even) td { background:#f5f8fa; }
  tfoot td { font-weight:bold; font-size:14px; border-top:2px solid #2c3e50; background:#eef3f8 !important; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>🚢 Loading Plan – EasyCargo 3D</h1>
    <div style="font-size:13px;color:#333;margin-top:3px;font-weight:600;">
      Container: <b>${C.name || selectedContainer}</b> · ${C.length}×${C.width}×${C.height} cm · Tải trọng tối đa: <b>${(C.maxWeight||0).toLocaleString()} kg</b>
    </div>
  </div>
  <div class="meta">
    Ngày xuất: <b>${new Date().toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</b><br>
    Giờ: <b>${new Date().toLocaleTimeString('vi-VN')}</b>
  </div>
</header>

<div class="summary">
  <span>📦 Tổng pallets: <b>${currentPlan.packedItems.length}</b></span>
  <span>📊 Thể tích: <b>${Math.round(currentPlan.volumeUtilization||0)}%</b></span>
  <span>⚖️ Tải trọng: <b>${Math.round(currentPlan.weightUtilization||0)}%</b></span>
  <span>🏋️ Tổng nặng: <b>${Math.round(currentPlan.totalWeight||0).toLocaleString()} kg</b></span>
</div>

<div class="views">
  ${images.map(img => `
    <div class="view-box">
      <div class="view-label">📐 ${img.label}</div>
      <img src="${img.src}" alt="${img.label}">
    </div>`).join('')}
</div>

<table>
  <thead>
    <tr>
      <th>Loại pallet / hàng hóa</th>
      <th>Kích thước (D×R×C)</th>
      <th style="text-align:right;">Đơn trọng (kg)</th>
      <th style="text-align:right;">Số lượng</th>
      <th style="text-align:right;">Tổng trọng (kg)</th>
    </tr>
  </thead>
  <tbody>${tableRows}</tbody>
  <tfoot>
    <tr>
      <td colspan="3">Tổng cộng</td>
      <td style="text-align:right;">${totalItems}</td>
      <td style="text-align:right;">${Math.round(totalW).toLocaleString()}</td>
    </tr>
  </tfoot>
</table>
</body></html>`;

    showLoading(false);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 700);
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'flex' : 'none';
}

// ==================== IMPORT TAB ====================
let importRowCount = 0;
const IMPORT_COLORS = ['#E74C3C','#3498DB','#2ECC71','#F39C12','#9B59B6','#1ABC9C','#E67E22','#34495E','#E91E63','#00BCD4','#FF5722','#607D8B'];

function buildPalletOptions(selectedCode) {
    // window._palletTypes được load từ Index.cshtml sau khi fetch API
    const pts = window._palletTypes || [];
    let opts = '<option value="">-- Chọn loại pallet --</option>';
    pts.forEach(p => {
        const sel = p.code === selectedCode ? 'selected' : '';
        opts += `<option value="${p.code}" ${sel}>${p.name}</option>`;
    });
    opts += '<option value="__custom__">✏️ Nhập tay...</option>';
    return opts;
}

function onPalletTypeChange(selectEl, rowId) {
    const pts = window._palletTypes || [];
    const code = selectEl.value;
    const row  = document.getElementById(rowId);
    const p    = pts.find(x => x.code === code);
    const isCustom = code === '__custom__' || !p;

    // Luôn hiển thị kích thước, chỉ readonly khi chọn từ DB
    const dimInputs = row.querySelectorAll('.irow-l, .irow-w, .irow-h, .irow-wt');
    dimInputs.forEach(inp => {
        inp.readOnly = !isCustom;
        inp.style.opacity = isCustom ? '1' : '0.6';
        inp.style.cursor  = isCustom ? '' : 'default';
    });

    if (p) {
        row.querySelector('.irow-l').value  = p.length;
        row.querySelector('.irow-w').value  = p.width;
        row.querySelector('.irow-h').value  = p.height;
        row.querySelector('.irow-wt').value = p.weight;
        row.querySelector('.irow-name').value = p.name;
        row.style.borderLeftColor = p.color;
        row.querySelector('.color-swatch').style.background = p.color;
    }
}

function addImportRow(name, length, width, height, weight, qty, color) {
    // Tìm pallet code khớp với tên nếu có
    const pts = window._palletTypes || [];
    const matched = pts.find(p => p.name === name || p.code === name);
    const selectedCode = matched ? matched.code : (name ? '__custom__' : '');
    const isCustom = !matched;

    name   = name   || '';
    length = length !== undefined && length !== '' ? length : (matched?.length ?? '');
    width  = width  !== undefined && width  !== '' ? width  : (matched?.width  ?? '');
    height = height !== undefined && height !== '' ? height : (matched?.height ?? '');
    weight = weight !== undefined && weight !== '' ? weight : (matched?.weight ?? '');
    qty    = (qty !== undefined && qty !== '' && qty !== null) ? qty : ''; // để trống, bắt người dùng nhập
    const id = 'irow-' + (importRowCount++);
    const c  = color || matched?.color || IMPORT_COLORS[(importRowCount - 1) % IMPORT_COLORS.length];

    const container = document.getElementById('import-rows');
    const div = document.createElement('div');
    div.className = 'import-row';
    div.id = id;
    div.style.borderLeftColor = c;
    div.innerHTML = `
        <div class="import-row-header">
            <div class="color-swatch" style="background:${c}" onclick="cycleImportColor('${id}')"></div>
            <select class="irow-select input-dark" style="flex:1;font-size:12px;"
                onchange="onPalletTypeChange(this,'${id}')">
                ${buildPalletOptions(selectedCode)}
            </select>
            <button onclick="removeImportRow('${id}')" style="background:none;border:none;color:#fc8181;cursor:pointer;font-size:16px;padding:2px 6px;">✕</button>
        </div>
        <input type="hidden" class="irow-name" value="${name}">
        <div class="irow-dims dim-grid">
            <div>
                <div class="dim-label">Dài (cm)</div>
                <input type="number" class="irow-l" placeholder="52" value="${length}" min="1"
                    style="width:100%;background:#1a1f2e;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;padding:5px 6px;font-size:12px;">
            </div>
            <div>
                <div class="dim-label">Rộng (cm)</div>
                <input type="number" class="irow-w" placeholder="40" value="${width}" min="1"
                    style="width:100%;background:#1a1f2e;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;padding:5px 6px;font-size:12px;">
            </div>
            <div>
                <div class="dim-label">Cao (cm)</div>
                <input type="number" class="irow-h" placeholder="86" value="${height}" min="1"
                    style="width:100%;background:#1a1f2e;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;padding:5px 6px;font-size:12px;">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px;">
            <div>
                <div class="dim-label">Khối lượng (kg)</div>
                <input type="number" class="irow-wt" placeholder="0" value="${weight}" min="0"
                    style="width:100%;background:#1a1f2e;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;padding:5px 6px;font-size:12px;">
            </div>
            <div>
                <div class="dim-label">Số lượng</div>
                <input type="number" class="irow-qty" placeholder="1" value="${qty}" min="1"
                    style="width:100%;background:#1a1f2e;border:1px solid #4a5568;border-radius:6px;color:#e2e8f0;padding:5px 6px;font-size:12px;font-weight:700;color:#68d391;">
            </div>
        </div>`;
    container.appendChild(div);

    // Áp readonly nếu chọn từ DB (không phải nhập tay)
    if (!isCustom && matched) {
        div.querySelectorAll('.irow-l, .irow-w, .irow-h, .irow-wt').forEach(inp => {
            inp.readOnly = true;
            inp.style.opacity = '0.6';
            inp.style.cursor  = 'default';
        });
    }
}

function removeImportRow(id) { document.getElementById(id)?.remove(); }

function cycleImportColor(id) {
    const row = document.getElementById(id);
    const sw  = row.querySelector('.color-swatch');
    const cur = IMPORT_COLORS.findIndex(c => sw.style.background === c || sw.style.backgroundColor.replace(/\s/g,'') === hexToRgb(c));
    const next = IMPORT_COLORS[(Math.max(cur, 0) + 1) % IMPORT_COLORS.length];
    sw.style.background = next;
    row.style.borderLeftColor = next;
}

function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgb(${r},${g},${b})`;
}

function tryParseName(input, rowId) {
    const val   = input.value;
    const match = val.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:L)?x(\d+(?:\.\d+)?)/i);
    if (!match) return;
    const row    = document.getElementById(rowId);
    const inputs = row.querySelectorAll('input[type=number]');
    if (inputs.length >= 3) {
        inputs[0].value = parseFloat(match[2]);
        inputs[1].value = parseFloat(match[1]);
        inputs[2].value = parseFloat(match[3]);
    }
}

// ==================== MULTI-CONTAINER ====================
let multiPlans      = [];
let multiCurrentIdx = 0;
let overviewMode    = false;

async function importMultiContainer() {
    const rows = document.querySelectorAll('.import-row');
    if (!rows.length) { alert('Vui lòng thêm ít nhất 1 loại pallet!'); return; }

    const items = []; let colorIdx = 0; window._missingQty = false;
    rows.forEach(row => {
        const sel    = row.querySelector('.irow-select');
        const pts    = window._palletTypes || [];
        const p      = pts.find(x => x.code === sel?.value);
        const swatch = row.querySelector('.color-swatch');
        // Tên: từ dropdown hoặc hidden input
        const nameHidden = row.querySelector('.irow-name');
        const name   = p ? p.name : (nameHidden?.value.trim() || ('Pallet ' + (colorIdx + 1)));
        // Kích thước: nếu chọn từ DB thì lấy từ DB, nếu nhập tay thì lấy từ input
        const length = p ? p.length : (parseFloat(row.querySelector('.irow-l')?.value) || 0);
        const width  = p ? p.width  : (parseFloat(row.querySelector('.irow-w')?.value) || 0);
        const height = p ? p.height : (parseFloat(row.querySelector('.irow-h')?.value) || 0);
        const weight = parseFloat(row.querySelector('.irow-wt')?.value) || (p?.weight ?? 0);
        const qty    = parseInt(row.querySelector('.irow-qty')?.value);
        const color  = swatch?.style.background || p?.color || IMPORT_COLORS[colorIdx % IMPORT_COLORS.length];
        if (length > 0 && width > 0 && height > 0) {
            if (!qty || qty < 1) { window._missingQty = true; colorIdx++; return; }
            items.push({ id: colorIdx + 1, name, length, width, height, weight, quantity: qty, color, stackable: true, description: '' });
        }
        colorIdx++;
    });

    if (window._missingQty) { window._missingQty = false; alert('Vui lòng nhập SỐ LƯỢNG cho từng loại pallet!'); return; }
    if (!items.length) { alert('Vui lòng nhập kích thước hợp lệ!'); return; }

    const containerType  = document.getElementById('import-container-type').value;
    if (!containerType || !CONTAINERS[containerType]) { alert('Vui lòng chọn loại container!'); return; }
    const containerCount = parseInt(document.getElementById('import-container-count').value) || 50;
    const maxWeight      = (window._ctypeWeights && parseFloat(window._ctypeWeights[containerType])) || 0;
    if (!maxWeight || maxWeight <= 0) { alert('⚠️ Vui lòng nhập TẢI TRỌNG TỐI ĐA (kg) cho container!'); return; }

    // Kiểm tra pallet có vừa container không (xét cả khi xoay 90°)
    const c = CONTAINERS[containerType];
    if (c) {
        const warnings = [];
        items.forEach(item => {
            const fitsNormal  = item.length <= c.length && item.width <= c.width;
            const fitsRotated = item.length <= c.width  && item.width <= c.length;
            if (!fitsNormal && !fitsRotated) {
                warnings.push(`• ${item.name}: ${item.length}×${item.width} cm — vượt quá chiều ngang container (${c.length}×${c.width} cm)`);
            }
            if (item.height > c.height) {
                warnings.push(`• ${item.name}: cao ${item.height} cm — vượt quá chiều cao container (${c.height} cm)`);
            }
        });
        if (warnings.length) {
            alert(`⚠️ Không thể tính toán — pallet vượt kích thước container:\n\n${warnings.join('\n')}`);
            return;
        }
    }

    showLoading(true);
    try {
        const res    = await fetch('/Home/PackMultiple', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ containerType, containerCount, maxWeightPerContainer: maxWeight, items }) });
        const result = await res.json();
        multiPlans      = result.plans || [];
        multiCurrentIdx = 0;
        if (!multiPlans.length) { alert('Không tạo được kế hoạch xếp hàng!'); return; }

        document.getElementById('multi-nav').style.display = 'flex';

        const packed   = result.packedItemUnits || 0;
        const total    = result.totalItemUnits  || 0;
        const unpacked = (result.unpackedItems  || []).reduce((s, i) => s + i.quantity, 0);
        const used     = multiPlans.filter(p => p.packedItems && p.packedItems.length > 0).length;

        const summaryEl = document.getElementById('import-summary');
        summaryEl.style.display = 'block';
        summaryEl.innerHTML = `
            <div style="background:#1a2035;border-radius:10px;padding:12px;font-size:12px;">
                <div style="color:#68d391;font-weight:700;margin-bottom:6px;"><i class="fas fa-check-circle"></i> Hoàn thành: ${used}/${containerCount} container được sử dụng</div>
                <div style="color:#718096;">Tải trọng tối đa: <b style="color:#f6ad55">${maxWeight.toLocaleString()} kg</b> / container</div>
                <div style="margin-top:4px;">Tổng: <b style="color:#68d391">${packed}</b>/${total} pallets xếp được${unpacked > 0 ? ` · <b style="color:#fc8181">${unpacked} dư</b>` : ''}</div>
                ${unpacked > 0
                    ? `<div style="color:#fc8181;margin-top:4px;"><i class="fas fa-exclamation-triangle"></i> ${unpacked} pallet không vừa</div>`
                    : `<div style="color:#68d391;margin-top:4px;"><i class="fas fa-check"></i> Tất cả pallet đã được xếp</div>`}
            </div>`;

        renderMultiNavTabs();
        navContainer(0, true);
    } catch(e) { alert('Lỗi: ' + e.message); }
    finally    { showLoading(false); }
}

// ── Xếp gỗ chèn vào plan hiện tại ──
async function fillWoodDunnage() {
    if (!currentPlan || !currentPlan.packedItems || currentPlan.packedItems.length === 0) {
        alert('Chưa có dữ liệu xếp hàng. Vui lòng tính toán trước!');
        return;
    }

    const btn = document.getElementById('btn-fill-wood');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xếp gỗ...'; }

    try {
        const res = await fetch('/Home/FillWood', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentPlan)
        });
        const updatedPlan = await res.json();
        currentPlan = updatedPlan;
        renderScene(currentPlan);
        updateStats(currentPlan);
    } catch (e) {
        alert('Lỗi khi xếp gỗ: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-tree"></i> Xếp gỗ chèn khoảng trống'; }
    }
}

// ── Tự động tính số container tối thiểu ──
async function importAutoContainer() {
    const rows = document.querySelectorAll('.import-row');
    if (!rows.length) { alert('Vui lòng thêm ít nhất 1 loại pallet!'); return; }

    const items = []; let colorIdx = 0; window._missingQty = false;
    rows.forEach(row => {
        const sel    = row.querySelector('.irow-select');
        const pts    = window._palletTypes || [];
        const p      = pts.find(x => x.code === sel?.value);
        const swatch = row.querySelector('.color-swatch');
        const nameHidden = row.querySelector('.irow-name');
        const name   = p ? p.name : (nameHidden?.value.trim() || ('Pallet ' + (colorIdx + 1)));
        const length = p ? p.length : (parseFloat(row.querySelector('.irow-l')?.value) || 0);
        const width  = p ? p.width  : (parseFloat(row.querySelector('.irow-w')?.value) || 0);
        const height = p ? p.height : (parseFloat(row.querySelector('.irow-h')?.value) || 0);
        const weight = parseFloat(row.querySelector('.irow-wt')?.value) || (p?.weight ?? 0);
        const qty    = parseInt(row.querySelector('.irow-qty')?.value);
        const color  = swatch?.style.background || p?.color || IMPORT_COLORS[colorIdx % IMPORT_COLORS.length];
        if (length > 0 && width > 0 && height > 0) {
            if (!qty || qty < 1) { window._missingQty = true; colorIdx++; return; }
            items.push({ id: colorIdx + 1, name, length, width, height, weight, quantity: qty, color, stackable: true, description: '' });
        }
        colorIdx++;
    });

    if (window._missingQty) { window._missingQty = false; alert('Vui lòng nhập SỐ LƯỢNG cho từng loại pallet!'); return; }
    if (!items.length) { alert('Vui lòng nhập kích thước hợp lệ!'); return; }

    const containerType = document.getElementById('import-container-type').value;
    if (!containerType || !CONTAINERS[containerType]) { alert('Vui lòng chọn loại container!'); return; }
    const containers = (typeof collectContainers === 'function') ? collectContainers() : [{ type: containerType, maxWeight: 0 }];
    // BẮT BUỘC nhập tải trọng tối đa cho từng loại
    const missingW = containers.filter(x => !x.maxWeight || x.maxWeight <= 0).map(x => CONTAINERS[x.type]?.name || x.type);
    if (missingW.length) { alert('⚠️ Vui lòng nhập TẢI TRỌNG TỐI ĐA (kg) cho các loại container:\n• ' + missingW.join('\n• ')); return; }
    const c = CONTAINERS[containerType];

    if (c) {
        const warnings = [];
        items.forEach(item => {
            if (!( (item.length <= c.length && item.width <= c.width) ||
                   (item.length <= c.width  && item.width <= c.length) ))
                warnings.push(`• ${item.name}: ${item.length}×${item.width} cm vượt ngang container`);
            if (item.height > c.height)
                warnings.push(`• ${item.name}: cao ${item.height} cm vượt cao container`);
        });
        if (warnings.length) { alert(`⚠️ Pallet vượt kích thước container:\n\n${warnings.join('\n')}`); return; }
    }

    showLoading(true);
    try {
        const res    = await fetch('/Home/PackAuto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ containerType, containers, containerCount: 0, items }) });
        const result = await res.json();
        multiPlans      = result.plans || [];
        multiCurrentIdx = 0;
        if (!multiPlans.length) { alert('Không tạo được kế hoạch xếp hàng!'); return; }

        document.getElementById('multi-nav').style.display = 'flex';

        const packed   = result.packedItemUnits || 0;
        const total    = result.totalItemUnits  || 0;
        const unpacked = (result.unpackedItems  || []).reduce((s, i) => s + i.quantity, 0);
        const used     = multiPlans.length;
        const totalQty = items.reduce((s, i) => s + i.quantity, 0);

        const summaryEl = document.getElementById('import-summary');
        summaryEl.style.display = 'block';
        summaryEl.innerHTML = `
            <div style="background:#1a2035;border:1px solid #2d3748;border-radius:10px;padding:12px;font-size:12px;">
                <div style="color:#a78bfa;font-weight:700;margin-bottom:8px;font-size:13px;">
                    <i class="fas fa-magic"></i> Kết quả tự động tối ưu
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                    <div><i class="fas fa-box" style="color:#667eea;width:16px;"></i>
                        Cần <b style="color:#a78bfa;font-size:14px;"> ${used} container</b> để chứa ${totalQty} pallet
                    </div>
                    <div><i class="fas fa-weight-hanging" style="color:#f6ad55;width:16px;"></i>
                        Tải trọng tối đa: <b style="color:#f6ad55">${containers.map(x => (CONTAINERS[x.type]?.name || x.type) + ' ' + x.maxWeight.toLocaleString() + 'kg').join(' · ')}</b>
                    </div>
                    <div><i class="fas fa-check-circle" style="color:#68d391;width:16px;"></i>
                        Xếp được: <b style="color:#68d391">${packed}</b>/${total} pallet
                        ${unpacked > 0 ? `· <b style="color:#fc8181">${unpacked} dư</b>` : ''}
                    </div>
                    ${multiPlans.map((p, i) => {
                        const vol = Math.round(p.volumeUtilization || 0);
                        const wt  = Math.round(p.weightUtilization || 0);
                        const cnt = (p.packedItems || []).length;
                        return `<div style="color:#718096;padding-left:20px;">
                            Container ${i+1}: <b style="color:#e2e8f0">${cnt} pallet</b>
                            · vol <span style="color:#63b3ed">${vol}%</span>
                            · wt <span style="color:#f6ad55">${wt}%</span>
                        </div>`;
                    }).join('')}
                    ${unpacked > 0
                        ? `<div style="color:#fc8181;margin-top:4px;"><i class="fas fa-exclamation-triangle"></i> ${unpacked} pallet không vừa bất kỳ container nào</div>`
                        : `<div style="color:#68d391;margin-top:4px;"><i class="fas fa-check"></i> Tất cả pallet đã được xếp đầy đủ</div>`}
                </div>
            </div>`;

        renderMultiNavTabs();
        navContainer(0, true);
    } catch(e) { alert('Lỗi: ' + e.message); }
    finally    { showLoading(false); }
}

function renderMultiNavTabs() {
    const tabsEl = document.getElementById('multi-nav-tabs');
    tabsEl.innerHTML = multiPlans.map((p, i) => {
        const hasCargo = p.packedItems && p.packedItems.length > 0;
        return `<button class="nav-tab-btn${i === multiCurrentIdx ? ' active' : ''}" onclick="navContainer(${i},true)"
            style="${!hasCargo ? 'opacity:.4;' : ''}">${i + 1}</button>`;
    }).join('');
}

function navContainer(dirOrIdx, absolute) {
    if (absolute) { multiCurrentIdx = dirOrIdx; }
    else { multiCurrentIdx = Math.max(0, Math.min(multiPlans.length - 1, multiCurrentIdx + dirOrIdx)); }

    const plan = multiPlans[multiCurrentIdx];
    if (!plan) return;

    document.getElementById('multi-nav-label').textContent = `Container ${multiCurrentIdx + 1} / ${multiPlans.length}`;
    renderMultiNavTabs();

    // Tìm loại container từ kích thước
    if (plan.container) {
        const key = Object.keys(CONTAINERS).find(k =>
            Math.abs(CONTAINERS[k].length - plan.container.length) < 10 &&
            Math.abs(CONTAINERS[k].width  - plan.container.width)  < 10
        );
        if (key) selectedContainer = key;
    }

    renderScene(plan);

    document.getElementById('multi-nav-info').innerHTML =
        `<b style="color:#63b3ed">${Math.round(plan.volumeUtilization||0)}%</b> thể tích · ` +
        `<b style="color:#f6ad55">${Math.round(plan.weightUtilization||0)}%</b> tải trọng`;

    if (overviewMode) { destroyMiniScenes(); setTimeout(() => renderOverviewGrid(), 50); }
    const dp = document.getElementById('detail-panel');
    if (dp.style.display !== 'none' && dp.style.display !== '') renderDetailTable(plan);
}

// ==================== OVERVIEW ====================
const _miniScenes = []; // cleanup tracker

function toggleOverviewMode() {
    overviewMode = !overviewMode;
    const grid = document.getElementById('overview-grid');
    const btn  = document.getElementById('btn-overview');
    btn.classList.toggle('active', overviewMode);
    if (overviewMode) {
        grid.style.display = 'flex';
        // Đợi DOM layout xong rồi mới build scene
        setTimeout(() => renderOverviewGrid(), 50);
    } else {
        destroyMiniScenes();
        grid.style.display = 'none';
    }
    if (window.resizeRenderer) window.resizeRenderer();
}

// ── Single shared renderer cho tất cả mini views ──
let _ovRenderer = null;
let _ovScenes   = [];   // [{scene, camera, canvas}]
let _ovAnimId   = null;

function destroyMiniScenes() {
    if (_ovAnimId) { cancelAnimationFrame(_ovAnimId); _ovAnimId = null; }
    _ovScenes = [];
    if (_ovRenderer) { _ovRenderer.dispose(); _ovRenderer = null; }
}

function renderOverviewGrid() {
    destroyMiniScenes();
    const cardsEl = document.getElementById('overview-cards');
    cardsEl.innerHTML = '';

    const titleEl = document.getElementById('overview-title');
    if (titleEl) titleEl.textContent = `Tổng quan ${multiPlans.length} container`;

    multiPlans.forEach((plan, idx) => {
        const hasCargo = plan.packedItems && plan.packedItems.length > 0;
        const vol      = Math.round(plan.volumeUtilization || 0);
        const wt       = Math.round(plan.weightUtilization || 0);
        const itemCount= (plan.packedItems || []).length;
        const wb       = plan.weightBalance;
        const balanced = !wb || wb.balanced;

        const card = document.createElement('div');
        card.className = 'ov-card' + (idx === multiCurrentIdx ? ' active' : '');
        card.innerHTML = `
            <div class="ov-card-header">
                <div>
                    <div class="ov-card-name">Container ${idx + 1}</div>
                    <div class="ov-card-sub">${hasCargo ? itemCount + ' pallets' : 'Trống'}</div>
                </div>
                <span class="ov-balance-badge ${balanced ? 'ov-ok' : 'ov-warn'}">${balanced ? '✓ Cân bằng' : '⚠ Lệch tải'}</span>
            </div>
            <div class="ov-3d-wrap" id="ov-wrap-${idx}"></div>
            <div class="ov-stats-row">
                <div class="ov-stat"><i class="fas fa-cube" style="color:#63b3ed"></i> ${vol}%</div>
                <div class="ov-stat"><i class="fas fa-weight-hanging" style="color:#f6ad55"></i> ${wt}%</div>
                ${wb && wb.totalWeight > 0 ? `<div class="ov-stat" style="color:${balanced?'#68d391':'#f6ad55'}">
                    <i class="fas fa-balance-scale"></i>
                    ${wb.offsetXPct>=0?'+':''}${wb.offsetXPct.toFixed(0)}% /
                    ${wb.offsetZPct>=0?'+':''}${wb.offsetZPct.toFixed(0)}%
                </div>` : ''}
            </div>
            <button class="ov-view-btn" onclick="navContainer(${idx},true);toggleOverviewMode();">
                <i class="fas fa-cube"></i> Xem chi tiết
            </button>`;
        cardsEl.appendChild(card);
    });

    // Đợi DOM layout xong rồi khởi tạo renderer chung
    setTimeout(() => initSharedOverviewRenderer(), 100);
}

function buildPlanScene(plan) {
    const scene  = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1117);
    const C = plan.container;

    // Sàn
    const floor = new THREE.Mesh(
        new THREE.BoxGeometry(C.length, 3, C.width),
        new THREE.MeshBasicMaterial({ color: 0x5a4010 })
    );
    floor.position.set(0, -C.height/2 + 1.5, 0);
    scene.add(floor);

    // Khung container
    scene.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(C.length, C.height, C.width)),
        new THREE.LineBasicMaterial({ color: 0x6688aa })
    ));

    // Pallets
    (plan.packedItems || []).forEach(pi => {
        const rotated = pi.rotationY === 90 || pi.rotationY === 270;
        const iL = rotated ? pi.item.width : pi.item.length;
        const iW = rotated ? pi.item.length : pi.item.width;
        const iH = pi.item.height;
        const geo = new THREE.BoxGeometry(iL, iH, iW);
        const mesh = new THREE.Mesh(geo,
            new THREE.MeshLambertMaterial({ color: new THREE.Color(pi.item.color || '#4A90D9') })
        );
        mesh.position.set(
            -C.length/2 + pi.x + iL/2,
            -C.height/2 + pi.y + iH/2,
            -C.width/2  + pi.z + iW/2
        );
        mesh.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })
        ));
        scene.add(mesh);
    });

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl = new THREE.DirectionalLight(0xffffff, 0.5);
    dl.position.set(1, 2, 1.5); scene.add(dl);

    return scene;
}

function initSharedOverviewRenderer() {
    // Tạo 1 canvas ẩn cho renderer dùng chung
    const sharedCvs = document.createElement('canvas');
    sharedCvs.style.display = 'none';
    document.body.appendChild(sharedCvs);

    _ovRenderer = new THREE.WebGLRenderer({ canvas: sharedCvs, antialias: true });
    _ovRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _ovRenderer.autoClear = false;

    _ovScenes = multiPlans.map((plan, idx) => {
        const wrap = document.getElementById(`ov-wrap-${idx}`);
        if (!wrap) return null;

        // Tạo canvas placeholder trong wrap
        const cvs = document.createElement('canvas');
        cvs.style.width = '100%'; cvs.style.height = '100%';
        cvs.style.display = 'block';
        wrap.appendChild(cvs);

        const C = plan.container;
        const maxDim = Math.max(C.length, C.width, C.height);
        const dist   = maxDim * 1.5;

        const camera = new THREE.PerspectiveCamera(45, 1, 1, 50000);
        camera.position.set(dist * 0.75, dist * 0.55, dist * 0.75);
        camera.lookAt(0, 0, 0);

        const scene = buildPlanScene(plan);

        // Drag-to-rotate per card
        let drag = false, lx = 0, ly = 0, rotY = -0.6, rotX = 0.4;
        cvs.addEventListener('mousedown', e => { drag = true; lx = e.clientX; ly = e.clientY; e.stopPropagation(); });
        window.addEventListener('mouseup', () => { drag = false; });
        cvs.addEventListener('mousemove', e => {
            if (!drag) return;
            rotY += (e.clientX - lx) * 0.012; lx = e.clientX;
            rotX += (e.clientY - ly) * 0.012; ly = e.clientY;
            rotX = Math.max(-1.2, Math.min(1.2, rotX));
            camera.position.set(
                dist * Math.sin(rotY) * Math.cos(rotX),
                dist * Math.sin(rotX),
                dist * Math.cos(rotY) * Math.cos(rotX)
            );
            camera.lookAt(0, 0, 0);
        });
        cvs.style.cursor = 'grab';

        return { scene, camera, canvas: cvs };
    }).filter(Boolean);

    // Render loop dùng 1 renderer, lần lượt vẽ vào từng viewport bằng scissor
    function ovLoop() {
        if (!_ovRenderer) return;
        _ovScenes.forEach(({ scene, camera, canvas }) => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            // Resize renderer cho phù hợp
            _ovRenderer.setSize(rect.width, rect.height, false);
            camera.aspect = rect.width / rect.height;
            camera.updateProjectionMatrix();

            _ovRenderer.render(scene, camera);

            // Copy pixel sang canvas placeholder
            const ctx = canvas.getContext('2d');
            if (ctx) {
                canvas.width  = rect.width;
                canvas.height = rect.height;
                ctx.drawImage(_ovRenderer.domElement, 0, 0);
            }
        });
        _ovAnimId = requestAnimationFrame(ovLoop);
    }
    ovLoop();
}

function toggleDetailPanel() {
    const panel = document.getElementById('detail-panel');
    const btn   = document.getElementById('btn-detail');
    const open  = panel.style.display === 'block';
    panel.style.display = open ? 'none' : 'block';
    btn.classList.toggle('active', !open);
    if (!open && currentPlan) renderDetailTable(currentPlan);
}

function renderDetailTable(plan) {
    const el = document.getElementById('detail-table-content');
    if (!plan || !plan.packedItems || !plan.packedItems.length) {
        el.innerHTML = '<div style="color:#718096;padding:12px;font-size:12px;">Không có dữ liệu</div>'; return;
    }
    const groups = {};
    plan.packedItems.forEach(pi => {
        const k = pi.item.name;
        if (!groups[k]) groups[k] = { item: pi.item, count: 0, totalW: 0 };
        groups[k].count++; groups[k].totalW += pi.item.weight;
    });
    const L = plan.container ? plan.container.length : 1;
    let frontW = 0, backW = 0;
    plan.packedItems.forEach(pi => {
        const cx = pi.x + pi.item.length / 2;
        if (cx < L / 2) frontW += pi.item.weight; else backW += pi.item.weight;
    });
    const totalW   = frontW + backW;
    const frontPct = totalW > 0 ? Math.round(frontW / totalW * 100) : 50;

    const rows      = Object.values(groups);
    const totalItem = rows.reduce((s, g) => s + g.count, 0);

    el.innerHTML = `
        <div style="padding:8px;background:#1a2035;border-radius:8px;margin-bottom:8px;font-size:11px;">
            <div style="color:#718096;margin-bottom:3px;">Phân bố tải trọng (Mũi → Đuôi)</div>
            <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:4px;">
                <div style="width:${frontPct}%;background:#63b3ed;"></div>
                <div style="width:${100-frontPct}%;background:#f6ad55;"></div>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:#63b3ed;">Mũi ${Math.round(frontW).toLocaleString()} kg (${frontPct}%)</span>
                <span style="color:#f6ad55;">Đuôi ${Math.round(backW).toLocaleString()} kg (${100-frontPct}%)</span>
            </div>
        </div>
        <table class="detail-table">
            <thead><tr>
                <th>Loại pallet</th>
                <th style="text-align:right;">SL</th>
                <th style="text-align:right;">Đơn trọng (kg)</th>
                <th style="text-align:right;">Tổng trọng (kg)</th>
            </tr></thead>
            <tbody>
                ${rows.map(g => `<tr>
                    <td><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${g.item.color};margin-right:5px;"></span>${g.item.name}</td>
                    <td style="text-align:right;">${g.count}</td>
                    <td style="text-align:right;">${g.item.weight.toLocaleString()}</td>
                    <td style="text-align:right;">${Math.round(g.totalW).toLocaleString()}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr>
                <td style="font-weight:700;">Tổng cộng</td>
                <td style="text-align:right;font-weight:700;">${totalItem}</td>
                <td></td>
                <td style="text-align:right;font-weight:700;">${Math.round(totalW).toLocaleString()}</td>
            </tr></tfoot>
        </table>`;
}


// ==================== CONTAINER CRUD MODAL ====================
function openAddContainerModal() {
    document.getElementById('ct-modal-title').textContent = 'Thêm Container';
    document.getElementById('ct-id').value       = '';
    document.getElementById('ct-code').value     = '';
    document.getElementById('ct-name').value     = '';
    document.getElementById('ct-length').value   = '';
    document.getElementById('ct-width').value    = '';
    document.getElementById('ct-height').value   = '';
    document.getElementById('ct-weight').value   = '';
    document.getElementById('ct-icon').value     = '&#x1F4E6;';
    document.getElementById('ct-sort').value     = Object.keys(CONTAINERS).length + 1;
    document.getElementById('ct-code').disabled  = false;
    document.getElementById('container-modal').classList.add('show');
}

function openEditContainerModal(key) {
    const c = CONTAINERS[key];
    if (!c) return;
    document.getElementById('ct-modal-title').textContent = 'Sửa Container';
    document.getElementById('ct-id').value       = c.id;
    document.getElementById('ct-code').value     = key;
    document.getElementById('ct-name').value     = c.name;
    document.getElementById('ct-length').value   = c.length;
    document.getElementById('ct-width').value    = c.width;
    document.getElementById('ct-height').value   = c.height;
    document.getElementById('ct-weight').value   = c.maxWeight;
    document.getElementById('ct-icon').value     = c.icon;
    document.getElementById('ct-sort').value     = '';
    document.getElementById('ct-code').disabled  = true;
    document.getElementById('container-modal').classList.add('show');
}

function closeContainerModal() {
    document.getElementById('container-modal').classList.remove('show');
}

async function saveContainerModal() {
    const id     = parseInt(document.getElementById('ct-id').value) || 0;
    const payload = {
        id:        id,
        code:      document.getElementById('ct-code').value.trim(),
        name:      document.getElementById('ct-name').value.trim(),
        length:    parseFloat(document.getElementById('ct-length').value) || 0,
        width:     parseFloat(document.getElementById('ct-width').value)  || 0,
        height:    parseFloat(document.getElementById('ct-height').value) || 0,
        maxWeight: parseFloat(document.getElementById('ct-weight').value) || 0,
        icon:      document.getElementById('ct-icon').value.trim() || '&#x1F4E6;',
        sortOrder: parseInt(document.getElementById('ct-sort').value) || 0,
        isActive:  true
    };
    if (!payload.code || !payload.name) { alert('Vui lòng nhập Code và Tên.'); return; }

    const method = id ? 'PUT' : 'POST';
    const url    = id ? `/api/container-types/${id}` : '/api/container-types';
    try {
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) { alert('Lỗi lưu: ' + res.status); return; }
        closeContainerModal();
        await loadContainersFromAPI();
        initContainerCards();
    } catch (e) { alert('Lỗi kết nối: ' + e.message); }
}

async function deleteContainer(key) {
    const c = CONTAINERS[key];
    if (!c || !confirm(`Xóa container "${c.name}"?`)) return;
    try {
        const res = await fetch(`/api/container-types/${c.id}`, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) { alert('Lỗi xóa: ' + res.status); return; }
        if (selectedContainer === key) selectedContainer = '';
        await loadContainersFromAPI();
        initContainerCards();
    } catch (e) { alert('Lỗi kết nối: ' + e.message); }
}

// ==================== LOAD PALLETS FROM API ====================
async function loadPalletTypesFromAPI() {
    try {
        const res = await fetch('/api/pallet-types');
        window._palletTypes = await res.json();
    } catch (e) {
        console.error('Không load được pallet types:', e);
        window._palletTypes = [];
    }
}

// ==================== KHỞI ĐỘNG ====================
(async () => {
    await Promise.all([loadContainersFromAPI(), loadPalletTypesFromAPI()]);
    initContainerCards();
    renderScene();
})();
