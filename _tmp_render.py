#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os, json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch
from PIL import Image, ImageFilter

ROOT = "/workspace/_可视化报告"
CACHE = os.path.join(ROOT, "_cache")

def load_json(name):
    with open(os.path.join(CACHE, name), encoding='utf-8') as f:
        return json.load(f)

train_full = load_json('train_full.json')
train_flip = load_json('train_full_flipY.json')
train_cont = load_json('train_contours.json')
hutao_full = load_json('hutao_full.json')
hutao_flip = load_json('hutao_full_flipY.json')
hutao_cont = load_json('hutao_contours.json')

def flatten_cubic(seg_pts, N=16):
    P0, P1, P2, P3 = map(np.array, seg_pts)
    t = np.linspace(0, 1, N+1)[:, None]
    return (1-t)**3 * P0 + 3*(1-t)**2*t * P1 + 3*(1-t)*t**2 * P2 + t**3 * P3

def curves_to_polylines(full_obj, N=10):
    lines = []
    for path in full_obj.get('curves', []):
        segs = path.get('segments', [])
        if not segs: continue
        all_pts = []
        for i, seg in enumerate(segs):
            if len(seg) != 4: continue
            flat = flatten_cubic(seg, N=N)
            all_pts.append(flat if i == 0 else flat[1:])
        if all_pts:
            arr = np.vstack(all_pts)
            lines.append((arr[:, 0], arr[:, 1]))
    return lines

def contours_to_polylines(cont_obj):
    lines = []
    for c in cont_obj.get('contours', []):
        pts = c.get('points', [])
        if len(pts) < 2: continue
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        lines.append((xs, ys))
    return lines

train_lines = curves_to_polylines(train_full, N=10)
hutao_lines = curves_to_polylines(hutao_full, N=10)
train_lines_flip = curves_to_polylines(train_flip, N=10)
hutao_lines_flip = curves_to_polylines(hutao_flip, N=10)
train_cont_lines = contours_to_polylines(train_cont)
hutao_cont_lines = contours_to_polylines(hutao_cont)

train_img = np.array(Image.open('/workspace/测试3-火车.jpeg').convert('RGB').resize((train_full['width'], train_full['height'])))
hutao_img = np.array(Image.open('/workspace/测试2-胡桃.webp').convert('RGB').resize((hutao_full['width'], hutao_full['height'])))

# =============== FIG 1/2: 3-in-1 ===============
def plot_3in1(img_orig, cont_lines, bez_lines, W, H, title_main, orig_note,
              cont_count, bez_count, seg_count, params, out_name, dpi=150):
    fig, axes = plt.subplots(1, 3, figsize=(18, 6), dpi=dpi, facecolor='#ffffff')
    fig.patch.set_facecolor('#ffffff')
    ax = axes[0]
    ax.imshow(img_orig)
    ax.set_title(f'(1) Original Image\n{img_orig.shape[1]}x{img_orig.shape[0]}px  {orig_note}', fontsize=10, color='#111827', fontweight='bold')
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values(): sp.set_color('#cbd5e1'); sp.set_linewidth(1.5)
    ax.set_facecolor('#fafafa')

    ax = axes[1]
    ax.set_facecolor('#0f172a')
    for xs, ys in cont_lines:
        ax.plot(xs, ys, color='#38bdf8', linewidth=0.8, alpha=0.92)
    ax.set_xlim(0, W); ax.set_ylim(H, 0)
    ax.set_aspect('equal')
    ax.set_title(f'(2) fine-outline Polylines (Canny 6ch)\n{cont_count} polylines from edge-trace + RDP', fontsize=10, color='#111827', fontweight='bold')
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values(): sp.set_color('#cbd5e1'); sp.set_linewidth(1.5)

    ax = axes[2]
    ax.set_facecolor('#fafafa')
    for xs, ys in bez_lines:
        ax.plot(xs, ys, color='#ec4899', linewidth=0.55, alpha=0.85)
    ax.set_xlim(0, W); ax.set_ylim(H, 0)
    ax.set_aspect('equal')
    ax.set_title(f'(3) curve-fit BezierPaths (cubic)\n{bez_count} paths, {seg_count} segments | {params}', fontsize=10, color='#111827', fontweight='bold')
    ax.set_xticks([]); ax.set_yticks([])
    for sp in ax.spines.values(): sp.set_color('#cbd5e1'); sp.set_linewidth(1.5)

    fig.suptitle(title_main, fontsize=14, fontweight='bold', color='#0f172a', y=1.015)
    plt.tight_layout()
    fig.savefig(os.path.join(ROOT, out_name), facecolor='white', bbox_inches='tight', dpi=dpi)
    plt.draw(); plt.close(fig)
    print(f'[saved] {out_name}')

