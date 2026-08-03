import os
import io
import json
import zipfile
from xml.etree.ElementTree import Element, SubElement, ElementTree, indent

# (保留舊的 json_to_yolo 和 json_to_xml)
def json_to_yolo(project_data):
    results = {}
    for img_data in project_data.get('data', []):
        filename = os.path.splitext(os.path.basename(img_data.get('image_path', '')))[0]
        lines = []
        for label in img_data.get('labels', []):
            if 'bbox' not in label: continue
            class_id = label['label_class_id']
            bbox = label['bbox']
            lines.append(f"{class_id} {bbox[0]:.10f} {bbox[1]:.10f} {bbox[2]:.10f} {bbox[3]:.10f}")
        results[f"{filename}.txt"] = '\n'.join(lines)
    classes = [c['name'] for c in sorted(project_data.get('class_info', []), key=lambda x: x['id'])]
    results['classes.txt'] = '\n'.join(classes)
    return results

def json_to_xml(project_data):
    results = {}
    for img_data in project_data.get('data', []):
        image_path = img_data.get('image_path', '')
        filename = os.path.basename(image_path)
        name_no_ext = os.path.splitext(filename)[0]
        img_w = int(img_data.get('image_width', 0))
        img_h = int(img_data.get('image_height', 0))
        
        root = Element('annotation')
        SubElement(root, 'folder').text = os.path.dirname(image_path) or 'images'
        SubElement(root, 'filename').text = filename
        size = SubElement(root, 'size')
        SubElement(size, 'width').text = str(img_w)
        SubElement(size, 'height').text = str(img_h)
        SubElement(size, 'depth').text = '3'
        
        for label in img_data.get('labels', []):
            if 'bbox' not in label: continue
            bbox = label['bbox']
            w, h = bbox[2] * img_w, bbox[3] * img_h
            xmin = max(0, int(bbox[0] * img_w - w / 2))
            ymin = max(0, int(bbox[1] * img_h - h / 2))
            xmax = min(img_w, int(bbox[0] * img_w + w / 2))
            ymax = min(img_h, int(bbox[1] * img_h + h / 2))
            
            obj = SubElement(root, 'object')
            SubElement(obj, 'name').text = label['label_name']
            bndbox = SubElement(obj, 'bndbox')
            SubElement(bndbox, 'xmin').text = str(xmin)
            SubElement(bndbox, 'ymin').text = str(ymin)
            SubElement(bndbox, 'xmax').text = str(xmax)
            SubElement(bndbox, 'ymax').text = str(ymax)
        
        try: indent(root, space='  ')
        except TypeError: pass
        xml_io = io.StringIO()
        ElementTree(root).write(xml_io, encoding='unicode', xml_declaration=True)
        results[f"{name_no_ext}.xml"] = xml_io.getvalue()
    return results

# ===== 新增 Segmentation 導出格式 =====

def json_to_yolo_seg(project_data):
    """轉換為 YOLO Segmentation TXT 格式 (class_id x1 y1 x2 y2 ...) 歸一化座標"""
    results = {}
    for img_data in project_data.get('data', []):
        filename = os.path.splitext(os.path.basename(img_data.get('image_path', '')))[0]
        lines = []
        for label in img_data.get('labels', []):
            if 'polygon' not in label: continue
            class_id = label['label_class_id']
            poly = label['polygon'] # [[x,y], [x,y]...]
            coords = " ".join([f"{pt[0]:.10f} {pt[1]:.10f}" for pt in poly])
            lines.append(f"{class_id} {coords}")
        results[f"{filename}.txt"] = '\n'.join(lines)
    
    classes = [c['name'] for c in sorted(project_data.get('class_info', []), key=lambda x: x['id'])]
    results['classes.txt'] = '\n'.join(classes)
    return results

def get_poly_area(x, y):
    """計算多邊形面積"""
    return 0.5 * abs(sum(x[i-1]*y[i] - x[i]*y[i-1] for i in range(len(x))))

def json_to_coco(project_data):
    """轉換為標準 COCO JSON (含 segmentation, area, bbox)"""
    coco = {
        "info": {"description": "Exported by Image Annotator", "version": "1.0"},
        "images": [], "annotations": [], "categories": []
    }
    
    for cls in project_data.get('class_info', []):
        coco['categories'].append({"id": cls['id'], "name": cls['name'], "supercategory": "none"})
        
    ann_id = 1
    for img_idx, img_data in enumerate(project_data.get('data', [])):
        img_id = img_idx + 1
        img_w = int(img_data.get('image_width', 0))
        img_h = int(img_data.get('image_height', 0))
        coco['images'].append({
            "id": img_id, "file_name": os.path.basename(img_data['image_path']),
            "width": img_w, "height": img_h
        })
        
        for label in img_data.get('labels', []):
            if 'polygon' not in label: continue
            poly_norm = label['polygon']
            poly_abs = [[int(round(p[0]*img_w)), int(round(p[1]*img_h))] for p in poly_norm]
            
            x_coords = [p[0] for p in poly_abs]
            y_coords = [p[1] for p in poly_abs]
            
            xmin, ymin = min(x_coords), min(y_coords)
            xmax, ymax = max(x_coords), max(y_coords)
            
            flat_poly = []
            for p in poly_abs:
                flat_poly.extend([p[0], p[1]])
                
            area = get_poly_area(x_coords, y_coords)
            
            coco['annotations'].append({
                "id": ann_id,
                "image_id": img_id,
                "category_id": label['label_class_id'],
                "segmentation": [flat_poly],
                "area": area,
                "bbox": [xmin, ymin, xmax - xmin, ymax - ymin],
                "iscrowd": 0
            })
            ann_id += 1

    return {"annotations_coco.json": json.dumps(coco, ensure_ascii=False, indent=2)}

def json_to_mask_rcnn(project_data):
    """轉換為 VGG Image Annotator (VIA) 格式，Mask R-CNN 常見資料集格式"""
    via_json = {}
    for img_data in project_data.get('data', []):
        filename = os.path.basename(img_data['image_path'])
        img_w = int(img_data.get('image_width', 0))
        img_h = int(img_data.get('image_height', 0))
        # VIA 的 key 通常是 filename + size (此處隨機使用假的 file_size 以相容結構)
        file_key = f"{filename}12345" 
        
        regions = []
        for label in img_data.get('labels', []):
            if 'polygon' not in label: continue
            poly_norm = label['polygon']
            x_coords = [int(p[0]*img_w) for p in poly_norm]
            y_coords = [int(p[1]*img_h) for p in poly_norm]
            
            regions.append({
                "shape_attributes": {
                    "name": "polygon",
                    "all_points_x": x_coords,
                    "all_points_y": y_coords
                },
                "region_attributes": {
                    "name": label['label_name']
                }
            })
            
        via_json[file_key] = {
            "filename": filename,
            "size": 12345,
            "regions": regions,
            "file_attributes": {}
        }
        
    return {"via_region_data.json": json.dumps(via_json, ensure_ascii=False, indent=2)}

def create_zip(files_dict):
    zip_io = io.BytesIO()
    with zipfile.ZipFile(zip_io, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename, content in files_dict.items():
            if isinstance(content, str): content = content.encode('utf-8')
            zf.writestr(filename, content)
    zip_io.seek(0)
    return zip_io