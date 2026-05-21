export function MiniTrend({ data }) {
  const width = 250;
  const height = 72;
  const max = Math.max(...data.map((item) => item.value), 1);
  const points = data.map((item, index) => {
    const x = data.length === 1 ? width / 2 : (index / (data.length - 1)) * width;
    const y = height - (item.value / max) * 52 - 10;
    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="mini-trend" aria-label="最近 7 天调用趋势">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <path className="mini-trend-area" d={area} />
        <path className="mini-trend-line" d={path} />
        {points.map((point) => (
          <circle key={point.label} className="mini-trend-dot" cx={point.x} cy={point.y} r="2.4" />
        ))}
      </svg>
      <div className="mini-trend-labels">
        {data.map((item) => <span key={item.label}>{item.label}</span>)}
      </div>
    </div>
  );
}
