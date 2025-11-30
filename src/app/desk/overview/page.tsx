'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Users,
  MessageSquare,
  Clock,
  Bot,
  Loader2
} from 'lucide-react';
import {
  ChartContainer,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  AreaChart,
  BarChart,
  Area,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { subDays, format, isSameDay, startOfDay } from 'date-fns';

const chartConfig = {
  total: {
    label: 'Total',
    color: 'hsl(var(--chart-1))',
  },
  ai: {
    label: 'AI Handled',
    color: 'hsl(var(--chart-2))',
  },
  human: {
    label: 'Human Handled',
    color: 'hsl(var(--accent))',
  },
};

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    {
      title: 'Total Conversations (7d)',
      value: '0',
      change: '',
      icon: MessageSquare,
    },
    {
      title: 'Avg. Response Time',
      value: 'N/A', // Hard to calc without more data
      change: '',
      icon: Clock,
    },
    {
      title: 'AI Handoff Rate',
      value: '0%',
      change: '',
      icon: Bot,
    },
    {
      title: 'Active Agents',
      value: '0',
      change: '',
      icon: Users,
    },
  ]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const sevenDaysAgo = subDays(new Date(), 7);
        const q = query(
          collection(db, 'conversations'),
          where('lastMessageAt', '>=', sevenDaysAgo),
          orderBy('lastMessageAt', 'asc')
        );

        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => d.data());

        // 1. Total Conversations
        const total = docs.length;

        // 2. AI Handoff Rate (Pending + Active / Total)
        // Assuming 'ai' status means purely AI, others mean human involved/needed
        const humanInvolved = docs.filter(d => d.status === 'active' || d.status === 'pending').length;
        const handoffRate = total > 0 ? Math.round((humanInvolved / total) * 100) : 0;

        // 3. Active Agents
        const agents = new Set(docs.map(d => d.agent?.id).filter(Boolean));
        const activeAgents = agents.size;

        setStats([
          {
            title: 'Total Conversations (7d)',
            value: total.toString(),
            change: '', // We'd need previous period data for this
            icon: MessageSquare,
          },
          {
            title: 'Avg. Response Time',
            value: 'N/A',
            change: '',
            icon: Clock,
          },
          {
            title: 'AI Handoff Rate',
            value: `${handoffRate}%`,
            change: '',
            icon: Bot,
          },
          {
            title: 'Active Agents',
            value: activeAgents.toString(),
            change: '',
            icon: Users,
          },
        ]);

        // 4. Chart Data
        // Group by day
        const days = [];
        for (let i = 0; i < 7; i++) {
          days.push(subDays(new Date(), i));
        }
        days.reverse();

        const data = days.map(day => {
          const dayDocs = docs.filter(d => {
            const date = d.lastMessageAt instanceof Timestamp ? d.lastMessageAt.toDate() : new Date(d.lastMessageAt);
            return isSameDay(date, day);
          });

          const aiCount = dayDocs.filter(d => d.status === 'ai').length;
          const humanCount = dayDocs.filter(d => d.status === 'active' || d.status === 'pending').length;

          return {
            date: format(day, 'EEE'), // Mon, Tue...
            total: dayDocs.length,
            ai: aiCount,
            human: humanCount
          };
        });

        setChartData(data);

      } catch (error) {
        console.error("Error fetching overview stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              {stat.change && (
                <p
                  className={`text-xs text-muted-foreground ${stat.change.startsWith('+')
                      ? 'text-green-600'
                      : 'text-red-600'
                    }`}
                >
                  {stat.change} from last week
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Conversation Volume (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart
                accessibilityLayer
                data={chartData}
                margin={{
                  left: 12,
                  right: 12,
                }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <Tooltip cursor={false} content={<ChartTooltipContent />} />
                <Legend content={<ChartLegendContent />} />
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-total)"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-total)"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <Area
                  dataKey="total"
                  type="natural"
                  fill="url(#colorTotal)"
                  stroke="var(--color-total)"
                  stackId="1"
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resolution Type (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <BarChart accessibilityLayer data={chartData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <Tooltip
                  cursor={false}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                <Legend content={<ChartLegendContent />} />
                <Bar
                  dataKey="ai"
                  stackId="a"
                  fill="var(--color-ai)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="human"
                  stackId="a"
                  fill="var(--color-human)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
