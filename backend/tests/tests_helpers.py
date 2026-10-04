import io

from PIL import Image


def jpeg(seed_val: int = 0, size=(640, 480), exif: bool = False) -> bytes:
    img = Image.new("RGB", size, (seed_val * 40 % 255, 120, 200 - seed_val * 30 % 200))
    for i in range(0, size[0], 40):  # some structure so the perceptual hash isn't flat
        for j in range(0, size[1], 40):
            if (i // 40 + j // 40 + seed_val) % 3 == 0:
                img.paste((255 - seed_val * 20 % 255, 50, 50), (i, j, i + 30, j + 30))
    out = io.BytesIO()
    if exif:
        ex = Image.Exif()
        ex[0x8769] = {36867: "2026:10:03 14:22:05"}
        ex[0x8825] = {1: "N", 2: (40.0, 26.0, 46.0), 3: "W", 4: (79.0, 58.0, 56.0)}
        img.save(out, "JPEG", exif=ex)
    else:
        img.save(out, "JPEG")
    return out.getvalue()


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "demo-password"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
