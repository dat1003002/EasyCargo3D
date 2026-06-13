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
    Object.entries(CONTAINERS).forEach(([key, c]) => {
        const card = document.createElement('div');
        card.className = 'container-type-card' + (key === selectedContainer ? ' active' : '');
        card.innerHTML = `
            <div class="c-icon">${c.icon}</div>
            <div class="c-name">${c.name}</div>
            <div class="c-size">${c.length}×${c.width}×${c.height} cm</div>
            <div class="c-actions">
                <button class="c-btn-edit" onclick="event.stopPropagation();openEditContainerModal('${key}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="c-btn-del"  onclick="event.stopPropagation();deleteContainer('${key}')"  title="Xóa"><i class="fas fa-trash"></i></button>
            </div>`;
        card.onclick = () => selectContainer(key);
        grid.appendChild(card);
    });
    // Nút thêm mới
    const addCard = document.createElement('div');
    addCard.className = 'container-type-card container-add-card';
    addCard.innerHTML = `<div class="c-icon">&#x2795;</div><div class="c-name">Thêm mới</div>`;
    addCard.onclick = () => openAddContainerModal();
    grid.appendChild(addCard);

    // Cập nhật dropdown trong tab Import
    const sel = document.getElementById('import-container-type');
    if (sel) {
        sel.innerHTML = '';
        Object.entries(CONTAINERS).forEach(([key, c]) => {
            const opt = document.createElement('option');
            opt.value = key; opt.textContent = c.name;
            if (key === selectedContainer) opt.selected = true;
            sel.appendChild(opt);
        });
    }
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
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1f2e);
// fog tắt để zoom out không bị mờ container

const camera = new THREE.PerspectiveCamera(45, 1, 1, 50000);
camera.position.set(800, 600, 900);
camera.lookAt(0, 0, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0x8ab4f8, 0x3a3a3a, 0.6);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(500, 800, 500);
dirLight.castShadow = true;
scene.add(dirLight);
const dirLight2 = new THREE.DirectionalLight(0x4466ff, 0.3);
dirLight2.position.set(-500, 300, -500);
scene.add(dirLight2);

const gridHelper = new THREE.GridHelper(3000, 60, 0x2d3748, 0x2d3748);
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
    renderer.render(scene, camera);
}
animate();

// ==================== BUILD CONTAINER ====================
let containerGroup = null;

