// ==================== 全局狀態 ====================
let canvas = null;
let currentProject = null;
let currentImageIndex = 0;
let currentClassId = 0;
let isDirty = false;
let showLabels = true;
// 畫框狀態機
let drawingState = 'idle'; // 'idle' | 'drawing'
let startPoint = null;
let currentRect = null;
// 圖像尺寸
let scaleRatio = 1;
let originalImageWidth = 0;
let originalImageHeight = 0;
// 標註計數器（用於生成唯一 ID）
let annotationCounter = 0;
// 十字準星對象
let crosshairX = null;
let crosshairY = null;

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', function () {
    initCanvas();
    loadProject();
    setupKeyboardEvents();
});

// ==================== 畫布初始化 ====================
function initCanvas() {
    const container = document.getElementById('canvasContainer');
    canvas = new fabric.Canvas('annotationCanvas', {
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundColor: '#0a0a1a',
        selection: false,
        preserveObjectStacking: true,
    });

    // 禁用右鍵預設選單
    canvas.on('contextmenu', function (opt) {
        opt.e.preventDefault();
        return false;
    });

    // 繪製與滑鼠事件
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp); // 新增：監聽滑鼠放開事件
    canvas.on('mouse:out', handleMouseOut);

    // 視窗大小變化時重新調整
    window.addEventListener('resize', () => {
        if (currentProject && currentProject.data[currentImageIndex]) {
            loadImage(currentImageIndex);
        }
    });
}

// ==================== 十字準星初始化 ====================
function initCrosshairs() {
    if (crosshairX) canvas.remove(crosshairX);
    if (crosshairY) canvas.remove(crosshairY);

    // Determine current class color for crosshair
    const currentClass = currentProject.class_info.find(c => c.id === currentClassId);
    const lineColor = currentClass ? currentClass.color : '#00ffcc';   // fallback

    const lineOptions = {
        stroke: lineColor,
        strokeWidth: 1,
        strokeDashArray: [4, 4],
        selectable: false,
        evented: false,
        visible: false,
    };

    crosshairX = new fabric.Line([0, 0, canvas.width, 0], lineOptions);
    crosshairY = new fabric.Line([0, 0, 0, canvas.height], lineOptions);

    canvas.add(crosshairX);
    canvas.add(crosshairY);
}
// ==================== 專案載入 ====================
async function loadProject() {
    try {
        const res = await fetch(`/api/project/${PROJECT_NAME}`);
        if (!res.ok) throw new Error('Project not found');
        currentProject = await res.json();

        document.getElementById('headerProjectName').textContent = PROJECT_NAME;
        
        if (currentProject.class_info && currentProject.class_info.length > 0) {
            currentClassId = currentProject.class_info[0].id;
        }
        
        renderClassList();
        
        if (currentProject.data.length > 0) {
            loadImage(0);
        } else {
            setStatus('專案中沒有圖片');
        }
    } catch (err) {
        setStatus('載入專案失敗: ' + err.message);
    }
}