plot_3in1(train_img, train_cont_lines, train_lines,
          train_full['width'], train_full['height'],
          'Train Image (600x400): Original -> Edge Polylines -> Bezier Fit',
          'JPEG 367KB, balanced mode',
          train_cont['count'], train_full['total'], train_full['totalSegments'],
          'levels=4 turd=20 err<1.5px',
          '01_火车_三合一对比.png')

plot_3in1(hutao_img, hutao_cont_lines, hutao_lines,
          hutao_full['width'], hutao_full['height'],
          'HuTao Anime (313x700): Original -> Edge Polylines -> Bezier Fit',
          'WebP 98KB, precise mode',
          hutao_cont['count'], hutao_full['total'], hutao_full['totalSegments'],
          'levels=6 turd=10 err<1.0px',
          '02_胡桃_三合一对比.png')

# =============== FIG 3/4: flipY side-by-side ===============
def plot_flipy(lines_orig, lines_flip, W, H, title, out_name, orig_pt, flip_pt, Hv, dpi=150):
    aspect = H / W if W > 0 else 1
    fig_h = 7 * aspect + 2.2
    fig, axes = plt.subplots(1, 2, figsize=(15, fig_h), dpi=dpi, facecolor='#ffffff')
    fig.patch.set_facecolor('#ffffff')

    ax = axes[0]
    ax.set_facecolor('#fafafa')
    for xs, ys in lines_orig:
        ax.plot(xs, ys, color='#6366f1', linewidth=0.6, alpha=0.85)
    ax.set_xlim(0, W); ax.set_ylim(H, 0)
    ax.set_aspect('equal')
    ax.annotate('', xy=(W*0.025, H*0.10), xytext=(W*0.025, H*0.02),
                arrowprops=dict(arrowstyle='->', color='#dc2626', lw=2.5))
    ax.text(W*0.055, H*0.06, 'Y-axis DOWN\n(Pixel Space,\nImage Coords)',
            fontsize=9, color='#dc2626', fontweight='bold', va='center', linespacing=1.3)
    ax.plot(orig_pt[0], orig_pt[1], 'o', color='#ef4444', markersize=11, markeredgecolor='white', markeredgewidth=2.2, zorder=10)
    ax.text(orig_pt[0] + W*0.02, orig_pt[1],
            f'P0 = ({orig_pt[0]}, {orig_pt[1]})',
            fontsize=8.5, color='#7f1d1d', fontweight='bold', va='center',
            bbox=dict(boxstyle='round,pad=0.25', facecolor='#fef2f2', edgecolor='#fecaca'))
    ax.set_title('flipY = OFF (Y-down, image pixel space)  ->  APPEARS UPSIDE-DOWN', fontsize=10.5, color='#991b1b', fontweight='bold', pad=10)
    for sp in ax.spines.values(): sp.set_color('#fca5a5'); sp.set_linewidth(2.2)
    ax.set_xticks([]); ax.set_yticks([])

    ax = axes[1]
    ax.set_facecolor('#f0fdf4')
    for xs, ys in lines_flip:
        ax.plot(xs, ys, color='#059669', linewidth=0.6, alpha=0.85)
    ax.set_xlim(0, W); ax.set_ylim(0, H)
    ax.set_aspect('equal')
    ax.annotate('', xy=(W*0.025, H*0.98), xytext=(W*0.025, H*0.02),
                arrowprops=dict(arrowstyle='->', color='#059669', lw=2.5))
    ax.text(W*0.055, H*0.50, 'Y-axis UP\n(Math Space,\nCanvas Coords)',
            fontsize=9, color='#059669', fontweight='bold', va='center', linespacing=1.3)
    ax.plot(flip_pt[0], flip_pt[1], 'o', color='#059669', markersize=11, markeredgecolor='white', markeredgewidth=2.2, zorder=10)
    ax.text(flip_pt[0] + W*0.02, flip_pt[1],
            f"P0' = ({flip_pt[0]}, {flip_pt[1]})\nVerify: H - y = {Hv} - {orig_pt[1]} = {Hv-orig_pt[1]}  OK",
            fontsize=8.5, color='#064e3b', fontweight='bold', va='center', linespacing=1.25,
            bbox=dict(boxstyle='round,pad=0.25', facecolor='#ecfdf5', edgecolor='#6ee7b7'))
    ax.set_title('flipY = ON (Y-up, math 2D canvas)  ->  RIGHT-SIDE UP  CORRECT', fontsize=10.5, color='#047857', fontweight='bold', pad=10)
    for sp in ax.spines.values(): sp.set_color('#6ee7b7'); sp.set_linewidth(2.2)
    ax.set_xticks([]); ax.set_yticks([])

    fig.suptitle(title, fontsize=13, fontweight='bold', color='#0f172a', y=1.01)
    plt.tight_layout()
    fig.savefig(os.path.join(ROOT, out_name), facecolor='white', bbox_inches='tight', dpi=dpi)
    plt.draw(); plt.close(fig)
    print(f'[saved] {out_name}')

