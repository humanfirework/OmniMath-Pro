import os, json
from PIL import Image, ImageStat

report = {}
shots_dir = "/workspace/out/screenshots"
black = []
ok = []
if os.path.isdir(shots_dir):
    for f in sorted(os.listdir(shots_dir)):
        if not f.endswith(".png"): continue
        p = os.path.join(shots_dir, f)
        try:
            im = Image.open(p).convert("L")
            stat = ImageStat.Stat(im)
            mean = stat.mean[0]
            std = stat.stddev[0]
            w, h = im.size
            info = {"file": f, "w": w, "h": h, "mean": round(mean, 2), "std": round(std, 2), "size_kb": round(os.path.getsize(p)/1024,1)}
            if mean < 5 and std < 5:
                info["is_black"] = True
                black.append(info)
            else:
                info["is_black"] = False
                ok.append(info)
        except Exception as e:
            report[f] = str(e)
report["black_count"] = len(black)
report["ok_count"] = len(ok)
report["black_list"] = black
report["ok_list"] = ok
os.makedirs("/workspace/_可视化报告", exist_ok=True)
with open("/workspace/_可视化报告/00_截图诊断.json", "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print(json.dumps(report, ensure_ascii=False, indent=2))
