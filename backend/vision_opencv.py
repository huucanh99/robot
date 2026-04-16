"""
OpenCV Vision Detection — đọc frame từ camera, detect vật thể, gửi về backend
Chạy: python vision_opencv.py
"""

import cv2
import numpy as np
import requests
import socket
import json
import time
import base64

YOUR_PC_IP  = "169.254.243.1"        # IP máy của bạn (máy robot arm kết nối tới)
CAMERA_URL  = f"http://{YOUR_PC_IP}:3000/camera/capture"
VISION_HOST = YOUR_PC_IP             # gửi kết quả về máy của bạn
VISION_PORT = 8765
FPS_DELAY   = 0.1   # 10fps
DEBUG       = True  # tắt sau khi chỉnh xong

# ── Vùng pixel của mỗi tray trong ảnh camera (x1, y1, x2, y2) ────────────────
# Chỉnh các giá trị này cho khớp với vị trí thực tế trong cửa sổ Detected
TRAY_REGIONS = {
    "tray1": (50,  50, 500, 550),   # tray bên trái
    "tray2": (550, 50, 1000, 550),  # tray bên phải
}
TRAY_COLS = 4
TRAY_ROWS = 5

# ── Map pixel → tray cell ─────────────────────────────────────────────────────

def pixel_to_cell(px, py):
    """Trả về (tray_name, cell_number) hoặc None nếu không nằm trong tray nào."""
    for tray, (x1, y1, x2, y2) in TRAY_REGIONS.items():
        if x1 <= px <= x2 and y1 <= py <= y2:
            col = int((px - x1) / (x2 - x1) * TRAY_COLS)
            row = int((py - y1) / (y2 - y1) * TRAY_ROWS)
            col = max(0, min(col, TRAY_COLS - 1))
            row = max(0, min(row, TRAY_ROWS - 1))
            cell = row * TRAY_COLS + col + 1
            return tray, cell
    return None

def draw_tray_grid(img, scale=1.0):
    """Vẽ grid các tray lên debug image."""
    for tray, (x1, y1, x2, y2) in TRAY_REGIONS.items():
        sx1,sy1,sx2,sy2 = int(x1*scale),int(y1*scale),int(x2*scale),int(y2*scale)
        cv2.rectangle(img, (sx1,sy1), (sx2,sy2), (255,200,0), 2)
        cw = (sx2-sx1) / TRAY_COLS
        ch = (sy2-sy1) / TRAY_ROWS
        for c in range(1, TRAY_COLS):
            x = int(sx1 + c*cw)
            cv2.line(img, (x,sy1), (x,sy2), (255,200,0), 1)
        for r in range(1, TRAY_ROWS):
            y = int(sy1 + r*ch)
            cv2.line(img, (sx1,y), (sx2,y), (255,200,0), 1)
        cv2.putText(img, tray, (sx1+4, sy1+18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,200,0), 1)

# ── Lấy frame từ backend ───────────────────────────────────────────────────────

session = requests.Session()  # dùng lại connection HTTP

# ── Click chuột để lấy tọa độ thực ───────────────────────────────────────────
_last_frame_w = 1
_last_frame_h = 1

def on_mouse(event, mx, my, flags, param):
    if event == cv2.EVENT_LBUTTONDOWN:
        # Chuyển từ tọa độ debug (960x540) về tọa độ thực
        rx = int(mx * _last_frame_w / 960)
        ry = int(my * _last_frame_h / 540)
        print(f"[Click] pixel thực: x={rx}, y={ry}")

cv2.namedWindow("Detected")
cv2.setMouseCallback("Detected", on_mouse)

def get_frame():
    r = session.get(CAMERA_URL, timeout=3)
    data = r.json()
    if "image" not in data:
        return None
    b64 = data["image"].split(",")[1]
    buf = base64.b64decode(b64)
    arr = np.frombuffer(buf, np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)