// ==================== 類別列表渲染 ====================
function renderClassList() {
    const container = document.getElementById('classList');
    container.innerHTML = '';
    
    currentProject.class_info.forEach((cls) => {
        const btn = document.createElement('button');
        btn.id = `class-btn-${cls.id}`;
        btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
            cls.id === currentClassId
                ? 'bg-gray-700 ring-2 ring-blue-500 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
        }`;
        btn.innerHTML = `
            <span class="w-3 h-3 rounded-full shrink-0" style="background:${cls.color}"></span>
            <span class="truncate">${cls.name}</span>
            <span class="ml-auto text-xs text-gray-500">[${cls.id}]</span>
        `;
        btn.onclick = () => {
            currentClassId = cls.id;
            renderClassList();
        };
        container.appendChild(btn);
    });
}

// ==================== 功能 1: 切換類別 (Q / E 鍵) ====================
function switchClass(direction) {
    if (!currentProject || !currentProject.class_info || currentProject.class_info.length === 0) return;

    const classes = currentProject.class_info;
    const currentIndex = classes.findIndex(c => c.id === currentClassId);
    let nextIndex = 0;

    if (currentIndex !== -1) {
        nextIndex = (currentIndex + direction + classes.length) % classes.length;
    } else {
        nextIndex = 0; // fallback for first load
    }

    currentClassId = classes[nextIndex].id;
    renderClassList();

    // 自動滾動選中的類別按鈕至可見區域
    const activeBtn = document.getElementById(`class-btn-${currentClassId}`);
    if (activeBtn) {
        activeBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    setStatus(`已切換類別: ${classes[nextIndex].name}`);

    // ---- Update crosshair color immediately after class switch ----
    const newColor = classes[nextIndex].color;
    if (crosshairX && crosshairY) {
        crosshairX.set({ stroke: newColor });
        crosshairY.set({ stroke: newColor });
        canvas.renderAll();
    }
}

// ==================== 圖像載入 ====================
function loadImage(index) {
    if (index < 0 || index >= currentProject.data.length) return;
    
    currentImageIndex = index;
    const imgData = currentProject.data[index];
    const imageUrl = `/api/images/${PROJECT_NAME}/${encodeURIComponent(imgData.image_path)}`;
    
    document.getElementById('loadingOverlay').classList.remove('hidden');
    
    fabric.Image.fromURL(imageUrl, function (img) {
        if (!img || !img.width) {
            document.getElementById('loadingOverlay').classList.add('hidden');
            setStatus('圖片載入失敗');
            return;
        }
        
        originalImageWidth = img.width;
        originalImageHeight = img.height;
        imgData.image_width = originalImageWidth;
        imgData.image_height = originalImageHeight;
        
        const container = document.getElementById('canvasContainer');
        const padding = 40;
        const availW = container.clientWidth - padding;
        const availH = container.clientHeight - padding;
        
        scaleRatio = Math.min(availW / originalImageWidth, availH / originalImageHeight, 1);
        
        const canvasW = Math.floor(originalImageWidth * scaleRatio);
        const canvasH = Math.floor(originalImageHeight * scaleRatio);
        
        canvas.setWidth(canvasW);
        canvas.setHeight(canvasH);
        img.scaleToWidth(canvasW);
        
        canvas.setBackgroundImage(img, () => {
            initCrosshairs();
            loadExistingAnnotations();
            canvas.renderAll();
            document.getElementById('loadingOverlay').classList.add('hidden');
        });
        
        updateImageInfo();
        updateProgress();
        drawingState = 'idle';
        currentRect = null;
    }, { crossOrigin: 'anonymous' });
}

// ==================== 載入已有標註 ====================
function loadExistingAnnotations() {
    // 移除畫布上的標註物件（保留背景與十字準星）
    const objectsToRemove = canvas.getObjects().filter(obj => obj.annotationId);
    objectsToRemove.forEach(obj => canvas.remove(obj));
    
    const imgData = currentProject.data[currentImageIndex];
    if (!imgData || !imgData.labels) return;
    
    imgData.labels.forEach((label) => {
        const cls = currentProject.class_info.find(c => c.id === label.label_class_id);
        if (!cls) return;
        
        const bbox = label.bbox;
        const coords = yoloToCanvas(bbox[0], bbox[1], bbox[2], bbox[3]);
        const annId = label._annId || ('ann_' + (++annotationCounter));
        label._annId = annId;
        
        const rect = new fabric.Rect({
            left: coords.left,
            top: coords.top,
            width: coords.width,
            height: coords.height,
            fill: cls.color + '22',
            stroke: cls.color,
            strokeWidth: 2,
            selectable: false,
            evented: true,
            annotationId: annId,
            classId: cls.id,
        });
        canvas.add(rect);
        
        const text = new fabric.Text(cls.name, {
            left: coords.left,
            top: Math.max(0, coords.top - 18),
            fontSize: 13,
            fill: '#ffffff',
            backgroundColor: cls.color + 'CC',
            padding: 2,
            selectable: false,
            evented: false,
            annotationId: annId,
            visible: showLabels,
        });
        canvas.add(text);
    });
    
    canvas.renderAll();
    updateAnnotationList();
}

// ==================== 繪製與滑鼠事件處理 ====================
function handleMouseDown(opt) {
    const e = opt.e;
    
    // ---- 右鍵取消繪製框 / 刪除已存在的標註框 ----
    if (e.button === 2) {
        e.preventDefault();
        if (drawingState === 'drawing') {
            if (currentRect) canvas.remove(currentRect);
            currentRect = null;
            drawingState = 'idle';
            canvas.renderAll();
            setStatus('已取消繪製框');
        } else {
            const target = opt.target || canvas.findTarget(e, false);
            if (target && target.annotationId) {
                deleteAnnotation(target.annotationId);
            }
        }
        return;
    }
    
    // ---- 左鍵處理：開始繪製 ----
    if (e.button !== 0) return;
    
    if (drawingState === 'idle') {
        if (!opt.target || opt.target === crosshairX || opt.target === crosshairY) {
            const pointer = canvas.getPointer(e);
            startPoint = { x: pointer.x, y: pointer.y };
            const cls = currentProject.class_info.find(c => c.id === currentClassId) || currentProject.class_info[0];
            
            currentRect = new fabric.Rect({
                left: startPoint.x,
                top: startPoint.y,
                width: 0,
                height: 0,
                fill: cls.color + '22',
                stroke: cls.color,
                strokeWidth: 2,
                selectable: false,
                evented: false,
                strokeDashArray: [5, 5], // 繪製中顯示虛線
            });
            canvas.add(currentRect);
            drawingState = 'drawing';
        }
    }
}

// ---- 新增：滑鼠放開時完成繪製 ----
function handleMouseUp(opt) {
    if (drawingState === 'drawing' && currentRect) {
        const pointer = canvas.getPointer(opt.e);
        const endX = pointer.x;
        const endY = pointer.y;
        
        const left = Math.min(startPoint.x, endX);
        const top = Math.min(startPoint.y, endY);
        const width = Math.abs(endX - startPoint.x);
        const height = Math.abs(endY - startPoint.y);

        // 如果框太小，則取消繪製
        if (width < 5 || height < 5) {
            canvas.remove(currentRect);
            currentRect = null;
            drawingState = 'idle';
            canvas.renderAll();
            return;
        }

        // 完成繪製，將虛線改為實線
        currentRect.set({
            left: left,
            top: top,
            width: width,
            height: height,
            strokeDashArray: null,
            evented: true,
        });

        const annId = 'ann_' + (++annotationCounter);
        const cls = currentProject.class_info.find(c => c.id === currentClassId) || currentProject.class_info[0];
        
        currentRect.set('annotationId', annId);
        currentRect.set('classId', cls.id);

        const text = new fabric.Text(cls.name, {
            left: left,
            top: Math.max(0, top - 18),
            fontSize: 13,
            fill: '#ffffff',
            backgroundColor: cls.color + 'CC',
            padding: 2,
            selectable: false,
            evented: false,
            annotationId: annId,
            visible: showLabels,
        });
        canvas.add(text);

        const bbox = canvasToYOLO(left, top, width, height);
        addAnnotationToData(annId, cls.id, bbox);

        currentRect = null;
        drawingState = 'idle';
        isDirty = true;
        
        canvas.renderAll();
        updateAnnotationList();
        setStatus('已新增標註');
    }
}

// ---- 滑鼠移動時更新十字準星與繪製框大小 ----
function handleMouseMove(opt) {
    const pointer = canvas.getPointer(opt.e);
    
    // 更新十字準星位置
    if (crosshairX && crosshairY) {
        crosshairX.set({ x1: 0, y1: pointer.y, x2: canvas.width, y2: pointer.y, visible: true });
        crosshairY.set({ x1: pointer.x, y1: 0, x2: pointer.x, y2: canvas.height, visible: true });
        canvas.bringToFront(crosshairX);
        canvas.bringToFront(crosshairY);
    }

    // 更新繪製中的框大小
    if (drawingState === 'drawing' && currentRect) {
        const left = Math.min(startPoint.x, pointer.x);
        const top = Math.min(startPoint.y, pointer.y);
        const width = Math.abs(pointer.x - startPoint.x);
        const height = Math.abs(pointer.y - startPoint.y);
        currentRect.set({ left, top, width, height });
    }
    
    canvas.renderAll();
}

function handleMouseOut() {
    if (crosshairX && crosshairY) {
        crosshairX.set('visible', false);
        crosshairY.set('visible', false);
        canvas.renderAll();
    }
}

// ==================== 座標換算 ====================
function canvasToYOLO(canvasLeft, canvasTop, canvasWidth, canvasHeight) {
    const absLeft = canvasLeft / scaleRatio;
    const absTop = canvasTop / scaleRatio;
    const absWidth = canvasWidth / scaleRatio;
    const absHeight = canvasHeight / scaleRatio;

    const xCenter = (absLeft + absWidth / 2) / originalImageWidth;
    const yCenter = (absTop + absHeight / 2) / originalImageHeight;
    const normWidth = absWidth / originalImageWidth;
    const normHeight = absHeight / originalImageHeight;

    return [
        parseFloat(Math.max(0, Math.min(1, xCenter)).toFixed(10)),
        parseFloat(Math.max(0, Math.min(1, yCenter)).toFixed(10)),
        parseFloat(Math.max(0, Math.min(1, normWidth)).toFixed(10)),
        parseFloat(Math.max(0, Math.min(1, normHeight)).toFixed(10)),
    ];
}

function yoloToCanvas(xCenter, yCenter, normWidth, normHeight) {
    const absWidth = normWidth * originalImageWidth;
    const absHeight = normHeight * originalImageHeight;
    const absLeft = xCenter * originalImageWidth - absWidth / 2;
    const absTop = yCenter * originalImageHeight - absHeight / 2;

    return {
        left: absLeft * scaleRatio,
        top: absTop * scaleRatio,
        width: absWidth * scaleRatio,
        height: absHeight * scaleRatio,
    };
}

// ==================== 標註數據管理 ====================
function addAnnotationToData(annId, classId, bbox) {
    const cls = currentProject.class_info.find(c => c.id === classId);
    const imgData = currentProject.data[currentImageIndex];
    
    imgData.labels.push({
        label_class_id: classId,
        label_name: cls ? cls.name : 'unknown',
        bbox: bbox,
        _annId: annId,
    });
}

function removeAnnotationFromData(annId) {
    const imgData = currentProject.data[currentImageIndex];
    if (!imgData) return;
    imgData.labels = imgData.labels.filter(l => l._annId !== annId);
}

function deleteAnnotation(annId) {
    const objectsToRemove = canvas.getObjects().filter(
        obj => obj.annotationId === annId
    );
    objectsToRemove.forEach(obj => canvas.remove(obj));
    
    removeAnnotationFromData(annId);
    isDirty = true;
    
    canvas.renderAll();
    updateAnnotationList();
    setStatus('已刪除標註框');
}

// ==================== 導航 ====================
function nextImage() {
    if (drawingState === 'drawing') {
        if (currentRect) canvas.remove(currentRect);
        currentRect = null;
        drawingState = 'idle';
    }
    
    if (currentImageIndex >= currentProject.data.length - 1) {
        saveProject();
        document.getElementById('completeOverlay').classList.remove('hidden');
        return;
    }
    
    saveProject();
    loadImage(currentImageIndex + 1);
}

function prevImage() {
    if (drawingState === 'drawing') {
        if (currentRect) canvas.remove(currentRect);
        currentRect = null;
        drawingState = 'idle';
    }
    
    if (currentImageIndex <= 0) {
        setStatus('已是第一張圖片');
        return;
    }
    
    saveProject();
    loadImage(currentImageIndex - 1);
}

// ==================== 保存 ====================
async function saveProject() {
    if (!currentProject) return;
    
    try {
        const cleanData = JSON.parse(JSON.stringify(currentProject));
        cleanData.data.forEach(img => {
            img.labels.forEach(label => {
                delete label._annId;
            });
        });
        
        const res = await fetch(`/api/project/${PROJECT_NAME}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanData),
        });
        
        if (res.ok) {
            isDirty = false;
            showSaveStatus();
            setStatus('已保存');
        } else {
            setStatus('保存失敗');
        }
    } catch (err) {
        setStatus('保存錯誤: ' + err.message);
    }
}

