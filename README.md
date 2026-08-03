# 🏷️ Image Annotator v2 - Web-Based Image Annotation Tool

**用途：**  
這是一個用 Flask + Fabric.js 構建的網頁版圖像標註工具，支援 **目標偵測（BBox）** 與 **語義分割（Polygon）** 兩種模式。所有操作均在瀏覽器中完成，無需額外安裝其他軟體。適合用於生成 YOLO、COCO、VOC XML、Mask R-CNN (VGG-VIA) 等主流人工智能數據集格式。

---

## 📋 功能清單
- **專案管理**：建立多個標註專案，每個專案獨立存放圖片與 JSON 配置。
- **雙模式支援**：  
  - `detect`（BBox）：用矩形框標注物體，輸出 YOLO / PASCAL VOC XML 格式。  
  - `segment`（Polygon）：用多邊形描繪輪廓，支援即時拖曳控制點修改形狀。
- **自動化同步**：當圖片資料夾新增/刪除圖片時，專案會自動更新圖片清單並重新計算進度。
- **多種匯出格式**：一鍵打包下載 YOLO TXT、YOLO Segmentation、PASCAL VOC XML、COCO JSON、Mask R-CNN (VIA 格式)。
- **快捷鍵全鍵盤操作**：切換類別、上下翻圖、繪製/刪除標註，無需滑鼠。

---

## 🖥️ 系統需求與安裝

### 環境要求
- Python 3.6+（推薦 3.8+）
- 支援 Canvas API 的現代瀏覽器（Chrome / Edge / Firefox）
- 作業系統：Windows / macOS / Linux 皆可

### 啟動步驟

1. **下載專案檔案**  
   將整個 `Image_Annotator_ver2/` 資料夾解壓縮到任意位置，例如：
   ```
   C:\Users\YourName\Image_Annotator_ver2\
   ```

2. **打開終端機（命令列）**
   - Windows：在該資料夾路徑下按住 `Shift + 右鍵` → 「在此處開啟 PowerShell / 命令提示字元」  
   - Mac/Linux：打開終端機，輸入 `cd /path/to/Image_Annotator_ver2`

3. **安裝 Python 套件**
   ```bash
   pip install -r requirements.txt
   ```
   > 💡 如果找不到 `pip`，請確認已安裝 Python。Windows 可嘗試 `py -m pip install ...`。

4. **啟動服務**
   ```bash
   python app.py
   ```
   當看到類似以下訊息時即代表成功：
   ```
   * Running on http://0.0.0.0:5000 (Press CTRL+C to quit)
   ```

5. **打開瀏覽器使用**  
   在瀏覽器地址欄輸入 `http://localhost:5000`，即可進入主頁。

---

## 🚀 操作流程（新手必看）

### Step 1：建立新專案
1. 在主頁（首頁）看到「📁 創建新項目」區塊。
2. 填寫以下資訊：
   - **專案標註模式**：選 `BBox`（矩形框）或 `Polygon`（多邊形）。
   - **項目名稱**：例如 `my_pet_dataset`，請使用英文/數字。
   - **圖片文件夾路徑（絕對路徑）**：指向存放所有圖片的資料夾（如 `D:/Datasets/images` 或 `/home/user/photos`），此處不能是相對路徑！
   - **類別名稱**：每行一個，例如：
     ```
     dog
     cat
     bird
     ```
3. 點擊 **「創建項目」**。成功後自動跳轉到標註頁面。

> ⚠️ 注意：  
> - `image_folder` 必須是「圖片實際存放的絕對路徑」。如果以後移動了這些圖片的位置，請刪除該專案並重新建立（或手動修改 JSON 裡的 `metadata.image_folder`）。
> - 類別名稱會自動轉為小寫、去除重複，每個類別會分配一組固定顏色。

---

### Step 2：標註圖片
進入 `annotate.html` 後，畫面分為三欄：**左側類別列表** | **中間 Canvas 畫布** | **右側圖片資訊與標籤清單**。

