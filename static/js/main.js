let canvas = null;
let currentProject = null;
let currentMode = 'detect'; // 'detect' 或 'segment'
let currentImageIndex = 0;
let currentClassId = 0;
let isDirty = false;
let showLabels = true;
let annotationCounter = 0;

// 通用/偵測模式狀態
let drawingState = 'idle'; 
let startPoint = null;
let currentRect = null;
let scaleRatio = 1;
let originalImageWidth = 0;
let originalImageHeight = 0;
let crosshairX = null;
let crosshairY = null;
let isNavigating = false;

// 分割模式專用狀態
let activePolyPoints = [];
let activePolyLines = [];
let activePolyCircles = [];
let activePolyPreviewLine = null;
let activePolygonRef = null;
let vertexControls = []; // 編輯多邊形時的小圓點

document.addEventListener('DOMContentLoaded', function () {
    initCanvas();
    loadProject();
    setupKeyboardEvents();
});

function initCanvas() {
    const container = document.getElementById('canvasContainer');
    canvas = new fabric.Canvas('annotationCanvas', {
        width: container.clientWidth,
        height: container.clientHeight,
        backgroundColor: '#0a0a1a',
        selection: false, // 禁用框選
        preserveObjectStacking: true,
    });
    canvas.on('contextmenu', opt => { opt.e.preventDefault(); return false; });
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('mouse:out', handleMouseOut);
    window.addEventListener('resize', () => {
        if (currentProject && currentProject.data[currentImageIndex]) loadImage(currentImageIndex);
    });
}

function initCrosshairs() {
    if (crosshairX) canvas.remove(crosshairX);
    if (crosshairY) canvas.remove(crosshairY);
    const cClass = currentProject.class_info.find(c => c.id === currentClassId);
    const col = cClass ? cClass.color : '#00ffcc';
    const opts = { stroke: col, strokeWidth: 1, strokeDashArray: [4,4], selectable: false, evented: false, visible: false };
    crosshairX = new fabric.Line([0,0, canvas.width, 0], opts);
    crosshairY = new fabric.Line([0,0, 0, canvas.height], opts);
    canvas.add(crosshairX); canvas.add(crosshairY);
}

async function loadProject() {
    try {
        const res = await fetch(`/api/project/${PROJECT_NAME}`);
        if (!res.ok) throw new Error('Project not found');
        currentProject = await res.json();
        
        currentMode = (currentProject.metadata && currentProject.metadata.mode) ? currentProject.metadata.mode : 'detect';
        document.getElementById('headerProjectName').textContent = PROJECT_NAME;
        document.getElementById('headerProjectMode').textContent = currentMode === 'segment' ? 'Polygon Mode' : 'BBox Mode';
        
        setupModeUI();
        if (currentProject.class_info.length > 0) currentClassId = currentProject.class_info[0].id;
        renderClassList();
        
        if (currentProject.data.length > 0) loadImage(0);
        else setStatus('專案中沒有圖片');
    } catch (err) { setStatus('載入專案失敗: ' + err.message); }
}

function setupModeUI() {
    const hintContainer = document.getElementById('hotkeyHints');
    if (currentMode === 'detect') {
        hintContainer.innerHTML = `
            <p><kbd class="bg-gray-800 px-1 rounded">Q</kbd> / <kbd class="bg-gray-800 px-1 rounded">E</kbd> 切換類別</p>
            <p><kbd class="bg-gray-800 px-1 rounded">A</kbd> / <kbd class="bg-gray-800 px-1 rounded">D</kbd> 切換圖片</p>
            <p><kbd class="bg-gray-800 px-1 rounded">S</kbd> 儲存專案</p>
            <p><kbd class="bg-gray-800 px-1 rounded">右鍵</kbd> 刪除標註 / 取消繪製</p>`;
    } else {
        hintContainer.innerHTML = `
            <p><kbd class="bg-gray-800 px-1 rounded">左鍵</kbd> 添加多邊形頂點</p>
            <p><kbd class="bg-gray-800 px-1 rounded">Space</kbd> 閉合多邊形</p>
            <p><kbd class="bg-gray-800 px-1 rounded">Ctrl+Z</kbd> 復原上一個頂點</p>
            <p><kbd class="bg-gray-800 px-1 rounded">右鍵</kbd> 取消整個多邊形/刪除</p>
            <p><kbd class="bg-gray-800 px-1 rounded">拖曳頂點</kbd> 調整已完成的圖形</p>
            <p><kbd class="bg-gray-800 px-1 rounded">Q / E / A / D / S</kbd> 功能依舊</p>`;
    }

    const exportMenu = document.getElementById('exportMenu');
    if (currentMode === 'detect') {
        exportMenu.innerHTML = `
            <a href="#" onclick="exportFormat('json')" class="block px-4 py-2 hover:bg-gray-700 text-sm">JSON 備份</a>
            <a href="#" onclick="exportFormat('yolo')" class="block px-4 py-2 hover:bg-gray-700 text-sm">YOLO (BBox)</a>
            <a href="#" onclick="exportFormat('xml')" class="block px-4 py-2 hover:bg-gray-700 text-sm">XML (VOC)</a>`;
    } else {
        exportMenu.innerHTML = `
            <a href="#" onclick="exportFormat('json')" class="block px-4 py-2 hover:bg-gray-700 text-sm">JSON 備份</a>
            <a href="#" onclick="exportFormat('yolo_seg')" class="block px-4 py-2 hover:bg-gray-700 text-sm">YOLO Segmentation</a>
            <a href="#" onclick="exportFormat('coco')" class="block px-4 py-2 hover:bg-gray-700 text-sm">COCO JSON</a>
            <a href="#" onclick="exportFormat('mask_rcnn')" class="block px-4 py-2 hover:bg-gray-700 text-sm">Mask R-CNN (VIA)</a>`;
    }
}

