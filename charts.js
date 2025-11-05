// charts.js – tiny vanilla sparkline (SVG), no external libs

export function drawSparkline(svgEl, series){
  const w = svgEl.clientWidth || 600;
  const h = svgEl.clientHeight || 48;
  const padX = 8, padY = 6;

  svgEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
  if (!series || series.length === 0) return;

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);

  const stepX = (w - padX*2) / Math.max(1, series.length - 1);
  const yScale = v => h - padY - ((v - min) / span) * (h - padY*2);

  // line path
  let d = "";
  series.forEach((v, i) => {
    const x = padX + i * stepX;
    const y = yScale(v);
    d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
  });
  const path = ns("path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("opacity", "0.9");
  svgEl.appendChild(path);

  // baseline (min value line)
  const baseY = yScale(min);
  const base = ns("line");
  base.setAttribute("x1", String(padX));
  base.setAttribute("y1", String(baseY));
  base.setAttribute("x2", String(w - padX));
  base.setAttribute("y2", String(baseY));
  base.setAttribute("stroke", "currentColor");
  base.setAttribute("opacity", "0.25");
  svgEl.appendChild(base);

  // last dot
  const lastX = padX + (series.length - 1) * stepX;
  const lastY = yScale(series[series.length - 1]);
  const dot = ns("circle");
  dot.setAttribute("cx", String(lastX));
  dot.setAttribute("cy", String(lastY));
  dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", "currentColor");
  svgEl.appendChild(dot);
}

function ns(tag){ return document.createElementNS("http://www.w3.org/2000/svg", tag); }