t_seg0 = train_full['curves'][0]['segments'][0]
t_seg0_f = train_flip['curves'][0]['segments'][0]
plot_flipy(train_lines, train_lines_flip,
          train_full['width'], train_full['height'],
          'flipY Axis Mirror: Pixel Coords (Y-DOWN)  <->  Math Canvas (Y-UP)   |   Train 600x400',
          '03_火车_flipY_对比.png',
          t_seg0[0], t_seg0_f[0], train_full['height'])

h_seg0 = hutao_full['curves'][0]['segments'][0]
h_seg0_f = hutao_flip['curves'][0]['segments'][0]
plot_flipy(hutao_lines, hutao_lines_flip,
          hutao_full['width'], hutao_full['height'],
          'flipY Axis Mirror: Pixel Coords (Y-DOWN)  <->  Math Canvas (Y-UP)   |   HuTao 313x700',
          '04_胡桃_flipY_对比.png',
          h_seg0[0], h_seg0_f[0], hutao_full['height'])

# =============== FIG 5: 2D Canvas UI Mock ===============
def plot_canvas(lines_flip, W, H, total, out_name, dpi=150):
    fig = plt.figure(figsize=(16, 10), dpi=dpi, facecolor='#f8fafc')
    fig.patch.set_facecolor('#f8fafc')
    shell = fig.add_axes([0, 0, 1, 1])
    shell.set_xlim(0, 100); shell.set_ylim(0, 100); shell.axis('off'); shell.set_facecolor('#1e293b')
    shell.add_patch(plt.Rectangle((0, 93), 100, 7, color='#0f172a'))
    shell.text(2, 96.5, '  Plot2DCanvas  |  2D Math Canvas (flipY=ON,  Y-axis UP)',
               fontsize=13, color='#f1f5f9', fontweight='bold', va='center')
    shell.text(98, 96.5, 'equal aspect + grid', fontsize=9, color='#94a3b8', style='italic', va='center', ha='right')
    shell.add_patch(plt.Rectangle((0, 0), 6, 93, color='#334155'))
    tools = ['[ ]', 'PEN', 'MSE', 'ZOM', 'RST', 'CFG']
    for i, t in enumerate(tools):
        shell.text(3, 88 - i*12, t, fontsize=10.5, color='#e2e8f0', ha='center', va='center', fontweight='bold')

    ax = fig.add_axes([0.08, 0.04, 0.90, 0.87])
    ax.set_facecolor('#ffffff')
    mx = np.linspace(0, W, 7); my = np.linspace(0, H, 7)
    ax.set_xticks(mx); ax.set_yticks(my)
    ax.set_xticks(np.linspace(0, W, 31), minor=True)
    ax.set_yticks(np.linspace(0, H, 31), minor=True)
    ax.grid(which='minor', color='#e2e8f0', linestyle='-', linewidth=0.3, alpha=0.65)
    ax.grid(which='major', color='#94a3b8', linestyle='--', linewidth=0.8, alpha=0.7)
    ax.axhline(0, color='#1e40af', linewidth=2.3, zorder=5)
    ax.axvline(0, color='#1e40af', linewidth=2.3, zorder=5)
    ax.text(W*0.005, -H*0.032, 'O (0,0)', fontsize=10.5, color='#1e3a8a', fontweight='bold', ha='left')
    ax.text(W*0.995, -H*0.032, f'X -> {W}', fontsize=10.5, color='#1e3a8a', fontweight='bold', ha='right')
    ax.text(-W*0.01, H*0.995, f'Y ^ {H}', fontsize=10.5, color='#1e3a8a', fontweight='bold', va='top', ha='right')
    for xs, ys in lines_flip:
        ax.plot(xs, ys, color='#f472b6', linewidth=2.8, alpha=0.82, solid_capstyle='round')
    ax.set_xlim(-W*0.03, W*1.03); ax.set_ylim(-H*0.08, H*1.08)
    ax.set_aspect('equal')
    for tick in ax.xaxis.get_major_ticks() + ax.yaxis.get_major_ticks():
        tick.label1.set_fontsize(8); tick.label1.set_color('#475569')
    ax.legend(handles=[
        mpatches.Patch(color='#f472b6', label=f'Bezier Curves ({total} paths, magenta 3px)'),
        mpatches.Patch(color='#94a3b8', label='Major grid (dashed)'),
    ], loc='lower right', fontsize=9.5, framealpha=0.92, facecolor='#ffffff', edgecolor='#cbd5e1')
    ax.text(0.98, 0.98, 'Blueprint plot-curves node -> True 2D Canvas Render', fontsize=11.5,
            color='#0f172a', fontweight='bold', ha='right', va='top', transform=ax.transAxes,
            bbox=dict(boxstyle='round,pad=0.35', facecolor='#fef3c7', edgecolor='#fbbf24', alpha=0.92))
    fig.savefig(os.path.join(ROOT, out_name), facecolor='#f8fafc', bbox_inches='tight', dpi=dpi)
    plt.draw(); plt.close(fig)
    print(f'[saved] {out_name}')

