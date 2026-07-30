import os
import io
import zipfile
from xml.etree.ElementTree import Element, SubElement, ElementTree, indent


def json_to_yolo(project_data):
    """將項目 JSON 數據轉換為 YOLO 格式的 txt 文件內容（返回字典）"""
    results = {}

    for img_data in project_data.get('data', []):
        image_path = img_data.get('image_path', '')
        filename = os.path.splitext(os.path.basename(image_path))[0]
        lines = []
        for label in img_data.get('labels', []):
            class_id = label['label_class_id']
            bbox = label['bbox']  # [x_center, y_center, width, height] 已歸一化
            lines.append(
                f"{class_id} {bbox[0]:.6f} {bbox[1]:.6f} {bbox[2]:.6f} {bbox[3]:.6f}"
            )
        results[f"{filename}.txt"] = '\n'.join(lines)

    # 生成 classes.txt
    classes = [
        c['name']
        for c in sorted(project_data.get('class_info', []), key=lambda x: x['id'])
    ]
    results['classes.txt'] = '\n'.join(classes)

    return results


def json_to_xml(project_data):
    """將項目 JSON 數據轉換為 Pascal VOC XML 格式（返回字典）"""
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
        SubElement(root, 'path').text = image_path
        
        source = SubElement(root, 'source')
        SubElement(source, 'database').text = 'Image Annotator Tool'
        
        size = SubElement(root, 'size')
        SubElement(size, 'width').text = str(img_w)
        SubElement(size, 'height').text = str(img_h)
        SubElement(size, 'depth').text = '3'
        
        SubElement(root, 'segmented').text = '0'
        
        for label in img_data.get('labels', []):
            bbox = label['bbox']  # 歸一化 [x_center, y_center, width, height]
            # 轉換為絕對像素坐標
            x_center = bbox[0] * img_w
            y_center = bbox[1] * img_h
            w = bbox[2] * img_w
            h = bbox[3] * img_h
            xmin = int(x_center - w / 2)
            ymin = int(y_center - h / 2)
            xmax = int(x_center + w / 2)
            ymax = int(y_center + h / 2)
            
            obj = SubElement(root, 'object')
            SubElement(obj, 'name').text = label['label_name']
            SubElement(obj, 'pose').text = 'Unspecified'
            SubElement(obj, 'truncated').text = '0'
            SubElement(obj, 'difficult').text = '0'
            
            bndbox = SubElement(obj, 'bndbox')
            SubElement(bndbox, 'xmin').text = str(max(0, xmin))
            SubElement(bndbox, 'ymin').text = str(max(0, ymin))
            SubElement(bndbox, 'xmax').text = str(min(img_w, xmax))
            SubElement(bndbox, 'ymax').text = str(min(img_h, ymax))
        
        # 美化 XML 輸出（Python 3.9+）
        try:
            indent(root, space='  ')
        except TypeError:
            pass
        
        # 修改：使用 StringIO 而不是 BytesIO，配合 encoding='unicode'
        xml_io = io.StringIO()
        tree = ElementTree(root)
        tree.write(xml_io, encoding='unicode', xml_declaration=True)
        results[f"{name_no_ext}.xml"] = xml_io.getvalue()
    
    return results


def create_zip(files_dict):
    """將文件字典打包為 ZIP 文件的字節流"""
    zip_io = io.BytesIO()
    with zipfile.ZipFile(zip_io, 'w', zipfile.ZIP_DEFLATED) as zf:
        for filename, content in files_dict.items():
            if isinstance(content, str):
                content = content.encode('utf-8')
            zf.writestr(filename, content)
    zip_io.seek(0)
    return zip_io