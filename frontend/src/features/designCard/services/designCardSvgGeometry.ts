export type DesignCardSvgSize = {
  width: number;
  height: number;
};

const svgOpenTagPattern = /<svg\b([^>]*)>/i;
const viewBoxPattern = /\bviewBox\s*=\s*["']([^"']+)["']/i;
const widthPattern = /\bwidth\s*=\s*["']([^"']+)["']/i;
const heightPattern = /\bheight\s*=\s*["']([^"']+)["']/i;

export function getDesignCardSvgSize(svg: string): DesignCardSvgSize | null {
  const openTag = svg.match(svgOpenTagPattern)?.[1] ?? "";
  if (!openTag) {
    return null;
  }

  const viewBox = openTag.match(viewBoxPattern)?.[1];
  const viewBoxValues = viewBox
    ?.trim()
    .split(/[\s,]+/)
    .map((value) => Number(value));
  if (
    viewBoxValues?.length === 4 &&
    Number.isFinite(viewBoxValues[2]) &&
    Number.isFinite(viewBoxValues[3]) &&
    viewBoxValues[2] > 0 &&
    viewBoxValues[3] > 0
  ) {
    return { width: viewBoxValues[2], height: viewBoxValues[3] };
  }

  const width = parseSvgLength(openTag.match(widthPattern)?.[1]);
  const height = parseSvgLength(openTag.match(heightPattern)?.[1]);
  if (width && height) {
    return { width, height };
  }

  return null;
}

export function getDesignCardSvgAspectRatio(svg: string) {
  const size = getDesignCardSvgSize(svg);
  return size ? `${size.width} / ${size.height}` : undefined;
}

function parseSvgLength(value?: string) {
  if (!value || value.includes("%")) {
    return null;
  }

  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