# ── Detect vật thể bằng contour ───────────────────────────────────────────────

def detect(frame):
    h, w = frame.shape[:2]
    gray    = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (9, 9), 2)

    # ── Chỉnh 2 dòng này cho phù hợp ─────────────────────────
    MIN_RADIUS_PCT = 0.02   # bán kính tối thiểu (% chiều nhỏ hơn của frame)
    MAX_RADIUS_PCT = 0.08   # bán kính tối đa
    # ──────────────────────────────────────────────────────────

    short = min(w, h)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1,
        minDist=int(short * MIN_RADIUS_PCT * 1.5),
        param1=60,
        param2=18,
        minRadius=int(short * MIN_RADIUS_PCT),
        maxRadius=int(short * MAX_RADIUS_PCT),
    )

    global _last_frame_w, _last_frame_h
    _last_frame_w, _last_frame_h = w, h
    scale = 960 / w
    if DEBUG:
        debug_frame = cv2.resize(frame.copy(), (960, 540))
        draw_tray_grid(debug_frame, scale)

    results = []
    occupied = {}   # { "tray1": [1, 5, 12, ...], "tray2": [...] }

    if circles is not None:
        circles = np.round(circles[0]).astype(int)
        for (cx, cy, r) in circles:
            results.append({
                "x": int(cx),
                "y": int(cy),
                "w": int(r * 2),
                "h": int(r * 2),
                "r": 0.0,
                "area": int(np.pi * r * r),
            })
            # Map → tray cell
            hit = pixel_to_cell(cx, cy)
            if hit:
                tray, cell = hit
                occupied.setdefault(tray, [])
                if cell not in occupied[tray]:
                    occupied[tray].append(cell)

            if DEBUG:
                cv2.circle(debug_frame, (int(cx*scale), int(cy*scale)), int(r*scale), (0,255,0), 2)
                cv2.circle(debug_frame, (int(cx*scale), int(cy*scale)), 3, (0,0,255), -1)
                if hit:
                    label = f"{hit[0]}-{hit[1]}"
                    cv2.putText(debug_frame, label, (int(cx*scale)+5, int(cy*scale)-5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0,255,0), 1)

    if DEBUG:
        cv2.imshow("Detected", debug_frame)
        cv2.waitKey(1)

    if not results:
        return {"found": False, "objects": [], "occupied": {}}

    results.sort(key=lambda r: r["area"], reverse=True)
    for r in results:
        r.pop("area")
    return {"found": True, "objects": results, "occupied": occupied}

# ── Gửi kết quả về backend TCP (persistent socket) ────────────────────────────

class VisionSender:
    def __init__(self):
        self.sock = None

    def _connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(2)
        self.sock.connect((VISION_HOST, VISION_PORT))

    def send(self, result):
        msg = (json.dumps(result) + "\n").encode()
        for attempt in range(2):
            try:
                if self.sock is None:
                    self._connect()
                self.sock.sendall(msg)
                return
            except Exception:
                try: self.sock.close()
                except: pass
                self.sock = None

sender = VisionSender()

# ── Main loop ─────────────────────────────────────────────────────────────────

HOLD_FRAMES = 8

print("[OpenCV Vision] Starting...")
last_found = None
miss_count = 0

while True:
    try:
        frame = get_frame()
        if frame is not None:
            result = detect(frame)
            if result["found"]:
                last_found = result
                miss_count = 0
                sender.send(result)
                print(f"[Vision] {len(result['objects'])} object(s) found")
            else:
                miss_count += 1
                if miss_count <= HOLD_FRAMES and last_found:
                    sender.send(last_found)
                else:
                    last_found = None
                    sender.send({"found": False, "objects": []})
                    print("[Vision] not found")
    except requests.exceptions.ConnectionError:
        print("[Vision] Backend chưa chạy, đợi...")
    except Exception as e:
        print(f"[Vision] Error: {e}")
    time.sleep(FPS_DELAY)