function buildContainer(L, W, H) {
    if (containerGroup) { scene.remove(containerGroup); }
    containerGroup = new THREE.Group();

    function mat(color, opacity, side) {
        return new THREE.MeshPhysicalMaterial({
            color, transparent: opacity < 1, opacity,
            roughness: 0.4, metalness: 0.3,
            side: side !== undefined ? side : THREE.FrontSide,
            depthWrite: opacity >= 1
        });
    }

    // BackSide: mặt quay về camera bị ẩn → nhìn từ ngoài xuyên thấy vào trong
    const WALL_MAT   = mat(0x2a3a4a, 0.18, THREE.BackSide);
    const RIB_MAT    = mat(0x4a6070, 0.45, THREE.BackSide);
    const ROOF_MAT   = mat(0x2a3a4a, 0.15, THREE.BackSide);
    const FLOOR_MAT  = mat(0x7a5a1a, 1.0,  THREE.FrontSide);
    const CORNER_MAT = mat(0x8899aa, 1.0,  THREE.DoubleSide);
    const FRONT_MAT  = mat(0x2a3a4a, 0.15, THREE.BackSide);
    const EDGE_MAT   = mat(0xaabbcc, 1.0,  THREE.DoubleSide);

    function addBox(w, h, d, m, x, y, z) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        containerGroup.add(mesh);
        return mesh;
    }

    // Sàn gỗ (đặc)
    addBox(L, 3, W, FLOOR_MAT, 0, -H/2 + 1.5, 0);

    // Tường hai bên + sọc dọc
    [-W/2, W/2].forEach(z => {
        addBox(L, H, 2, WALL_MAT, 0, 0, z);
        for (let x = -L/2; x <= L/2; x += 60) addBox(4, H, 3, RIB_MAT, x, 0, z);
    });

    // Mái + sọc ngang
    addBox(L, 2, W, ROOF_MAT, 0, H/2 - 1, 0);
    for (let x = -L/2; x <= L/2; x += 120) addBox(4, 3, W, RIB_MAT, x, H/2 - 1.5, 0);

    // Tường trước
    addBox(2, H, W, FRONT_MAT, -L/2 + 1, 0, 0);

    // Khung cửa sau
    const dfw = 8;
    addBox(dfw, H, dfw, CORNER_MAT, L/2 - dfw/2, 0, -W/2 + dfw/2);
    addBox(dfw, H, dfw, CORNER_MAT, L/2 - dfw/2, 0,  W/2 - dfw/2);
    addBox(dfw, dfw, W, CORNER_MAT, L/2 - dfw/2,  H/2 - dfw/2, 0);
    addBox(dfw, dfw, W, CORNER_MAT, L/2 - dfw/2, -H/2 + dfw/2, 0);

    // Cửa mở 90°
    const doorMat = mat(0xa0b8c8, 0.35);
    [-1, 1].forEach(side => {
        const door = new THREE.Mesh(new THREE.BoxGeometry(2, H - 20, W/2 - dfw), doorMat);
        door.position.set(L/2 + W/4 - dfw/2, 0, side * (W/2 + dfw/2));
        door.rotation.y = side * Math.PI / 2;
        containerGroup.add(door);
    });

    // 8 góc casting
    [[-L/2,-W/2],[-L/2,W/2],[L/2,-W/2],[L/2,W/2]].forEach(([x,z]) => {
        [-H/2, H/2].forEach(y => addBox(20, 20, 20, CORNER_MAT, x, y, z));
    });

    // 12 cạnh khung
    [[-W/2,-H/2],[-W/2,H/2],[W/2,-H/2],[W/2,H/2]].forEach(([z,y]) => addBox(L,5,5,EDGE_MAT,0,y,z));
    [[-L/2,-H/2],[-L/2,H/2],[L/2,-H/2],[L/2,H/2]].forEach(([x,y]) => addBox(5,5,W,EDGE_MAT,x,y,0));
    [[-L/2,-W/2],[-L/2,W/2],[L/2,-W/2],[L/2,W/2]].forEach(([x,z]) => addBox(5,H,5,EDGE_MAT,x,0,z));

    // Đẩy toàn bộ container lên để đáy nằm trên lưới (y=0)
    containerGroup.position.y = H / 2;
    scene.add(containerGroup);
}

// ==================== BOX FACE TEXTURE ====================

// Tính luminance để chọn màu chữ tương phản
function contrastColor() {
    return '#111111';
}

function drawFaceCanvas(item, isTop) {
    const S   = 256;
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

    // Tên item
    const centerY = isTop ? S/2 - 12 : S/2;
    let fontSize  = isTop ? 68 : 82;
    ctx.font = `bold ${fontSize}px Arial,sans-serif`;
    while (ctx.measureText(item.name).width > S - 32 && fontSize > 14) {
        fontSize -= 3;
        ctx.font = `bold ${fontSize}px Arial,sans-serif`;
    }
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Chữ đen, không stroke trắng
    ctx.fillStyle = '#111111';
    ctx.fillText(item.name, S/2, centerY);

    if (isTop) {
        // Mặt trên: kích thước D×R bên dưới tên
        const dimText = `${item.length}×${item.width} cm`;
        const df      = 20;
        ctx.font      = `bold ${df}px Arial,sans-serif`;
        ctx.fillStyle   = '#111111';
        ctx.globalAlpha = 0.8;
        ctx.fillText(dimText, S/2, centerY + fontSize/2 + 16);
        ctx.globalAlpha = 1;
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

    plan.packedItems.forEach(pi => {
        const item = pi.item;
        const rotated = (pi.rotationY === 90 || pi.rotationY === 270);
        const L = rotated ? item.width  : item.length;
        const W = rotated ? item.length : item.width;
        const H = item.height;
        const geo = new THREE.BoxGeometry(L, H, W);

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

        const edgeColor = item.isWood ? 0x5C3A1E : 0x000000;
        const edgeOpacity = item.isWood ? 0.8 : 0.5;
        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(geo),
            new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity })
        );
        mesh.add(edges);
        cargoGroup.add(mesh);
    });

    scene.add(cargoGroup);
}