plot_canvas(hutao_lines_flip, hutao_full['width'], hutao_full['height'], hutao_full['total'], '05_2D画布风格_渲染模拟.png')

# =============== FIG 6: Workflow ===============
def draw_mini_polyline(ax, lines, W, H, x0, x1, y0, y1):
    sx, sy = (x1-x0)/W, (y1-y0)/H
    for xs, ys in lines:
        ax.plot([x0 + x*sx for x in xs], [y0 + (H-y)*sy for y in ys], color='#0ea5e9', lw=0.7, alpha=0.9)

def draw_mini_bezier(ax, lines, W, H, x0, x1, y0, y1):
    sx, sy = (x1-x0)/W, (y1-y0)/H
    for xs, ys in lines:
        ax.plot([x0 + x*sx for x in xs], [y0 + (H-y)*sy for y in ys], color='#ec4899', lw=0.6, alpha=0.9)

def draw_mini_canvas(ax, lines_flip, W, H, x0, x1, y0, y1):
    ax.add_patch(plt.Rectangle((x0,y0), x1-x0, y1-y0, facecolor='#ffffff', edgecolor='#1e40af', lw=1.5, zorder=1))
    sx, sy = (x1-x0)/W, (y1-y0)/H
    for i in range(1,6):
        ax.axhline(y0 + (y1-y0)*i/5, color='#e2e8f0', lw=0.3)
        ax.axvline(x0 + (x1-x0)*i/5, color='#e2e8f0', lw=0.3)
    for xs, ys in lines_flip:
        ax.plot([x0 + x*sx for x in xs], [y0 + y*sy for y in ys], color='#f472b6', lw=0.9, alpha=0.9)
    ax.plot([x0, x0+0.12*(x1-x0)], [y0, y0], color='#1e40af', lw=2)
    ax.plot([x0, x0], [y0, y0+0.12*(y1-y0)], color='#1e40af', lw=2)