function renderClassList() {
    const container = document.getElementById('classList');
    container.innerHTML = '';
    currentProject.class_info.forEach((cls) => {
        const btn = document.createElement('button');
        btn.id = `class-btn-${cls.id}`;
        btn.className = `w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${cls.id === currentClassId ? 'bg-gray-700 ring-2 ring-blue-500 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`;
        btn.innerHTML = `<span class="w-3 h-3 rounded-full shrink-0" style="background:${cls.color}"></span><span class="truncate">${cls.name}</span>`;
        btn.onclick = () => { currentClassId = cls.id; renderClassList(); };
        container.appendChild(btn);
    });
}

function switchClass(dir) {
    if (!currentProject) return;
    const classes = currentProject.class_info;
    const idx = classes.findIndex(c => c.id === currentClassId);
    let nIdx = idx !== -1 ? (idx + dir + classes.length) % classes.length : 0;
    currentClassId = classes[nIdx].id;
    renderClassList();
    if (crosshairX) { crosshairX.set({stroke: classes[nIdx].color}); crosshairY.set({stroke: classes[nIdx].color}); canvas.renderAll(); }
}

function loadImage(index) {
    resetDrawingState();
    if (index < 0 || index >= currentProject.data.length) return;
    currentImageIndex = index;
    const imgData = currentProject.data[index];
    
    document.getElementById('loadingOverlay').classList.remove('hidden');
    fabric.Image.fromURL(`/api/images/${PROJECT_NAME}/${encodeURIComponent(imgData.image_path)}`, function (img) {
        if (!img) { setStatus('圖片載入失敗'); return; }
        originalImageWidth = img.width; originalImageHeight = img.height;
        imgData.image_width = originalImageWidth; imgData.image_height = originalImageHeight;
        
        const availW = document.getElementById('canvasContainer').clientWidth - 40;
        const availH = document.getElementById('canvasContainer').clientHeight - 40;
        scaleRatio = Math.min(availW/originalImageWidth, availH/originalImageHeight, 1);
        
        canvas.setWidth(Math.floor(originalImageWidth * scaleRatio));
        canvas.setHeight(Math.floor(originalImageHeight * scaleRatio));
        img.scaleToWidth(canvas.width);
        
        canvas.setBackgroundImage(img, () => {
            initCrosshairs(); loadExistingAnnotations();
            document.getElementById('loadingOverlay').classList.add('hidden');
        });
        updateImageInfo(); updateProgress();
    }, { crossOrigin: 'anonymous' });
}

