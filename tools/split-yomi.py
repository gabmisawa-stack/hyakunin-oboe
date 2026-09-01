#!/usr/bin/env python3
"""朗詠の音源を「上の句」と「下の句」に切り分ける。

  python3 tools/split-yomi.py ~/Downloads/百人一首音声 ~/Downloads/百人一首音声_分割

実測（三澤家の朗詠音源100首）：1ファイルに発話区間が3つある。
  区間1 平均6.2秒 ／ 区間2 平均7.0秒 ／ 区間3 平均7.3秒、区間2と3の相関 0.61。
これは「上の句 → 下の句 → 下の句（くり返し）」の形と整合する。
ADCLの読上げサイトが持つ4種類の音源のうち「上・下句２」も同じ構成だった。

⚠️ ただし耳で確かめたわけではない。区間1が上の句である確証はない。
   アプリの「せってい → 音源をたしかめる」で聴いて、逆なら入れ替えられるようにしてある。

ffmpegは使わない。macOS標準の afconvert のみ。
"""
import subprocess, wave, sys, os, glob, re, json
import numpy as np

SRC = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads/百人一首音声')
OUT = os.path.expanduser(sys.argv[2] if len(sys.argv) > 2 else '~/Downloads/百人一首音声_分割')
PAD_HEAD, PAD_TAIL = 0.30, 0.45
TH, GAP, MINLEN = -38.0, 0.5, 1.0

def segments(wav, gap=GAP):
    w = wave.open(wav); sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    win = int(sr * 0.02); m = len(a) // win
    rms = np.sqrt((a[:m*win].reshape(m, win) ** 2).mean(1)) + 1e-9
    db = 20 * np.log10(rms / rms.max())
    out, start, sil = [], None, 0
    for i, loud in enumerate(db >= TH):
        if loud:
            if start is None: start = i
            sil = 0
        else:
            if start is not None:
                sil += 1
                if sil * 0.02 >= gap:
                    out.append((start * 0.02, (i - sil) * 0.02)); start, sil = None, 0
    if start is not None: out.append((start * 0.02, m * 0.02))
    return [s for s in out if s[1] - s[0] >= MINLEN], sr, a

def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(f'{SRC}/*.mp3')) + sorted(glob.glob(f'{SRC}/*.m4a'))
    if not files: sys.exit(f'音源が見つからない: {SRC}')
    made, problems, report = 0, [], {}
    for f in files:
        m = re.match(r'(\d{1,3})', os.path.basename(f))
        if not m: problems.append(f'番号が読めない: {os.path.basename(f)}'); continue
        pid = int(m.group(1))
        tmp = f'{OUT}/_t.wav'
        subprocess.run(['afconvert','-f','WAVE','-d','LEI16@22050','-c','1',f,tmp],
                       check=True, capture_output=True)
        segs, sr, pcm = segments(tmp)
        # 3区間そろわなければ、間の判定をだんだん短くして取り直す。
        # 9番は区間2と3の間が0.44秒しかなく、既定の0.5秒では1つに繋がってしまった。
        for g in (0.4, 0.35, 0.3):
            if len(segs) >= 3: break
            segs, sr, pcm = segments(tmp, gap=g)
        if len(segs) < 2:
            problems.append(f'{pid}番: 発話区間が{len(segs)}個しかない（手当てが要る）'); os.remove(tmp); continue
        if len(segs) != 3:
            problems.append(f'{pid}番: 発話区間が{len(segs)}個（ふつうは3個）')
        report[pid] = [[round(a,2), round(b,2)] for a, b in segs]
        for name, (a, b) in (('kami', segs[0]), ('shimo', segs[1])):
            i0 = max(0, int((a - PAD_HEAD) * sr)); i1 = min(len(pcm), int((b + PAD_TAIL) * sr))
            ww = wave.open(tmp, 'wb'); ww.setnchannels(1); ww.setsampwidth(2); ww.setframerate(sr)
            ww.writeframes(pcm[i0:i1].astype(np.int16).tobytes()); ww.close()
            subprocess.run(['afconvert','-f','m4af','-d','aac','-b','64000','-c','1',
                            tmp, f'{OUT}/{pid:03d}_{name}.m4a'], check=True, capture_output=True)
            made += 1
        os.remove(tmp)
    json.dump(report, open(f'{OUT}/_segments.json','w'), ensure_ascii=False, indent=1)
    print(f'書き出し {made} ファイル（{made//2}首ぶん）→ {OUT}/')
    if problems:
        print('\n★要確認'); [print('  ' + p) for p in problems]
    print('\n⚠️ 区間1を上の句、区間2を下の句として切った。耳で確かめていない。')
    print('   アプリの「せってい → 音源をたしかめる」で聴いて、逆なら入れ替えられる。')

main()
