#!/usr/bin/env python3
"""ふだっちのアイコンを作る。札を1枚立てて「ふ」を置いただけの図。"""
from PIL import Image, ImageDraw, ImageFont

FONT = '/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc'
BG, FUDA, INK, EDGE = (27,36,48), (255,250,240), (38,32,26), (216,183,121)

def make(size, safe=1.0):
    S = size * 4                                  # 4倍で描いて縮小（アンチエイリアス）
    im = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(im)
    w, h = S*0.50*safe, S*0.68*safe               # 札の比率は実物に近い 53:73
    card = Image.new('RGBA', (int(w), int(h)), FUDA + (255,))
    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle([0,0,int(w)-1,int(h)-1], radius=int(w*0.07),
                         fill=FUDA, outline=EDGE, width=max(2,int(S*0.006)))
    f = ImageFont.truetype(FONT, int(h*0.46))
    bb = f.getbbox('ふ')
    cd.text(((w-(bb[2]-bb[0]))/2 - bb[0], (h-(bb[3]-bb[1]))/2 - bb[1]), 'ふ', font=f, fill=INK)
    card = card.rotate(7, resample=Image.BICUBIC, expand=True)
    im.paste(card, (int((S-card.width)/2), int((S-card.height)/2)), card)
    return im.resize((size, size), Image.LANCZOS)

for n in (180, 192, 512):
    make(n).save(f'icons/icon-{n}.png')
make(512, safe=0.72).save('icons/icon-512-maskable.png')   # マスク用に内側へ寄せる
print('アイコン4枚 作成')
