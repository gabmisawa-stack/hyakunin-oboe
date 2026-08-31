#!/usr/bin/env python3
"""LibriVox版パブリックドメイン音源を100首に分割する。

出典: https://archive.org/details/hyakunin_isshu_librivox
      "Ogura Hyakunin Isshu" 朗読 kaseumin (2006)
      Public Domain Mark 1.0 / LibriVoxは全録音をパブリックドメインで提供

各原本ファイルの構成（実測）:
  [0] LibriVoxの英語イントロ（11.7秒 or 14.8秒。必ず1.4秒地点から始まる）
  [1]..[10] 10首。1首あたり約7〜9秒の通し読み
  ※ 051-060 のみ [1] がタイトル読み上げ(6.5秒)なので [2]..[11] が歌
  ※ 091-100 のみ [11] に英語のアウトロ(6.7秒)が付くので [1]..[10] が歌

ffmpegは使わない（環境依存を避ける）。macOS標準の afconvert のみ。
"""
import subprocess, wave, sys, os, glob
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else 'tools/lvsrc'   # 原本mp3の置き場
OUT = sys.argv[2] if len(sys.argv) > 2 else 'audio/lv'
PAD_HEAD, PAD_TAIL = 0.25, 0.35     # 切り口の余白（秒）
POEM_IDX = {'051-060': slice(2, 12)}          # 例外。既定は slice(1, 11)
DEFAULT  = slice(1, 11)

def speech_segments(wav, gap=1.5, th=-40.0, minlen=6.0):
    w = wave.open(wav); sr = w.getframerate()
    a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
    win = int(sr * 0.05); m = len(a) // win
    rms = np.sqrt((a[:m*win].reshape(m, win) ** 2).mean(1)) + 1e-9
    db = 20 * np.log10(rms / rms.max())
    out, start, sil = [], None, 0
    for i, loud in enumerate(db >= th):
        if loud:
            if start is None: start = i
            sil = 0
        else:
            if start is not None:
                sil += 1
                if sil * 0.05 >= gap:
                    out.append((start * 0.05, (i - sil) * 0.05)); start, sil = None, 0
    if start is not None: out.append((start * 0.05, m * 0.05))
    return [s for s in out if s[1] - s[0] >= minlen], m * 0.05

def main():
    os.makedirs(OUT, exist_ok=True)
    files = sorted(glob.glob(f'{SRC}/*.mp3'))
    if len(files) != 10: sys.exit(f'原本が10ファイルない: {len(files)}')
    made, problems = [], []
    for f in files:
        key = os.path.basename(f)[:7]                    # 例 "001-010"
        first = int(key[:3])
        wav = f.replace('.mp3', '.wav')
        subprocess.run(['afconvert','-f','WAVE','-d','LEI16@22050','-c','1',f,wav],
                       check=True, capture_output=True)
        segs, total = speech_segments(wav)
        picked = segs[POEM_IDX.get(key, DEFAULT)]
        if len(picked) != 10:
            problems.append(f'{key}: 歌が{len(picked)}件しか取れない（区間{len(segs)}）'); continue
        w = wave.open(wav); sr = w.getframerate()
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16); w.close()
        for n, (a, b) in enumerate(picked):
            pid, dur = first + n, b - a
            if not (6.0 <= dur <= 15.0):
                problems.append(f'{pid}番: 長さ{dur:.1f}秒が範囲外')
            i0 = max(0, int((a - PAD_HEAD) * sr)); i1 = min(len(pcm), int((b + PAD_TAIL) * sr))
            tmp = f'{OUT}/_tmp.wav'
            ww = wave.open(tmp, 'wb'); ww.setnchannels(1); ww.setsampwidth(2); ww.setframerate(sr)
            ww.writeframes(pcm[i0:i1].tobytes()); ww.close()
            subprocess.run(['afconvert','-f','m4af','-d','aac','-b','48000','-c','1',
                            tmp, f'{OUT}/{pid:03d}.m4a'], check=True, capture_output=True)
            made.append((pid, dur))
        os.remove(f'{OUT}/_tmp.wav'); os.remove(wav)
    made.sort()
    print(f'書き出し {len(made)} ファイル → {OUT}/')
    missing = [i for i in range(1, 101) if i not in [p for p, _ in made]]
    if missing: problems.append(f'欠番: {missing}')
    ds = [d for _, d in made]
    if ds: print(f'1首の長さ  最短{min(ds):.1f}秒 / 平均{sum(ds)/len(ds):.1f}秒 / 最長{max(ds):.1f}秒')
    if problems:
        print('\n★要確認'); [print('  ' + p) for p in problems]; sys.exit(1)
    print('✅ 100首すべて、長さも範囲内')

main()