function loadExistingAnnotations() {
    canvas.getObjects().filter(o => o.annotationId).forEach(o => canvas.remove(o));
    const imgData = currentProject.data[currentImageIndex];
    if (!imgData || !imgData.labels) return;
    
    imgData.labels.forEach(label => {
        const cls = currentProject.class_info.find(c => c.id === label.label_class_id);
        if (!cls) return;
        
        const annId = label._annId || ('ann_' + (++annotationCounter));
        label._annId = annId;

        if (currentMode === 'detect' && label.bbox) {
            const coords = yoloToCanvas(label.bbox[0], label.bbox[1], label.bbox[2], label.bbox[3]);
            const rect = new fabric.Rect({ left: coords.left, top: coords.top, width: coords.width, height: coords.height, fill: cls.color+'22', stroke: cls.color, strokeWidth: 2, selectable: false, evented: false, annotationId: annId, classId: cls.id });
            canvas.add(rect);
            addLabelText(cls, coords.left, coords.top, annId);
        } else if (currentMode === 'segment' && label.polygon) {
            const pts = label.polygon.map(p => ({ x: p[0] * originalImageWidth * scaleRatio, y: p[1] * originalImageHeight * scaleRatio }));
            const poly = new fabric.Polygon(pts, { fill: cls.color+'33', stroke: cls.color, strokeWidth: 2, selectable: false, evented: false, annotationId: annId, classId: cls.id, objectCaching: false });
            canvas.add(poly);
            
            const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
            addLabelText(cls, minX, minY, annId);
        }
    });
    canvas.renderAll(); updateAnnotationList();
}

function addLabelText(cls, left, top, annId) {
    const text = new fabric.Text(cls.name, { left: left, top: Math.max(0, top - 18), fontSize: 13, fill: '#fff', backgroundColor: cls.color+'CC', padding: 2, selectable: false, evented: false, annotationId: annId, visible: showLabels });
    canvas.add(text);
}

// ========== 滑鼠與繪製邏輯 ==========
function handleMouseDown(opt) {
    const e = opt.e;
    const target = opt.target;

    if (e.button === 2) { // 右鍵
        e.preventDefault();
        if (currentMode === 'detect' && drawingState === 'drawing') {
            canvas.remove(currentRect); currentRect = null; drawingState = 'idle'; canvas.renderAll(); setStatus('已取消繪製');
        } else if (currentMode === 'segment' && drawingState === 'drawing_poly') {
            cancelPolygonDrawing();
        } else if (target && target.annotationId && !target.isControlCircle) {
            deleteAnnotation(target.annotationId);
        }
        return;
    }
    
    if (e.button !== 0) return; // 只處理左鍵

    const pointer = canvas.getPointer(e);

    // Segment 編輯模式：點擊多邊形本體
    if (currentMode === 'segment' && drawingState === 'idle') {
        if (target && target.type === 'polygon') {
            enablePolygonEdit(target); return;
        } else if (!target || (target && !target.isControlCircle)) {
            disablePolygonEdit();
        }
    }

    if (currentMode === 'detect') {
        if (drawingState === 'idle' && (!target || target === crosshairX || target === crosshairY)) {
            startPoint = { x: pointer.x, y: pointer.y };
            const cls = currentProject.class_info.find(c => c.id === currentClassId);
            currentRect = new fabric.Rect({ left: startPoint.x, top: startPoint.y, width: 0, height: 0, fill: cls.color+'22', stroke: cls.color, strokeWidth: 2, selectable: false, evented: false, strokeDashArray: [5,5] });
            canvas.add(currentRect); drawingState = 'drawing';
        }
    } else if (currentMode === 'segment') {
        if (drawingState === 'idle' && (!target || target === crosshairX || target === crosshairY)) {
            drawingState = 'drawing_poly';
            activePolyPoints = [];
        }
        if (drawingState === 'drawing_poly') {
            addPolygonPoint(pointer);
        }
    }
}

function handleMouseMove(opt) {
    const pointer = canvas.getPointer(opt.e);
    if (crosshairX) {
        crosshairX.set({ y1: pointer.y, y2: pointer.y, visible: true });
        crosshairY.set({ x1: pointer.x, x2: pointer.x, visible: true });
        canvas.bringToFront(crosshairX); canvas.bringToFront(crosshairY);
    }
    
    if (currentMode === 'detect' && drawingState === 'drawing' && currentRect) {
        currentRect.set({ left: Math.min(startPoint.x, pointer.x), top: Math.min(startPoint.y, pointer.y), width: Math.abs(pointer.x - startPoint.x), height: Math.abs(pointer.y - startPoint.y) });
    } else if (currentMode === 'segment' && drawingState === 'drawing_poly' && activePolyPoints.length > 0) {
        const lastPt = activePolyPoints[activePolyPoints.length - 1];
        if (!activePolyPreviewLine) {
            const cls = currentProject.class_info.find(c => c.id === currentClassId);
            activePolyPreviewLine = new fabric.Line([lastPt.x, lastPt.y, pointer.x, pointer.y], { stroke: cls.color, strokeWidth: 2, strokeDashArray: [5,5], selectable: false, evented: false });
            canvas.add(activePolyPreviewLine);
        } else {
            activePolyPreviewLine.set({ x1: lastPt.x, y1: lastPt.y, x2: pointer.x, y2: pointer.y });
        }
    }
    canvas.renderAll();
}

