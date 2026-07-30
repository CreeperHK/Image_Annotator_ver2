import os
import json
from datetime import datetime
from flask import (
    Flask, render_template, request, jsonify,
    send_from_directory, redirect, url_for, send_file
)
from werkzeug.utils import secure_filename
from config import BASE_DIR, PROJECTS_DIR, ALLOWED_EXTENSIONS
from utils import json_to_yolo, json_to_xml, create_zip

app = Flask(__name__)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_image_files(folder_path):
    """掃描資料夾，傳回支援的圖片檔案清單（已排序）"""
    if not os.path.isdir(folder_path):
        return []
    files = []
    for f in sorted(os.listdir(folder_path)):
        if allowed_file(f):
            files.append(f)
    return files

# ==================== 核心同步邏輯 ====================
def sync_project_with_folder(project_name):
    """動態同步專案 JSON 與圖片資料夾，確保新增/刪除的圖片能即時反映"""
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return None
    
    with open(project_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    image_folder = data.get('metadata', {}).get('image_folder', '')
    if image_folder and os.path.isdir(image_folder):
        current_files = get_image_files(image_folder)
        existing_paths = {item['image_path'] for item in data.get('data', [])}
        current_paths_set = set(current_files)
        
        # 如果資料夾內的圖片與 JSON 記錄不一致，則進行同步
        if current_paths_set != existing_paths:
            new_data = []
            for f in current_files:
                if f in existing_paths:
                    # 保留原有圖片的標註資訊
                    original_item = next(item for item in data['data'] if item['image_path'] == f)
                    new_data.append(original_item)
                else:
                    # 新增的圖片，初始化空白標註
                    new_data.append({
                        'id': str(len(new_data) + 1),
                        'image_path': f,
                        'image_height': 0,
                        'image_width': 0,
                        'labels': []
                    })
            
            data['data'] = new_data
            
            # 將同步後的結果寫回 JSON 檔案，修正輸出的 JSON 內容
            with open(project_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
    return data

# ==================== 頁面路由 ====================
@app.route('/')
def index():
    projects = []
    if os.path.isdir(PROJECTS_DIR):
        for f in sorted(os.listdir(PROJECTS_DIR)):
            if f.endswith('.json'):
                projects.append(f.replace('.json', ''))
    return render_template('index.html', projects=projects)

@app.route('/annotate/<project_name>')
def annotate(project_name):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return redirect(url_for('index'))
    return render_template('annotate.html', project_name=project_name)

# ==================== API 路由 ====================
@app.route('/api/project/create', methods=['POST'])
def create_project():
    data = request.json or {}
    project_name = data.get('project_name', '').strip()
    image_folder = data.get('image_folder', '').strip().replace('\\', '/')
    classes = data.get('classes', [])

    if not project_name or not image_folder or not classes:
        return jsonify({'error': 'Missing required fields'}), 400

    if not os.path.isdir(image_folder):
        return jsonify({'error': f'Image folder not found: {image_folder}'}), 400

    # 去重類別（不區分大小寫）
    seen = set()
    unique_classes = []
    colors = [
        '#FF2D55',  # Red / Pink
        '#FF3B30',  # Bright Red
        '#FF9500',  # Orange
        '#FFCC00',  # Yellow
        '#30D158',  # Green
        '#00C7BE',  # Teal / Cyan
        '#007AFF',  # Blue
        '#5E5CE6',  # Indigo
        '#AF52DE',  # Purple
        '#FF6482',  # Soft Pink / Red
    ]
    for cls_name in classes:
        lower_name = cls_name.lower().strip()
        if lower_name and lower_name not in seen:
            seen.add(lower_name)
            unique_classes.append({
                'id': len(unique_classes),
                'name': lower_name,
                'color': colors[len(unique_classes) % len(colors)]
            })

    if not unique_classes:
        return jsonify({'error': 'No valid class names provided'}), 400

    image_files = get_image_files(image_folder)
    if not image_files:
        return jsonify({'error': 'No supported images found in the folder'}), 400

    project_data = {
        'metadata': {
            'version': '1.0.0',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'image_folder': image_folder
        },
        'class_info': unique_classes,
        'data': []
    }

    for i, img_file in enumerate(image_files):
        project_data['data'].append({
            'id': str(i + 1),
            'image_path': img_file,
            'image_height': 0,
            'image_width': 0,
            'labels': []
        })

    safe_name = secure_filename(project_name) or f"project_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    project_file = os.path.join(PROJECTS_DIR, f'{safe_name}.json')
    
    counter = 1
    while os.path.exists(project_file):
        safe_name = f"{secure_filename(project_name)}_{counter}"
        project_file = os.path.join(PROJECTS_DIR, f'{safe_name}.json')
        counter += 1

    with open(project_file, 'w', encoding='utf-8') as f:
        json.dump(project_data, f, ensure_ascii=False, indent=2)

    return jsonify({'success': True, 'project_name': safe_name})

@app.route('/api/project/<project_name>', methods=['GET'])
def get_project(project_name):
    # 載入時自動同步資料夾最新圖片
    data = sync_project_with_folder(project_name)
    if data is None:
        return jsonify({'error': 'Project not found'}), 404
    return jsonify(data)

@app.route('/api/project/<project_name>/save', methods=['POST'])
def save_project(project_name):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return jsonify({'error': 'Project not found'}), 404

    data = request.json
    if not data or 'data' not in data:
        return jsonify({'error': 'Invalid payload'}), 400

    # 寫入更新後的 JSON 資料（包含最新標註與刪除狀態）
    with open(project_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    return jsonify({'success': True})

@app.route('/api/images/<project_name>/<path:filename>')
def serve_image(project_name, filename):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return jsonify({'error': 'Project not found'}), 404

    with open(project_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    image_folder = data.get('metadata', {}).get('image_folder', '')
    if not image_folder or not os.path.isdir(image_folder):
        return jsonify({'error': 'Image folder not found'}), 404

    return send_from_directory(image_folder, filename)

@app.route('/api/export/<project_name>/yolo')
def export_yolo(project_name):
    # 導出前自動同步，確保輸出的 ZIP 包含最新圖片的標註
    data = sync_project_with_folder(project_name)
    if data is None:
        return jsonify({'error': 'Project not found'}), 404
        
    yolo_files = json_to_yolo(data)
    zip_io = create_zip(yolo_files)
    return send_file(
        zip_io, mimetype='application/zip',
        as_attachment=True, download_name=f'{project_name}_yolo.zip'
    )

@app.route('/api/export/<project_name>/xml')
def export_xml(project_name):
    data = sync_project_with_folder(project_name)
    if data is None:
        return jsonify({'error': 'Project not found'}), 404
        
    xml_files = json_to_xml(data)
    zip_io = create_zip(xml_files)
    return send_file(
        zip_io, mimetype='application/zip',
        as_attachment=True, download_name=f'{project_name}_xml.zip'
    )

@app.route('/api/export/<project_name>/json')
def export_json(project_name):
    data = sync_project_with_folder(project_name)
    if data is None:
        return jsonify({'error': 'Project not found'}), 404
        
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    return send_file(
        project_file, mimetype='application/json',
        as_attachment=True, download_name=f'{project_name}.json'
    )

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')