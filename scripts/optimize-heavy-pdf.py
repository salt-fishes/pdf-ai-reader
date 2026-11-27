#!/usr/bin/env python3
"""Rasterize PDF pages whose content stream is pathologically large.

Some PDFs (typically vector charts/heatmaps exported by iText/Springer) produce
content streams of tens of megabytes and millions of vector operations. pdf.js
must expand the whole stream into an operator list before rendering, which can
consume several gigabytes of RAM. Rasterizing those pages once turns them into
a single image and keeps the viewer under its memory budget.

Requires Python 3 and PyMuPDF (`pip install pymupdf`).

Usage:
    python scripts/optimize-heavy-pdf.py INPUT.pdf [OUTPUT.pdf]
    python scripts/optimize-heavy-pdf.py INPUT.pdf --threshold-mb 5 --scale 3
"""

import argparse
import json
import os
import sys

try:
    import fitz
except ImportError:
    sys.exit("PyMuPDF is required: pip install pymupdf")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", help="source PDF path")
    parser.add_argument("output", nargs="?", help="output PDF path (default: <input>.lite.pdf)")
    parser.add_argument(
        "--threshold-mb",
        type=float,
        default=5.0,
        help="rasterize a page when its content stream exceeds this many MB (default: 5)",
    )
    parser.add_argument(
        "--scale",
        type=float,
        default=3.0,
        help="rasterization scale; 3.0 ≈ 216 dpi (default: 3)",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=88,
        help="JPEG quality for the rasterized page (default: 88)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    src = os.path.abspath(args.input)
    dst = os.path.abspath(args.output or (os.path.splitext(src)[0] + ".lite.pdf"))
    threshold = int(args.threshold_mb * 1024 * 1024)

    doc = fitz.open(src)
    out = fitz.open()
    report = {"input": src, "output": dst, "threshold_bytes": threshold, "pages": []}

    for index, page in enumerate(doc):
        raw = sum(len(doc.xref_stream_raw(xref)) for xref in page.get_contents())
        if raw > threshold:
            pix = page.get_pixmap(
                matrix=fitz.Matrix(args.scale, args.scale),
                alpha=False,
                colorspace=fitz.csRGB,
            )
            image = pix.tobytes("jpeg", jpg_quality=args.quality)
            new_page = out.new_page(width=page.rect.width, height=page.rect.height)
            new_page.insert_image(new_page.rect, stream=image)
            report["pages"].append(
                {
                    "page": index + 1,
                    "action": "rasterized",
                    "stream_bytes": raw,
                    "image_bytes": len(image),
                    "image_size": [pix.width, pix.height],
                }
            )
        else:
            out.insert_pdf(doc, from_page=index, to_page=index)
            report["pages"].append(
                {"page": index + 1, "action": "copied", "stream_bytes": raw}
            )

    out.save(dst, garbage=4, deflate=True)
    report["input_bytes"] = os.path.getsize(src)
    report["output_bytes"] = os.path.getsize(dst)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
