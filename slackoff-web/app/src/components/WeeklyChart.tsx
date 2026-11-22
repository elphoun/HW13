import { Bar, BarChart, CartesianGrid, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../state/AppState';
import { DAY_LABELS } from '../lib/dates';

// Two series, one axis. "Last week" is the recessive neutral, "This week" the accent; both labelled in the legend and tooltip.
export const CHART_THIS = '#ff6b3d';
export const CHART_LAST = '#9aa5c4';

export function WeeklyChart() {
  const { stats, data } = useApp();
  const rows = DAY_LABELS.map((d, i) => ({ day: d.slice(0, 2), full: d, 'This week': stats.thisWeek[i], 'Last week': stats.lastWeek[i] }));
  const diff = stats.thisWeekTotal - stats.lastWeekTotal;
  return (
    <section className="card">
      <h3>📈 Weekly progress</h3>
      <p className="muted small">
        {stats.thisWeekTotal} this week vs {stats.lastWeekTotal} last week{' '}
        <b className={diff >= 0 ? 'up' : 'down'}>{diff === 0 ? '(even)' : diff > 0 ? `▲ +${diff}` : `▼ ${diff}`}</b>
      </p>
      <div className="chart-box" role="img" aria-label={`Activities per day. This week: ${stats.thisWeek.join(', ')}. Last week: ${stats.lastWeek.join(', ')}.`}>
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={rows} margin={{ top: 6, right: 4, left: -22, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="rgba(60,60,100,.12)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b6f8d' }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b6f8d' }} />
            <ReferenceLine y={data.settings.dailyGoal} stroke="#2f9e44" strokeDasharray="4 3" label={{ value: 'goal', position: 'insideTopRight', fontSize: 10, fill: '#2f7d3a' }} />
            <Tooltip cursor={{ fill: 'rgba(120,120,180,.1)' }} labelFormatter={(_l, p) => p?.[0]?.payload.full ?? ''} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,.15)', fontSize: 12 }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Last week" fill={CHART_LAST} radius={[4, 4, 0, 0]} maxBarSize={10} />
            <Bar dataKey="This week" fill={CHART_THIS} radius={[4, 4, 0, 0]} maxBarSize={10} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
