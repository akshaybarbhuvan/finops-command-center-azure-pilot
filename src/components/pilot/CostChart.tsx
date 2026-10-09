"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function CostChart({ points, currency }: { points: { date: string; actual: number | null; amortized: number | null }[]; currency: string }) {
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, currencyDisplay: "code", maximumFractionDigits: 0 });
  return (
    <div className="h-72" role="img" aria-label={`Daily ${currency} cost, actual and amortized`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmt.format(v)} width={90} />
          <Tooltip formatter={(v: number) => fmt.format(v)} />
          <Legend />
          <Line type="monotone" dataKey="actual" name="Actual cost" stroke="#0072CE" dot={false} connectNulls={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="amortized" name="Amortized cost" stroke="#00A3E0" strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