function showSaveStatus() {
    const el = document.getElementById('saveStatus');
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 2000);
}

// ==================== 導出 ====================
function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('hidden');
}

function exportFormat(format) {
    toggleExportMenu();
    saveProject();
    window.open(`/api/export/${PROJECT_NAME}/${format}`, '_blank');
    setStatus(`正在導出 ${format.toUpperCase()} 格式...`);
}

document.addEventListener('click', function (e) {
    const menu = document.getElementById('exportMenu');
    if (menu && !e.target.closest('.relative')) {
        menu.classList.add('hidden');
    }
});

// ==================== 全局標籤開關 ====================
function toggleLabels() {
    showLabels = !showLabels;
    const btn = document.getElementById('toggleLabelsBtn');
    
    if (showLabels) {
        btn.textContent = '🏷️ 標籤: ON';
        btn.className = 'px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors';
    } else {
        btn.textContent = '🏷️ 標籤: OFF';
        btn.className = 'px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors';
    }
    
    canvas.getObjects().forEach(obj => {
        if (obj.type === 'text' && obj.annotationId) {
            obj.set('visible', showLabels);
        }
    });
    canvas.renderAll();
}

// ==================== 鍵盤快捷鍵 ====================
function setupKeyboardEvents() {
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'q' || e.key === 'Q') {
            e.preventDefault();
            switchClass(-1); // 上一個類別
        } else if (e.key === 'e' || e.key === 'E') {
            e.preventDefault();
            switchClass(1);  // 下一個類別
        } else if (e.key === 'd' || e.key === 'D') {
            e.preventDefault();
            nextImage();
        } else if (e.key === 'a' || e.key === 'A') {
            e.preventDefault();
            prevImage();
        } else if (e.key === 's' || e.key === 'S') {
            e.preventDefault();
            saveProject();
        }
    });

    window.addEventListener('beforeunload', function (e) {
        if (isDirty) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ==================== UI 更新 ====================
function updateImageInfo() {
    const imgData = currentProject.data[currentImageIndex];
    document.getElementById('infoFilename').textContent = imgData.image_path;
    document.getElementById('infoSize').textContent = `${originalImageWidth} × ${originalImageHeight}`;
}

function updateProgress() {
    const total = currentProject.data.length;
    const current = currentImageIndex + 1;
    document.getElementById('infoProgress').textContent = `${current} / ${total}`;
}

function updateAnnotationList() {
    const container = document.getElementById('annotationList');
    const imgData = currentProject.data[currentImageIndex];
    const labels = imgData ? imgData.labels : [];
    
    document.getElementById('annotationCount').textContent = labels.length;
    container.innerHTML = '';
    
    if (labels.length === 0) {
        container.innerHTML = '<p class="text-gray-600 text-sm text-center py-4">暫無標註</p>';
        return;
    }
    
    labels.forEach((label) => {
        const cls = currentProject.class_info.find(c => c.id === label.label_class_id);
        const color = cls ? cls.color : '#888';
        const annId = label._annId || '';
        
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-gray-800 rounded px-2 py-1.5 text-sm group';
        
        // 修改：使用垃圾桶 SVG 圖示，並常駐顯示
        div.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${color}"></span>
                <span class="truncate">${label.label_name}</span>
            </div>
            <button onclick="deleteAnnotation('${annId}')" 
                    class="text-gray-500 hover:text-red-500 transition-colors p-1" 
                    title="刪除標註">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        `;
        container.appendChild(div);
    });
}

function setStatus(text) {
    document.getElementById('statusText').textContent = text;
}