function handleMouseUp(opt) {
    if (currentMode === 'detect' && drawingState === 'drawing' && currentRect) {
        const p = canvas.getPointer(opt.e);
        const w = Math.abs(p.x - startPoint.x), h = Math.abs(p.y - startPoint.y);
        if (w < 5 || h < 5) { canvas.remove(currentRect); currentRect = null; drawingState = 'idle'; canvas.renderAll(); return; }
        
        currentRect.set({ strokeDashArray: null, evented: true });
        const annId = 'ann_' + (++annotationCounter);
        const cls = currentProject.class_info.find(c => c.id === currentClassId);
        currentRect.set('annotationId', annId); currentRect.set('classId', cls.id);
        
        addLabelText(cls, currentRect.left, currentRect.top, annId);
        addAnnotationToData(annId, cls.id, canvasToYOLO(currentRect.left, currentRect.top, w, h));
        
        currentRect = null; drawingState = 'idle'; isDirty = true;
        canvas.renderAll(); updateAnnotationList(); setStatus('已新增標註');
    }
}

function handleMouseOut() {
    if (crosshairX) { crosshairX.set('visible', false); crosshairY.set('visible', false); canvas.renderAll(); }
}

// ========== 分割專用邏輯 ==========
function addPolygonPoint(pointer) {
    const cls = currentProject.class_info.find(c => c.id === currentClassId);
    const pt = { x: pointer.x, y: pointer.y };
    activePolyPoints.push(pt);

    const circle = new fabric.Circle({ left: pt.x, top: pt.y, radius: 4, fill: cls.color, originX: 'center', originY: 'center', selectable: false, evented: false });
    activePolyCircles.push(circle);
    canvas.add(circle);

    if (activePolyPoints.length > 1) {
        const prev = activePolyPoints[activePolyPoints.length - 2];
        const line = new fabric.Line([prev.x, prev.y, pt.x, pt.y], { stroke: cls.color, strokeWidth: 2, selectable: false, evented: false });
        activePolyLines.push(line);
        canvas.add(line);
    }
}

function undoLastPolygonPoint() {
    if (activePolyPoints.length === 0) return;
    activePolyPoints.pop();
    canvas.remove(activePolyCircles.pop());
    if (activePolyLines.length > 0) canvas.remove(activePolyLines.pop());
    if (activePolyPoints.length === 0) {
        cancelPolygonDrawing();
    } else if (activePolyPreviewLine) {
        const last = activePolyPoints[activePolyPoints.length - 1];
        activePolyPreviewLine.set({ x1: last.x, y1: last.y });
        canvas.renderAll();
    }
}

function cancelPolygonDrawing() {
    activePolyCircles.forEach(c => canvas.remove(c));
    activePolyLines.forEach(l => canvas.remove(l));
    if (activePolyPreviewLine) canvas.remove(activePolyPreviewLine);
    activePolyPoints = []; activePolyCircles = []; activePolyLines = []; activePolyPreviewLine = null;
    drawingState = 'idle';
    canvas.renderAll();
}

function finishPolygon() {
    if (activePolyPoints.length < 3) { setStatus('多邊形至少需要3個頂點'); return; }
    const cls = currentProject.class_info.find(c => c.id === currentClassId);
    const pts = [...activePolyPoints]; // clone
    cancelPolygonDrawing();

    const annId = 'ann_' + (++annotationCounter);
    const poly = new fabric.Polygon(pts, { fill: cls.color+'33', stroke: cls.color, strokeWidth: 2, selectable: false, evented: true, annotationId: annId, classId: cls.id, objectCaching: false });
    canvas.add(poly);
    
    const minX = Math.min(...pts.map(p => p.x)), minY = Math.min(...pts.map(p => p.y));
    addLabelText(cls, minX, minY, annId);
    
    const normPts = pts.map(p => [ p.x / (originalImageWidth * scaleRatio), p.y / (originalImageHeight * scaleRatio) ]);
    addAnnotationToData(annId, cls.id, null, normPts);
    
    isDirty = true; canvas.renderAll(); updateAnnotationList(); setStatus('已新增多邊形');
}

