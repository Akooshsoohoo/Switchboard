"""Render the code-defined terminal mark as PNG and a multi-size Windows icon."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'assets'
size = 1024
SIZES = [(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)]

def render(top, bottom, glyph):
    im = Image.new('RGBA', (size, size))
    mask = Image.new('L', (size, size))
    ImageDraw.Draw(mask).rounded_rectangle((32, 32, 992, 992), radius=216, fill=255)
    gradient = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(gradient)
    for y in range(size):
        t = y / (size - 1)
        rgb = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        draw.line((0, y, size, y), fill=(*rgb, 255))
    im.paste(gradient, mask=mask)
    draw = ImageDraw.Draw(im)
    draw.rounded_rectangle((160, 208, 864, 816), radius=120, outline=glyph, width=48)
    for points in [[(304, 384), (460, 512), (304, 640)], [(556, 640), (712, 640)]]:
        draw.line(points, fill=glyph, width=60, joint='curve')
        for x, y in points:
            draw.ellipse((x-30, y-30, x+30, y+30), fill=glyph)
    return im

dark = render((69, 71, 76), (38, 39, 43), '#eeeef2')
dark.resize((256, 256), Image.Resampling.LANCZOS).save(root / 'switchboard.png')
dark.save(root / 'switchboard.ico', sizes=SIZES)
# Light-mode variant: pale tile with a dark mark.
light = render((250, 250, 251), (226, 226, 230), '#35353b')
light.resize((256, 256), Image.Resampling.LANCZOS).save(root / 'switchboard-light.png')
light.save(root / 'switchboard-light.ico', sizes=SIZES)
