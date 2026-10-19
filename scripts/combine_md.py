#!/usr/bin/env python3
"""
按 mkdocs.yml 的 nav 顺序把 docs_dir（本仓库是 chapters/）下的 Markdown 文件合并成一个 book.md。
用法:
  python scripts/combine_md.py --config mkdocs.yml --docs-dir chapters --output book.md

输出: book.md

"""
import argparse
import yaml
from pathlib import Path
import sys


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--config", default="mkdocs.yml", help="mkdocs config path")
    p.add_argument("--docs-dir", default="chapters", help="docs directory relative to repo root")
    p.add_argument("--output", default="book.md", help="output markdown file")
    return p.parse_args()


def flatten_nav_item(item, out):
    # item can be a str (path), or dict {title: path_or_list}
    if isinstance(item, str):
        out.append(item)
    elif isinstance(item, dict):
        for k, v in item.items():
            if isinstance(v, str):
                out.append(v)
            elif isinstance(v, list):
                for sub in v:
                    flatten_nav_item(sub, out)
            else:
                # unexpected
                pass
    else:
        pass


def flatten_nav(nav):
    files = []
    for entry in nav:
        flatten_nav_item(entry, files)
    return files


def main():
    args = parse_args()
    cfg_path = Path(args.config)
    if not cfg_path.exists():
        print("mkdocs config not found:", cfg_path, file=sys.stderr)
        sys.exit(1)
    cfg = yaml.safe_load(cfg_path.read_text(encoding="utf-8"))
    nav = cfg.get("nav")
    if not nav:
        print("mkdocs.yml 没有找到 nav，无法确定合并顺序", file=sys.stderr)
        sys.exit(1)
    files = flatten_nav(nav)
    docs_dir = Path(args.docs_dir)
    out_path = Path(args.output)
    with out_path.open("w", encoding="utf-8") as outf:
        # 写个封面标题（可自定义）
        title = cfg.get("site_name", "")
        if title:
            outf.write(f"# {title}\n\n")
        # 写目录标记（交给 pandoc 生成 TOC）
        for idx, rel in enumerate(files):
            # 跳过空或非字符串项
            if not isinstance(rel, str):
                continue
            src = docs_dir / rel
            if not src.exists():
                print(f"警告：文件不存在，跳过: {src}", file=sys.stderr)
                continue
            content = src.read_text(encoding="utf-8")
            # 如果文件是索引页 index.md，可能包含封面信息；仍按顺序合并
            outf.write(f"\n\n<!-- START FILE: {rel} -->\n\n")
            outf.write(content)
            # 在章节末尾加入分页（对于 XeLaTeX 生效）
            outf.write("\n\n\\newpage\n\n")
    print("合并完成，输出:", out_path)


if __name__ == "__main__":
    main()