// 多邊形編輯邏輯 (拖曳頂點)
function enablePolygonEdit(polygon) {
    disablePolygonEdit();
    activePolygonRef = polygon;
    const pts = polygon.get('points');
    const matrix = polygon.calcTransformMatrix();
    
    pts.forEach((pt, idx) => {
        const abs = fabric.util.transformPoint({x: pt.x, y: pt.y}, matrix);
        const ctrl = new fabric.Circle({ left: abs.x, top: abs.y, radius: 5, fill: '#ffffff', stroke: '#ff0000', strokeWidth: 2, originX: 'center', originY: 'center', hasControls: false, hasBorders: false, selectable: true, evented: true, isControlCircle: true });
        
        ctrl.on('moving', function() {
            const inverted = fabric.util.invertTransform(polygon.calcTransformMatrix());
            const newPt = fabric.util.transformPoint({x: ctrl.left, y: ctrl.top}, inverted);
            polygon.points[idx].x = newPt.x;
            polygon.points[idx].y = newPt.y;
            polygon.setCoords();
            canvas.renderAll();
            
            // 同步更新 JSON Data
            const normPts = polygon.points.map(p => {
                const absP = fabric.util.transformPoint(p, polygon.calcTransformMatrix());
                return [ absP.x / (originalImageWidth * scaleRatio), absP.y / (originalImageHeight * scaleRatio) ];
            });
            updatePolygonData(polygon.annotationId, normPts);
            isDirty = true;
        });
        canvas.add(ctrl); vertexControls.push(ctrl);
    });
    canvas.bringToFront(polygon); vertexControls.forEach(c => canvas.bringToFront(c));
    canvas.renderAll();
}
function disablePolygonEdit() {
    vertexControls.forEach(c => canvas.remove(c));
    vertexControls = []; activePolygonRef = null;
    canvas.renderAll();
}
function updatePolygonData(annId, newNormPts) {
    const imgData = currentProject.data[currentImageIndex];
    const lbl = imgData.labels.find(l => l._annId === annId);
    if (lbl) lbl.polygon = newNormPts;
}

// ========== 座標與數據 ==========
function canvasToYOLO(left, top, w, h) {
    const xC = (left/scaleRatio + (w/scaleRatio)/2) / originalImageWidth;
    const yC = (top/scaleRatio + (h/scaleRatio)/2) / originalImageHeight;
    return [xC, yC, w/scaleRatio/originalImageWidth, h/scaleRatio/originalImageHeight].map(v => parseFloat(Math.max(0, Math.min(1, v)).toFixed(6)));
}
function yoloToCanvas(xC, yC, nW, nH) {
    const absW = nW * originalImageWidth, absH = nH * originalImageHeight;
    return { left: (xC * originalImageWidth - absW/2)*scaleRatio, top: (yC * originalImageHeight - absH/2)*scaleRatio, width: absW*scaleRatio, height: absH*scaleRatio };
}

function addAnnotationToData(annId, classId, bbox = null, polygon = null) {
    const cls = currentProject.class_info.find(c => c.id === classId);
    const lbl = { label_class_id: classId, label_name: cls ? cls.name : 'unknown', _annId: annId };
    if (bbox) lbl.bbox = bbox;
    if (polygon) lbl.polygon = polygon;
    currentProject.data[currentImageIndex].labels.push(lbl);
}
function deleteAnnotation(annId) {
    disablePolygonEdit();
    canvas.getObjects().filter(o => o.annotationId === annId).forEach(o => canvas.remove(o));
    currentProject.data[currentImageIndex].labels = currentProject.data[currentImageIndex].labels.filter(l => l._annId !== annId);
    isDirty = true; canvas.renderAll(); updateAnnotationList(); setStatus('已刪除');
}

function resetDrawingState() {
    if (currentMode === 'detect' && currentRect) { canvas.remove(currentRect); currentRect = null; }
    if (currentMode === 'segment') { cancelPolygonDrawing(); disablePolygonEdit(); }
    drawingState = 'idle';
}

function nextImage() {
    if (isNavigating) return; // 防快速點擊造成多個並行流程
    isNavigating = true;
    resetDrawingState();

    saveProject().then(success => {
        if (!success) {
            setStatus('⚠️ 保存失敗，無法切換');
            isNavigating = false;
            return;
        }
        if (currentImageIndex >= currentProject.data.length - 1) {
            // 已是最後一張圖
            document.getElementById('completeOverlay').classList.remove('hidden');
        } else {
            loadImage(currentImageIndex + 1);
        }
        isNavigating = false;
    });
}