#### 🔵 BBox (detect) 模式操作
- **新增矩形框**：在圖片上按下滑鼠左鍵並拖曳，鬆手即生成一個半透明彩色方框。  
- **切換類別**：按 `Q` / `E`（或點擊左側顏色按鈕），拖曳前請先選好目標類別；畫布上的十字準線會隨之變色。
- **刪除/取消**：在已生成的矩形框上點擊滑鼠右鍵可刪除該標註；若正在繪製時按右鍵，則取消當前繪製動作。

#### 🟣 Polygon (segment) 模式操作
- **新增多邊形**：  
  - **左鍵**：依次點選圖形輪廓上的頂點（至少三個）。  
  - **Space 空白鍵**：閉合多邊形，產生帶填充顏色的多邊形物件。  
  - **Ctrl+Z**：在尚未閉合前，可撤消上一個已新增的頂點（僅在 idle 狀態有效，即未正在拖曳時）。
- **編輯已完成的多邊形**：按住 `Ctrl` + 左鍵點擊已有標註的多邊形，會進入「控制點模式」——每個頂點會出現一個白色圓圈，直接拖曳即可調整形狀。調整後自動更新座標資料。  
- **右鍵**：若正在繪製中按右鍵可取消整個多邊形；已完成的圖形按右鍵則刪除該標註。

#### 圖片切換與進度追蹤
- 使用底部按鈕或鍵盤 `A`（上一張）/ `D`（下一張），系統會自動儲存當前圖片的修改後再切換，防止遺失。  
- 右側面板顯示：檔案名稱、解析度、累計完成比例；點擊清單中的標籤可直接刪除該標註。
- 當所有圖片皆已載入且無未完成繪圖時，會出現「Label Complete」提示畫面（可手動關閉）。

#### 其他實用功能
- **切換標籤顯示**：點擊頂部「🏷️ 標籤: ON/OFF」按鈕可隱藏或顯示文字標籤。
- **儲存**：按 `S` 鍵或頂部「💾 保存」按鈕，標註會寫入 JSON（同時觸發後端自動同步圖片資料夾）。

---

### Step 3：匯出數據集
1. 在標註頁面右上角找到「📤 導出 ▼」下拉選單。  
2. **偵測模式 (BBox)** 可選：`JSON 備份` / `YOLO (BBox)` / `XML (VOC)`  
3. **分割模式 (Polygon)** 可選：`JSON 備份` / `YOLO Segmentation` / `COCO JSON` / `Mask R-CNN (VIA)`  
4. 點擊任一項目即會自動觸發一次儲存，然後在瀏覽器中下載 `.zip` 或 `.json` 檔案。

**各格式說明：**
- **JSON 備份**：專案原始 JSON 結構，可作為數據集直接參考。
- **YOLO (BBox)**：輸出 `classes.txt`（類別名稱）與每張圖片對應的 `.txt`，內含 `[class_id x_center y_center width height]` 歸一化座標。適合 YOLOv3/v5/v7/v8 訓練。
- **XML (VOC)**：PASCAL VOC 標準 XML，含 `<folder>`、`<filename>`、`<size>` 與每個物體的 `<object><bndbox></bndbox></object>`。適合傳統機器學習框架或轉換至 YOLO 格式。
- **YOLO Segmentation**：類似 YOLO BBox 的 txt 格式，但每行包含 `[class_id x1 y1 x2 y2 ...]`（多邊形所有頂點歸一化座標），用於 YOLO-Seg / RTMDet 等分割模型。
- **COCO JSON**：完整的 COCO 結構 JSON，含 `images`、`annotations`（含 segmentation, area, bbox）、`categories`，適合直接訓練 Detectron2、MMDetection 等框架。
- **Mask R-CNN (VIA)**：VGG Image Annotator (VIA) 格式 JSON，支援多邊形標註與標籤屬性，可用於 VGG-MA 工具或轉換為 Mask R-CNN 訓練資料。

---

