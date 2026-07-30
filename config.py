import os

# 項目根目錄
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 項目 JSON 文件存儲目錄
PROJECTS_DIR = os.path.join(BASE_DIR, 'projects')

# 支持的圖片格式
ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'bmp'}

# 確保項目目錄存在
os.makedirs(PROJECTS_DIR, exist_ok=True)