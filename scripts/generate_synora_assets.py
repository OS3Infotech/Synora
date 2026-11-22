import os
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import distance_transform_edt, map_coordinates, rotate

SOURCE_PATH = "/home/rushi/.gemini/antigravity/brain/107a013f-8f3d-4480-b48a-e15befe03da9/.user_uploaded/media_1795320875513_a4e945bb.png"
ROOT_DIR = "/home/rushi/Nora"

# Brand colors
BG_COLOR = (37, 44, 53, 255)       # #252c35 dark slate
CYAN_COLOR = (88, 238, 218)        # #58eedc radiant cyan
WHITE_COLOR = (255, 255, 255)      # Pure white for monochrome icon

def extract_sdf_and_logo():
    src_im = Image.open(SOURCE_PATH).convert('RGB')
    arr = np.array(src_im, dtype=float)
    bg = np.array([37.0, 44.0, 53.0])

    # 1. Extract emblem crop [90:148, 76:138]
    emblem_rgb = arr[90:148, 76:138]
    diff = np.linalg.norm(emblem_rgb - bg, axis=2)
    max_dist = np.percentile(diff[diff > 50], 98)

    alpha = np.clip(diff / max_dist, 0.0, 1.0)
    alpha = np.where(alpha < 0.08, 0.0, alpha)

    ys, xs = np.indices(alpha.shape)
    total_w = np.sum(alpha)
    cx = np.sum(xs * alpha) / total_w
    cy = np.sum(ys * alpha) / total_w

    size = 128
    mid = size / 2.0
    canvas_alpha = np.zeros((size, size), dtype=float)
    y0 = int(round(mid - cy))
    x0 = int(round(mid - cx))
    canvas_alpha[y0:y0+alpha.shape[0], x0:x0+alpha.shape[1]] = alpha

    # Symmetrize 3-fold (120 deg) and bilateral mirror
    r0 = canvas_alpha
    r120 = rotate(canvas_alpha, 120.0, reshape=False, order=3)
    r240 = rotate(canvas_alpha, 240.0, reshape=False, order=3)
    sym_alpha = (r0 + r120 + r240) / 3.0

    mirror_alpha = np.fliplr(sym_alpha)
    sym_alpha = (sym_alpha + mirror_alpha) / 2.0
    r0 = sym_alpha
    r120 = rotate(sym_alpha, 120.0, reshape=False, order=3)
    r240 = rotate(sym_alpha, 240.0, reshape=False, order=3)
    final_alpha = (r0 + r120 + r240) / 3.0

    mask = final_alpha > 0.45
    d_in = distance_transform_edt(mask)
    d_out = distance_transform_edt(~mask)
    sdf = d_in - d_out

    # 2. Extract full logo (emblem + Synora text)
    full_crop = arr[86:154, 72:328]
    diff_full = np.linalg.norm(full_crop - bg, axis=2)
    alpha_full = np.clip(diff_full / 180.0, 0.0, 1.0)
    alpha_full = np.where(alpha_full < 0.07, 0.0, alpha_full)

    fg_full = np.zeros_like(full_crop)
    mask_full = alpha_full > 0.01
    for c in range(3):
        fg_full[:, :, c] = np.where(mask_full, np.clip((full_crop[:, :, c] - bg[c] * (1.0 - alpha_full)) / np.maximum(alpha_full, 1e-4), 0, 255), 0)

    out_full = np.zeros((full_crop.shape[0], full_crop.shape[1], 4), dtype=np.uint8)
    out_full[:, :, :3] = np.round(fg_full).astype(np.uint8)
    out_full[:, :, 3] = np.round(alpha_full * 255).astype(np.uint8)

    full_logo_im = Image.fromarray(out_full, 'RGBA')
    trimmed_full_logo = full_logo_im.crop(full_logo_im.getbbox())

    return sdf, mid, trimmed_full_logo

def render_emblem(sdf, mid, target_dim, emblem_span, color=CYAN_COLOR, bg_color=None):
    scale = 56.0 / emblem_span
    y_coords = (np.arange(target_dim) - target_dim / 2.0) * scale + mid
    x_coords = (np.arange(target_dim) - target_dim / 2.0) * scale + mid
    grid_y, grid_x = np.meshgrid(y_coords, x_coords, indexing='ij')

    sampled_sdf = map_coordinates(sdf, [grid_y, grid_x], order=3, mode='constant', cval=-20.0)
    edge_width = scale * 1.4
    a = np.clip((sampled_sdf + edge_width / 2.0) / edge_width, 0.0, 1.0)

    out = np.zeros((target_dim, target_dim, 4), dtype=np.uint8)
    if bg_color is not None:
        out[:, :, 0] = bg_color[0]
        out[:, :, 1] = bg_color[1]
        out[:, :, 2] = bg_color[2]
        out[:, :, 3] = bg_color[3] if len(bg_color) > 3 else 255
        for c in range(3):
            out[:, :, c] = np.round(out[:, :, c] * (1.0 - a) + color[c] * a).astype(np.uint8)
    else:
        out[:, :, 0] = color[0]
        out[:, :, 1] = color[1]
        out[:, :, 2] = color[2]
        out[:, :, 3] = np.round(a * 255).astype(np.uint8)

    return Image.fromarray(out, 'RGBA')