## ⌨️ 快捷鍵一覽表
| 按鍵 | 功能（偵測模式） | 功能（分割模式） |
|------|----------------|----------------|
| `Q` / `E` | 向前/向後切換類別 | 向前/向後切換類別 |
| `A` / `D` | 上一張/下一張圖片 | 上一張/下一張圖片 |
| `S` | 手動保存專案 JSON | 同上 |
| (左鍵+拖曳) | 繪製矩形框 | — |
| (左鍵+點擊) | — | 新增多邊形頂點 |
| `Space` | — | 閉合多邊形，完成標註 |
| `Ctrl+Z` | — | 取消上一個頂點（需先確保 idle 狀態） |
| (右鍵) | 刪除標註 / 取消繪製 | 刪除標註 / 取消繪製 |
| `Ctrl + 左鍵` | — | 進入控制點編輯模式，拖曳修改形狀 |

---

## 📁 專案資料夾結構說明
```
Image_Annotator_ver2/
├── app.py                 # Flask 主程序（路由、API 接口）
├── config.py              # 配置：PROJECTS_DIR 路徑與允許的圖片副檔名
├── utils.py               # 轉換工具：JSON → YOLO/XML/COCO/VIA，及壓縮打包
├── requirements.txt       # Python 依賴清單（Flask, Werkzeug）
├── .gitignore             # Git 忽略規則（可選）
│
├── static/                # 前端靜態資源
│   ├── css/style.css      # 自定義樣式（光標、滾動條等）
│   └── js/main.js         # 核心前端邏輯（Canvas 操作 + API 互動）
│
├── templates/             # Jinja2 HTML 模板
│   ├── index.html         # 首頁：專案管理與創建表單
│   └── annotate.html      # 標註工作區 UI（三欄佈局 + Canvas）
│
└── projects/              # JSON 專案文件存放目錄（自動生成）
    └── project_20231027.json  （內容見下結構）
```

### 單一 `project_xxx.json` 內部結構
```json
{
  "metadata": {
    "version": "1.0.0",
    "date": "YYYY-MM-DD",
    "image_folder": "/absolute/path/to/images",   // 圖片資料夾的絕對路徑（重要！）
    "mode": "detect"                              // 或 "segment"
  },
  "class_info": [
    {
      "id": 0,
      "name": "dog",
      "color": "#FF2D55"
    }
    ...
  ],
  "data": [
    {
      "id": "1",
      "image_path": "photo.jpg",   // 僅包含檔名，由 metadata.image_folder 拼接
      "image_height": 1080,
      "image_width": 1920,
      "labels": [
        {
          "label_class_id": 0,
          "label_name": "dog",
          "bbox": [0.5, 0.3, 0.4, 0.6]    // detect: x_center y_width height (norm)
          // 或
          "polygon": [[0.2, 0.3], ...]     // segment: normalized vertex list
        }
      ]
    },
    ...
  ]
}
```

---

## 🔧 常見問題與排錯指南
- **圖片無法載入**：請確認 `image_folder` 路徑無誤且 Flask 有讀取權限；檢查瀏覽器開發者控制台的 Network 標籤，看是否返回 404。
- **匯出格式錯誤**：確保專案模式為 detect/segment 後再導出對應的資料集；YOLO BBox 在分割模式下會產生錯誤檔案（請使用 YOLO Seg）。
- **多邊形無法拖曳控制點**：請先按住 `Ctrl`，將游標移至已完成的 Polygon 上點擊左鍵。若無反應，確認滑鼠右鍵未與其他快捷鍵衝突。
- **JSON 損毀導致服務崩潰**：系統內建防禦機制會自動補救（回傳安全結構），但建議定期備份 `projects/` 資料夾。
- **快捷鍵右鍵無法使用**：源於部分瀏覽器的支援問題。若打算刪除標註，請使用畫面右邊的「當前標註」，按下相關標註的垃圾桶按鍵即可刪除。
- **導出後找不到導出文件**：部分瀏覽器的安全防護等級過高，導致無法識別下載的壓縮檔是否安全，建議改用其他瀏覽器進行下載。

**在此重申：此工具導出的只會是.txt或.json的文字檔案，並使用.zip格式進行壓縮，不會包含任何可執行的應用程式。**

---

## 📞 支援
若有任何問題，請檢查是否正確安裝 Python 並執行了 `pip install -r requirements.txt`，或確認 Flask 服務已在 `http://0.0.0.0:5000` 正常運行。  
祝您標註愉快！ 🎉
