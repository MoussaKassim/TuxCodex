#!/usr/bin/env python3
"""Locate the bright SVG test image in an Xvfb screenshot."""

import sys
from PIL import Image

mode, path = sys.argv[1:3]
image = Image.open(path).convert("RGB")
points = [
    (index % image.width, index // image.width)
    for index, (red, green, blue) in enumerate(image.getdata())
    if red > 230 and green < 35 and blue > 230
]

if mode == "thumbnail" and 3_000 <= len(points) < 50_000:
    x = sum(point[0] for point in points) // len(points)
    y = sum(point[1] for point in points) // len(points)
    print(x, y, len(points))
elif mode == "viewer" and len(points) >= 50_000:
    print(len(points))
else:
    sys.exit(1)
