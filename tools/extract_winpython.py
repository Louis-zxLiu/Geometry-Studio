from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import py7zr


SEVEN_Z_SIGNATURE = b"\x37\x7A\xBC\xAF\x27\x1C"


def extract_embedded_7z(exe_path: Path, archive_path: Path) -> None:
    data = exe_path.read_bytes()
    offset = data.find(SEVEN_Z_SIGNATURE)
    if offset < 0:
        raise RuntimeError("7z payload signature not found in WinPython executable")
    archive_path.write_bytes(data[offset:])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", required=True)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--dest", required=True)
    args = parser.parse_args()

    exe_path = Path(args.exe).resolve()
    archive_path = Path(args.archive).resolve()
    dest_path = Path(args.dest).resolve()

    if not exe_path.exists():
        raise FileNotFoundError(exe_path)

    if archive_path.exists():
        archive_path.unlink()
    if dest_path.exists():
        shutil.rmtree(dest_path)
    dest_path.mkdir(parents=True, exist_ok=True)

    extract_embedded_7z(exe_path, archive_path)
    with py7zr.SevenZipFile(archive_path, mode="r") as archive:
        archive.extractall(path=dest_path)


if __name__ == "__main__":
    main()
