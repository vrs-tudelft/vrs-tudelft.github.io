/* Research readouts derived only from already-published aggregate groups. */
export function supportedBands(record, minN = 20) {
  return (record?.bands || []).filter(b => b.n >= minN && Number.isFinite(b.lo) && Number.isFinite(b.hi) && b.hi > b.lo);
}

export function heightSummary(record, attrs, minN = 20) {
  const bands = supportedBands(record, minN);
  return {
    points: record?.n ?? null,
    bands: bands.length,
    roof: Number.isFinite(attrs?.height_agl) ? attrs.height_agl : null,
    highest: Number.isFinite(record?.h_agl?.max) ? record.h_agl.max : null,
    publishedPoints: bands.reduce((sum, b) => sum + b.n, 0)
  };
}

export function heightContrast(record, minN = 20) {
  const bands = supportedBands(record, minN).filter(b => Array.isArray(b.series) && b.series.length>1).sort((a,b) => a.lo - b.lo);
  if (bands.length < 2) return null;
  const low = bands[0], high = bands[bands.length - 1];
  if (low.series.length !== high.series.length) return null;
  const series = high.series.map((v,i) => Number.isFinite(v) && Number.isFinite(low.series[i]) ? v - low.series[i] : null);
  return series.some(Number.isFinite) ? {low,high,series} : null;
}

export function heightProfile(record, attrs, colour, minN = 20) {
  const summary = heightSummary(record, attrs, minN), bands = supportedBands(record, minN);
  const top = Math.max(20, Math.ceil(Math.max(summary.roof || 0, summary.highest || 0) / 10) * 10);
  const w = 320, h = 268, left = 42, right = 238, y0 = 26, y1 = 230;
  const y = v => y1 - v / top * (y1 - y0);
  const max = Math.max(20, ...bands.map(b => b.n));
  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Published radar support by height, with roof and highest radar point" xmlns="http://www.w3.org/2000/svg">';
  svg += '<text x="3" y="12" font-size="10" fill="#65717a">m above ground</text><text x="238" y="12" text-anchor="end" font-size="10" fill="#65717a">radar points / slab</text>';
  for (let lo=0; lo<top; lo+=10) {
    const b = bands.find(b => b.lo === lo), yy = y(lo+10), hh = y(lo)-yy;
    svg += '<rect x="' + left + '" y="' + (yy+1) + '" width="' + (right-left) + '" height="' + Math.max(1,hh-2) + '" rx="2" fill="#edf0f1"/>';
    if (b) {
      const width = Math.max(3, (right-left) * b.n / max);
      svg += '<rect x="' + left + '" y="' + (yy+1) + '" width="' + width + '" height="' + Math.max(1,hh-2) + '" rx="2" fill="' + colour(b.n) + '"><title>' + b.lo + '–' + b.hi + ' m: ' + b.n + ' radar points; an aggregate, not continuous coverage</title></rect>';
      svg += '<text x="' + (right+7) + '" y="' + (yy+hh/2+3) + '" font-size="10" fill="#34434b">' + b.n + '</text>';
    }
    if (lo % 20 === 0) svg += '<text x="34" y="' + (y(lo)+3) + '" text-anchor="end" font-size="10" fill="#65717a">' + lo + '</text>';
  }
  if (summary.roof !== null) svg += '<path d="M38 ' + y(summary.roof) + 'H310" stroke="#34434b" stroke-dasharray="4 3"/><text x="309" y="' + (y(summary.roof)-4) + '" text-anchor="end" font-size="10" fill="#34434b">roof ' + summary.roof.toFixed(1) + ' m</text>';
  if (summary.highest !== null) svg += '<path d="M38 ' + y(summary.highest) + 'H238" stroke="#15688f" stroke-width="1.5"/><text x="42" y="250" font-size="10" fill="#15688f">highest retained point: ' + summary.highest.toFixed(1) + ' m</text>';
  else svg += '<text x="42" y="250" font-size="10" fill="#65717a">No publishable radar group for this building</text>';
  return svg + '</svg>';
}
