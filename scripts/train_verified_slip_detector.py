import hashlib, json, shutil, sys
from pathlib import Path
from ultralytics import YOLO

BOXES = {
    "chatv3 (73).jpg": (400, 736, 385, 843),
    "chatv3 (77).jpg": (269, 111, 536, 811),
    "chatv3 (113).jpg": (382, 86, 412, 808),
}
NEGATIVES = ["chatv3 (25).jpg", "chatv3 (28).jpg", "chatv3 (70).jpg"]

def main(out_arg):
    root = Path.cwd(); out = Path(out_arg); src = {p.name:p for p in (root/'For Test').rglob('*.jpg')}
    for split in ('train','val'):
        (out/'dataset/images'/split).mkdir(parents=True, exist_ok=True); (out/'dataset/labels'/split).mkdir(parents=True, exist_ok=True)
    manifest=[]
    for name, box in BOXES.items():
        p=src[name]; split='train'; shutil.copy2(p,out/'dataset/images'/split/p.name); x,y,w,h=box; iw,ih=__import__('cv2').imdecode(__import__('numpy').frombuffer(p.read_bytes(),dtype='uint8'),1).shape[1::-1]; (out/'dataset/labels'/split/(p.stem+'.txt')).write_text(f'0 {(x+w/2)/iw:.6f} {(y+h/2)/ih:.6f} {w/iw:.6f} {h/ih:.6f}\n'); manifest.append({'name':name,'split':split,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'box':box,'label_source':'human_visual_review'})
    for name in NEGATIVES:
        p=src[name]; split='val'; shutil.copy2(p,out/'dataset/images'/split/p.name); (out/'dataset/labels'/split/(p.stem+'.txt')).write_text(''); manifest.append({'name':name,'split':split,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'box':None,'label_source':'human_visual_review_chat_only'})
    d=out/'dataset'; (d/'dataset.yaml').write_text(f'path: {d.resolve().as_posix()}\ntrain: images/train\nval: images/val\nnames:\n  0: slip\n'); (d/'manifest.json').write_text(json.dumps({'schema':'digital-evidence.verified-ground-truth.v1','held_out_test':'chatv3 (15).jpg','images':manifest},ensure_ascii=False,indent=2))
    m=YOLO(str(root/'models/slip-yolov8n.pt')); m.train(data=str(d/'dataset.yaml'),epochs=20,imgsz=416,batch=2,workers=0,device=0,project=str(out/'training'),name='slip',plots=False,amp=False,verbose=False)
    print(json.dumps({'out':str(out),'weights':str(out/'training/slip/weights/best.pt'),'train':3,'val':3},ensure_ascii=False))
if __name__=='__main__': main(sys.argv[1])