function prevImage() {
    if (isNavigating) return;
    isNavigating = true;
    resetDrawingState();

    saveProject().then(success => {
        if (!success) {
            setStatus('⚠️ 保存失敗，無法切換');
            isNavigating = false;
            return;
        }
        if (currentImageIndex <= 0) {
            // 已是第一張圖，不需切換
        } else {
            loadImage(currentImageIndex - 1);
        }
        isNavigating = false;
    });
}


async function saveProject() {
    if (!currentProject) return false;
    try {
        const clean = JSON.parse(JSON.stringify(currentProject));
        // 移除內部使用的 _annId，避免序列化到後端
        clean.data.forEach(img => img.labels.forEach(lbl => delete lbl._annId));

        const res = await fetch(`/api/project/${PROJECT_NAME}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(clean)
        });

        if (res.ok) {
            isDirty = false;
            document.getElementById('saveStatus').classList.remove('hidden');
            setTimeout(() => document.getElementById('saveStatus').classList.add('hidden'), 2000);
            setStatus('✓ 已保存');
            return true;   // ← 成功回傳 true
        } else {
            // 可根據實際 API 錯誤訊息做更詳細的處理
            console.error('Save failed with status:', res.status);
            return false;
        }
    } catch (e) {
        console.error('Save error:', e);
        setStatus('⚠️ 儲存時發生網路或編碼錯誤');
        return false;
    }
}


function toggleExportMenu() { document.getElementById('exportMenu').classList.toggle('hidden'); }
function exportFormat(fmt) { toggleExportMenu(); saveProject(); window.open(`/api/export/${PROJECT_NAME}/${fmt}`, '_blank'); }
document.addEventListener('click', e => { if (!e.target.closest('.relative')) document.getElementById('exportMenu')?.classList.add('hidden'); });

function toggleLabels() {
    showLabels = !showLabels;
    document.getElementById('toggleLabelsBtn').textContent = showLabels ? '🏷️ 標籤: ON' : '🏷️ 標籤: OFF';
    document.getElementById('toggleLabelsBtn').className = showLabels ? 'px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium transition-colors' : 'px-3 py-1.5 bg-gray-600 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors';
    canvas.getObjects().filter(o => o.type === 'text' && o.annotationId).forEach(o => o.set('visible', showLabels));
    canvas.renderAll();
}

function setupKeyboardEvents() {
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        const k = e.key.toLowerCase();
        
        if ((e.ctrlKey || e.metaKey) && k === 'z') {
            if (currentMode === 'segment' && drawingState === 'drawing_poly') { e.preventDefault(); undoLastPolygonPoint(); }
        } else if (e.key === ' ') {
            if (currentMode === 'segment' && drawingState === 'drawing_poly') { e.preventDefault(); finishPolygon(); }
        } else if (k === 'q') { e.preventDefault(); switchClass(-1); }
        else if (k === 'e') { e.preventDefault(); switchClass(1); }
        else if (k === 'd') { e.preventDefault(); nextImage(); }
        else if (k === 'a') { e.preventDefault(); prevImage(); }
        else if (k === 's') { e.preventDefault(); saveProject(); }
    });
    window.addEventListener('beforeunload', e => { if (isDirty) e.preventDefault(); e.returnValue=''; });
}

function updateImageInfo() {
    document.getElementById('infoFilename').textContent = currentProject.data[currentImageIndex].image_path;
    document.getElementById('infoSize').textContent = `${originalImageWidth} × ${originalImageHeight}`;
}
function updateProgress() { document.getElementById('infoProgress').textContent = `${currentImageIndex + 1} / ${currentProject.data.length}`; }
function updateAnnotationList() {
    const c = document.getElementById('annotationList');
    const lbls = currentProject.data[currentImageIndex] ? currentProject.data[currentImageIndex].labels : [];
    document.getElementById('annotationCount').textContent = lbls.length; c.innerHTML = '';
    lbls.forEach(lbl => {
        const cls = currentProject.class_info.find(x => x.id === lbl.label_class_id);
        const div = document.createElement('div');
        div.className = 'flex items-center justify-between bg-gray-800 rounded px-2 py-1.5 text-sm group';
        div.innerHTML = `<div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${cls?cls.color:'#888'}"></span><span class="truncate">${lbl.label_name}</span></div><button onclick="deleteAnnotation('${lbl._annId}')" class="text-gray-500 hover:text-red-500 transition-colors p-1"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>`;
        c.appendChild(div);
    });
}
function setStatus(t) { document.getElementById('statusText').textContent = t; }