def render_squircle_icon(sdf, mid, size=512, padding=48, radius=80, emblem_span=290):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    squircle_size = size - 2 * padding

    # 1. Render squircle background
    squircle = Image.new('RGBA', (squircle_size, squircle_size), (0, 0, 0, 0))
    mask = Image.new('L', (squircle_size, squircle_size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, squircle_size - 1, squircle_size - 1], radius=radius, fill=255)

    bg_fill = Image.new('RGBA', (squircle_size, squircle_size), BG_COLOR)
    squircle.paste(bg_fill, (0, 0), mask)

    # 2. Render emblem centered inside squircle
    emblem = render_emblem(sdf, mid, squircle_size, emblem_span, color=CYAN_COLOR, bg_color=None)
    squircle.alpha_composite(emblem)

    # 3. Paste into final canvas with padding
    canvas.paste(squircle, (padding, padding), squircle)
    return canvas

def main():
    print("Extracting Synora emblem SDF and full logo...")
    sdf, mid, full_logo = extract_sdf_and_logo()

    # 1. Mobile & Web App Icons
    print("Generating assets/images/icon.png (1024x1024)...")
    icon_1024 = render_emblem(sdf, mid, 1024, emblem_span=600, bg_color=BG_COLOR)
    icon_1024.save(os.path.join(ROOT_DIR, "assets/images/icon.png"))
    icon_1024.save(os.path.join(ROOT_DIR, "metadata/en-US/images/icon.png"))

    print("Generating assets/images/adaptive-icon.png (1024x1024)...")
    adaptive_icon = render_emblem(sdf, mid, 1024, emblem_span=540, bg_color=None)
    adaptive_icon.save(os.path.join(ROOT_DIR, "assets/images/adaptive-icon.png"))

    print("Generating assets/images/monochrome-icon.png (1024x1024)...")
    monochrome_icon = render_emblem(sdf, mid, 1024, emblem_span=540, color=WHITE_COLOR, bg_color=None)
    monochrome_icon.save(os.path.join(ROOT_DIR, "assets/images/monochrome-icon.png"))

    print("Generating assets/images/splash-icon.png (512x512)...")
    splash_icon = render_emblem(sdf, mid, 512, emblem_span=280, bg_color=None)
    splash_icon.save(os.path.join(ROOT_DIR, "assets/images/splash-icon.png"))

    print("Generating assets/images/favicon.png (512x512 squircle)...")
    favicon = render_squircle_icon(sdf, mid, size=512, padding=16, radius=110, emblem_span=340)
    favicon.save(os.path.join(ROOT_DIR, "assets/images/favicon.png"))

    # 2. Desktop Icons
    print("Generating desktop/icon.png & desktop/resources/icon.png (512x512)...")
    desktop_icon = render_squircle_icon(sdf, mid, size=512, padding=48, radius=80, emblem_span=290)
    desktop_icon.save(os.path.join(ROOT_DIR, "desktop/icon.png"))
    desktop_icon.save(os.path.join(ROOT_DIR, "desktop/resources/icon.png"))

    build_dir = os.path.join(ROOT_DIR, "desktop/build")
    os.makedirs(build_dir, exist_ok=True)
    desktop_icon.save(os.path.join(build_dir, "icon.png"))

    print("Generating desktop/build/icon.ico (Windows multi-resolution icon)...")
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    desktop_icon.save(os.path.join(build_dir, "icon.ico"), format='ICO', sizes=ico_sizes)
    desktop_icon.save(os.path.join(build_dir, "installerIcon.ico"), format='ICO', sizes=ico_sizes)
    desktop_icon.save(os.path.join(build_dir, "uninstallerIcon.ico"), format='ICO', sizes=ico_sizes)

    # 3. Windows AppX Tile Assets
    print("Generating desktop/build/appx/ assets...")
    appx_dir = os.path.join(ROOT_DIR, "desktop/build/appx")
    os.makedirs(appx_dir, exist_ok=True)

    sq150 = render_emblem(sdf, mid, 150, emblem_span=100, bg_color=None)
    sq150.save(os.path.join(appx_dir, "Square150x150Logo.png"))

    sq44 = render_emblem(sdf, mid, 44, emblem_span=32, bg_color=None)
    sq44.save(os.path.join(appx_dir, "Square44x44Logo.png"))

    store_400 = render_emblem(sdf, mid, 200, emblem_span=140, bg_color=None)
    store_400.save(os.path.join(appx_dir, "StoreLogo.scale-400.png"))

    store = render_emblem(sdf, mid, 25, emblem_span=18, bg_color=None)
    store.save(os.path.join(appx_dir, "StoreLogo.png"))

    # Wide 310x150: Place full logo centered
    wide_canvas = Image.new('RGBA', (310, 150), (0, 0, 0, 0))
    # Resize full logo maintaining aspect ratio (target height ~64px, width ~265px)
    target_h = 62
    aspect = full_logo.width / full_logo.height
    target_w = int(round(target_h * aspect))
    resized_logo = full_logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    x_pos = (310 - target_w) // 2
    y_pos = (150 - target_h) // 2
    wide_canvas.paste(resized_logo, (x_pos, y_pos), resized_logo)
    wide_canvas.save(os.path.join(appx_dir, "Wide310x150Logo.png"))

    # 4. Save branding assets for app/documentation
    full_logo.save(os.path.join(ROOT_DIR, "assets/images/synora-logo.png"))
    emblem_512 = render_emblem(sdf, mid, 512, emblem_span=480, bg_color=None)
    emblem_512.save(os.path.join(ROOT_DIR, "assets/images/synora-emblem.png"))

    print("All Synora icon and logo assets successfully generated!")

if __name__ == "__main__":
    main()
