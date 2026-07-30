import os
import json
from datetime import datetime
from flask import (
    Flask, abort, render_template, request, jsonify,
    send_from_directory, redirect, url_for, send_file
)
from werkzeug.utils import secure_filename
from config import BASE_DIR, PROJECTS_DIR, ALLOWED_EXTENSIONS
from utils import (
    json_to_yolo, json_to_xml, create_zip, 
    json_to_yolo_seg, json_to_coco, json_to_mask_rcnn
)

app = Flask(__name__)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_image_files(folder_path):
    if not os.path.isdir(folder_path):
        return []
    files = []
    for f in sorted(os.listdir(folder_path)):
        if allowed_file(f):
            files.append(f)
    return files

def sync_project_with_folder(project_name):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return None
    
    # 增加防禦性讀取，防止 JSON 檔案因意外中斷而損毀導致整個系統 500 崩潰
    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, Exception) as e:
        print(f"[Warning] Project JSON corrupted for {project_name}: {e}. Attempting recovery...")
        # 如果損毀，返回一個基本的安全結構，避免崩潰
        return {
            "metadata": {"version": "1.0.0", "mode": "detect"},
            "class_info": [],
            "data": []
        }
        
    # 保證向前兼容，默認為 detect
    if 'mode' not in data.get('metadata', {}):
        data.setdefault('metadata', {})['mode'] = 'detect'

    image_folder = data.get('metadata', {}).get('image_folder', '')
    if image_folder and os.path.isdir(image_folder):
        current_files = get_image_files(image_folder)
        existing_paths = {item['image_path'] for item in data.get('data', [])}
        current_paths_set = set(current_files)
        
        if current_paths_set != existing_paths:
            new_data = []
            for f in current_files:
                if f in existing_paths:
                    original_item = next(item for item in data['data'] if item['image_path'] == f)
                    new_data.append(original_item)
                else:
                    new_data.append({
                        'id': str(len(new_data) + 1),
                        'image_path': f,
                        'image_height': 0,
                        'image_width': 0,
                        'labels': []
                    })
            data['data'] = new_data
            try:
                with open(project_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
            except Exception as write_err:
                print(f"[Error] Failed to save synced project: {write_err}")
                
    return data

@app.route('/')
def index():
    projects = []
    if os.path.isdir(PROJECTS_DIR):
        for f in sorted(os.listdir(PROJECTS_DIR)):
            if f.endswith('.json'):
                project_file = os.path.join(PROJECTS_DIR, f)
                try:
                    with open(project_file, 'r', encoding='utf-8') as fh:
                        data = json.load(fh)
                    mode = data.get('metadata', {}).get('mode', 'detect')
                    mode_text = 'BBox' if mode == 'detect' else 'Polygon'
                except Exception:
                    mode_text = ''
                projects.append({'name': f.replace('.json', ''), 'mode': mode_text})
    return render_template('index.html', projects=projects)


@app.route('/annotate/<project_name>')
def annotate(project_name):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    if not os.path.exists(project_file):
        return redirect(url_for('index'))
    return render_template('annotate.html', project_name=project_name)

@app.route('/api/project/create', methods=['POST'])
def create_project():
    data = request.json or {}
    project_name = data.get('project_name', '').strip()
    image_folder = data.get('image_folder', '').strip().replace('\\', '/')
    classes = data.get('classes', [])
    mode = data.get('mode', 'detect')

    if not project_name or not image_folder or not classes:
        return jsonify({'error': 'Missing required fields'}), 400
    if not os.path.isdir(image_folder):
        return jsonify({'error': f'Image folder not found: {image_folder}'}), 400

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
                'id': len(unique_classes), 'name': lower_name, 'color': colors[len(unique_classes) % len(colors)]
            })

    image_files = get_image_files(image_folder)
    project_data = {
        'metadata': {
            'version': '1.0.0',
            'date': datetime.now().strftime('%Y-%m-%d'),
            'image_folder': image_folder,
            'mode': mode
        },
        'class_info': unique_classes,
        'data': []
    }

    for i, img_file in enumerate(image_files):
        project_data['data'].append({
            'id': str(i + 1), 'image_path': img_file, 'image_height': 0, 'image_width': 0, 'labels': []
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
    data = sync_project_with_folder(project_name)
    if data is None: return jsonify({'error': 'Project not found'}), 404
    return jsonify(data)

@app.route('/api/project/<project_name>/save', methods=['POST'])
def save_project(project_name):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    data = request.json
    with open(project_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return jsonify({'success': True})

@app.route('/api/images/<project_name>/<path:filename>')
def serve_image(project_name, filename):
    project_file = os.path.join(PROJECTS_DIR, f'{project_name}.json')
    try:
        with open(project_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"[Warning] serve_image: JSON corrupted or missing for {project_name}: {e}")
        return abort(404, description="Project configuration is corrupted or missing.")
    except Exception as e:
        print(f"[Error] serve_image: Unexpected error reading {project_name}: {e}")
        return abort(500, description="Internal server error while reading project config.")

    image_folder = data.get('metadata', {}).get('image_folder', '')
    
    if not image_folder or not os.path.isdir(image_folder):
        print(f"[Warning] serve_image: image_folder is invalid or missing for {project_name}: '{image_folder}'")
        return abort(404, description="Image folder not found in project configuration.")
    
    return send_from_directory(image_folder, filename)

# ========== 導出 APIs ==========
@app.route('/api/export/<project_name>/yolo')
def export_yolo(project_name):
    data = sync_project_with_folder(project_name)
    zip_io = create_zip(json_to_yolo(data))
    return send_file(zip_io, mimetype='application/zip', as_attachment=True, download_name=f'{project_name}_yolo.zip')

@app.route('/api/export/<project_name>/xml')
def export_xml(project_name):
    data = sync_project_with_folder(project_name)
    zip_io = create_zip(json_to_xml(data))
    return send_file(zip_io, mimetype='application/zip', as_attachment=True, download_name=f'{project_name}_xml.zip')

@app.route('/api/export/<project_name>/json')
def export_json(project_name):
    sync_project_with_folder(project_name)
    return send_file(os.path.join(PROJECTS_DIR, f'{project_name}.json'), mimetype='application/json', as_attachment=True)

@app.route('/api/export/<project_name>/yolo_seg')
def export_yolo_seg(project_name):
    data = sync_project_with_folder(project_name)
    zip_io = create_zip(json_to_yolo_seg(data))
    return send_file(zip_io, mimetype='application/zip', as_attachment=True, download_name=f'{project_name}_yolo_seg.zip')

@app.route('/api/export/<project_name>/coco')
def export_coco(project_name):
    data = sync_project_with_folder(project_name)
    zip_io = create_zip(json_to_coco(data))
    return send_file(zip_io, mimetype='application/zip', as_attachment=True, download_name=f'{project_name}_coco.zip')

@app.route('/api/export/<project_name>/mask_rcnn')
def export_mask_rcnn(project_name):
    data = sync_project_with_folder(project_name)
    zip_io = create_zip(json_to_mask_rcnn(data))
    return send_file(zip_io, mimetype='application/zip', as_attachment=True, download_name=f'{project_name}_mask_rcnn_via.zip')

if __name__ == '__main__':
    app.run(debug=True, port=5000, host='0.0.0.0')