import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const monthAbbr = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function BarChart({ data }) {
  const labels = data.map((d) => {
    const [y, m, day] = d.Fecha.split('-');
    return `${parseInt(day, 10)} ${monthAbbr[parseInt(m, 10) - 1]} ${y}`;
  });

  const pctOf = (val, total) => (total ? (val / total) * 100 : 0);
  const pctA = data.map((d) => pctOf(d.Plan_A, d.Total));
  const pctB = data.map((d) => pctOf(d.Plan_B, d.Total));
  const pctE = data.map((d) => pctOf(d.Error, d.Total));

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Plan A',
        data: pctA,
        absolute: data.map((d) => d.Plan_A),
        backgroundColor: '#0072f0',
      },
      {
        label: 'Error',
        data: pctE,
        absolute: data.map((d) => d.Error),
        backgroundColor: '#f15a60',
      },
      {
        label: 'Plan B',
        data: pctB,
        absolute: data.map((d) => d.Plan_B),
        backgroundColor: '#ffa800',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          usePointStyle: true,
          pointStyle: 'rect',
          padding: 16,
          font: { size: 13, weight: '600' },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(26,35,50,0.95)',
        padding: 12,
        titleFont: { size: 13, weight: '600' },
        bodyFont: { size: 12 },
        callbacks: {
          label: (ctx) => {
            const pct = ctx.parsed.y.toFixed(2);
            const abs = ctx.dataset.absolute[ctx.dataIndex];
            return `${ctx.dataset.label}: ${pct}% (${abs.toLocaleString('en-US')})`;
          },
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: {
          font: { size: 10 },
          color: '#6b7280',
          maxRotation: 45,
          minRotation: 45,
        },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        max: 100,
        grid: { color: '#e5e7eb' },
        ticks: {
          font: { size: 11 },
          color: '#6b7280',
          stepSize: 20,
          callback: (v) => v + '%',
        },
      },
    },
  };

  return (
    <div className="chart-wrapper">
      <Bar data={chartData} options={options} />
    </div>
  );
}

export default BarChart;