// ==================== RENDER SCENE ====================
function renderScene(plan) {
    if (plan !== undefined) currentPlan = plan;
    const c = CONTAINERS[selectedContainer];
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
        if (pi) { selectPallet(hits[0].object, pi); return; }
    }
    deselectPallet();
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
    document.getElementById('item-count').textContent = cargoItems.reduce((s, i) => s + i.quantity, 0);
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
    const maxDim = Math.max(C.length, C.width, C.height);
    const dist   = maxDim * 2.2;

    const VIEWS = [
        {
            label: 'Góc nhìn 3D (Perspective)',
            setup() {
                camera.position.set(C.length * 0.7, cY + C.height * 0.8, C.width * 1.4);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Nhìn từ trên (Top View)',
            setup() {
                camera.position.set(0, cY + dist, 0.1);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Mặt trước – Đầu container (Front)',
            setup() {
                camera.position.set(-C.length / 2 - dist * 0.7, cY, 0);
                camera.lookAt(0, cY, 0);
            }
        },
        {
            label: 'Mặt bên (Side View)',
            setup() {
                camera.position.set(0, cY, C.width / 2 + dist * 0.7);
                camera.lookAt(0, cY, 0);
            }
        },
    ];

    const images = [];
    for (const v of VIEWS) {
        v.setup();
        camera.aspect = canvas.width / canvas.height;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        images.push({ label: v.label, src: renderer.domElement.toDataURL('image/jpeg', 0.92) });
    }

    // Khôi phục camera
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
  body { font-family:Arial,sans-serif; font-size:11px; color:#222; background:#fff; }
  header { display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; border-bottom:2px solid #2c3e50; padding-bottom:6px; }
  h1  { font-size:17px; color:#2c3e50; }
  .meta { font-size:10px; color:#666; text-align:right; line-height:1.6; }
  .summary { display:flex; gap:20px; margin-bottom:8px; font-size:11px; }
  .summary span { background:#f0f4f8; border-left:3px solid #2c3e50; padding:3px 8px; border-radius:0 4px 4px 0; }
  .views { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
  .view-box { border:1px solid #ccc; border-radius:5px; overflow:hidden; }
  .view-label { background:#2c3e50; color:#fff; font-size:10px; font-weight:bold; padding:3px 8px; }
  .view-box img { width:100%; display:block; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#2c3e50; color:#fff; padding:5px 8px; text-align:left; }
  td { padding:4px 8px; border-bottom:1px solid #eee; }
  tr:nth-child(even) td { background:#f8f9fa; }
  tfoot td { font-weight:bold; border-top:2px solid #2c3e50; background:#f0f4f8 !important; }
  @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>🚢 Loading Plan – EasyCargo 3D</h1>
    <div style="font-size:10px;color:#666;margin-top:2px;">
      Container: <b>${C.name || selectedContainer}</b> · ${C.length}×${C.width}×${C.height} cm
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
    qty    = qty    || 1;
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

    const items = []; let colorIdx = 0;
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
        const qty    = parseInt(row.querySelector('.irow-qty')?.value)  || 1;
        const color  = swatch?.style.background || p?.color || IMPORT_COLORS[colorIdx % IMPORT_COLORS.length];
        if (length > 0 && width > 0 && height > 0) {
            items.push({ id: colorIdx + 1, name, length, width, height, weight, quantity: qty, color, stackable: true, description: '' });
        }
        colorIdx++;
    });

    if (!items.length) { alert('Vui lòng nhập kích thước hợp lệ!'); return; }

    const containerType  = document.getElementById('import-container-type').value;
    const containerCount = parseInt(document.getElementById('import-container-count').value) || 8;
    const maxWeight      = parseFloat(document.getElementById('import-max-weight').value)    || 19000;

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

    const items = []; let colorIdx = 0;
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
        const qty    = parseInt(row.querySelector('.irow-qty')?.value)  || 1;
        const color  = swatch?.style.background || p?.color || IMPORT_COLORS[colorIdx % IMPORT_COLORS.length];
        if (length > 0 && width > 0 && height > 0)
            items.push({ id: colorIdx + 1, name, length, width, height, weight, quantity: qty, color, stackable: true, description: '' });
        colorIdx++;
    });

    if (!items.length) { alert('Vui lòng nhập kích thước hợp lệ!'); return; }

    const containerType = document.getElementById('import-container-type').value;
    const maxWeight     = parseFloat(document.getElementById('import-max-weight').value) || 19000;
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
        const res    = await fetch('/Home/PackAuto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ containerType, containerCount: 0, maxWeightPerContainer: maxWeight, items }) });
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
                        Tải trọng tối đa: <b style="color:#f6ad55">${maxWeight.toLocaleString()} kg</b> / container
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
