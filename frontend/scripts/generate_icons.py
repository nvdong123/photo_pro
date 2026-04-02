from PIL import Image
import os

src = "public/images/Logo_PhotoPro_no_bg.png"
img = Image.open(src).convert("RGBA")

# White background for maskable
for size in [192, 512]:
    bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    resized = img.resize((int(size * 0.8), int(size * 0.8)),
                          Image.LANCZOS)
    offset = (int(size * 0.1), int(size * 0.1))
    bg.paste(resized, offset, resized)
    bg.save(f"public/images/icon-{size}.png")
    print(f"Generated icon-{size}.png")