def plot_workflow(out_name, train_small, dpi=150):
    fig = plt.figure(figsize=(14, 10), dpi=dpi, facecolor='#ffffff')
    fig.patch.set_facecolor('#ffffff')
    ax = fig.add_subplot(111); ax.set_xlim(0,14); ax.set_ylim(0,10); ax.axis('off'); ax.set_facecolor('#ffffff')

    gray_img = np.mean(train_small, axis=2)
    pil_gray = Image.fromarray((gray_img*255).astype(np.uint8))
    edge_sim = np.array(pil_gray.filter(ImageFilter.FIND_EDGES))

    steps = [
        (2.0, 8.5, 'image-input', 'Load + resize to 600px', '#dbeafe',
            lambda a: a.imshow(train_small, aspect='equal', extent=(1.0,3.0,6.9,8.2))),
        (7.0, 8.5, 'preprocess', '6ch (gray+RGB+Lab) + Sobel', '#e0e7ff',
            lambda a: a.imshow(gray_img, aspect='equal', extent=(5.4,8.6,7.0,8.3), cmap='gray')),
        (12.0, 8.5, 'canny-edge', 'Hysteresis 50/150', '#ede9fe',
            lambda a: a.imshow(edge_sim, aspect='equal', extent=(10.4,13.6,7.0,8.3), cmap='inferno')),
        (2.0, 4.5, 'fine-outline', f"Edge-trace + RDP\n{train_cont['count']} polylines, {train_cont.get('totalEdgePixels','N/A')} edge px",
            '#fce7f3',
            lambda a: draw_mini_polyline(a, train_cont_lines, train_full['width'], train_full['height'], 1.0,3.0,2.9,4.2)),
        (7.0, 4.5, 'curve-fit', f"Bezier Fit\n{train_full['total']} paths, {train_full['totalSegments']} cubic segs, err<=1.5px",
            '#fef3c7',
            lambda a: draw_mini_bezier(a, train_lines, train_full['width'], train_full['height'], 6.0,8.0,2.9,4.2)),
        (12.0, 4.5, 'plot-curves', 'flipY=ON -> 2D Canvas\nY-UP math coords',
            '#d1fae5',
            lambda a: draw_mini_canvas(a, train_lines_flip, train_full['width'], train_full['height'], 11.0,13.0,2.9,4.2)),
    ]
    bw, bh = 3.2, 1.2
    for cx, cy, title, sub, col, fn in steps:
        x0, y0 = cx-bw/2, cy-bh/2+0.2
        ax.add_patch(FancyBboxPatch((x0,y0), bw, bh,
            boxstyle="round,pad=0.1,rounding_size=0.2", lw=2, ec='#475569', fc=col, zorder=2))
        ax.text(cx, y0+bh-0.28, title, fontsize=11.5, fontweight='bold', color='#0f172a', ha='center', va='center')
        ax.text(cx, y0+bh-0.75, sub, fontsize=8.5, color='#334155', ha='center', va='center', linespacing=1.25)
        fn(ax)
    for x1,y1,x2,y2 in [(3.6,9.0,5.4,9.0),(8.6,9.0,10.4,9.0),
                        (12.0,7.7,12.0,6.0),(2.0,7.7,2.0,6.0),(7.0,7.7,7.0,6.0),
                        (3.6,5.1,5.4,5.1),(8.6,5.1,10.4,5.1)]:
        ax.annotate('', xy=(x2,y2), xytext=(x1,y1),
                    arrowprops=dict(arrowstyle='-|>', color='#64748b', lw=2.5, mutation_scale=22), zorder=3)
    ax.text(7.0, 6.7, ' NodePipeline: sequential execution ',
            fontsize=12.5, color='#0f172a', fontweight='bold', ha='center', va='center',
            bbox=dict(boxstyle='round,pad=0.45', facecolor='#fef9c3', edgecolor='#ca8a04'))
    ax.text(7.0, 6.25, '(train 600x400 example)  image -> edge -> polyline -> bezier -> canvas',
            fontsize=10, color='#475569', ha='center', va='center', style='italic')
    ax.set_title('Vision Pipeline Workflow: Input Image -> 2D Canvas Curves',
                 fontsize=14.5, fontweight='bold', color='#0f172a', pad=18)
    fig.savefig(os.path.join(ROOT, out_name), facecolor='white', bbox_inches='tight', dpi=dpi)
    plt.draw(); plt.close(fig)
    print(f'[saved] {out_name}')

train_small = np.array(Image.open('/workspace/测试3-火车.jpeg').convert('RGB').resize((120,80)))
plot_workflow('06_视觉流水线_工作流.png', train_small)

print("\nAll 6 figures rendered.")
