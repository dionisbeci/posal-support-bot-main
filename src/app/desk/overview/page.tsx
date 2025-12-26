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
import { collection, query, where, getDocs, Timestamp, orderBy, getCountFromServer, limit } from 'firebase/firestore';
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

        // 1. Optimized Counts (Very cheap reads)
        const totalCountQuery = query(
          collection(db, 'conversations'),
          where('lastMessageAt', '>=', sevenDaysAgo)
        );
        const humanInvolvedQuery = query(
          collection(db, 'conversations'),
          where('lastMessageAt', '>=', sevenDaysAgo),
          where('humanInvolved', '==', true)
        );

        const [totalSnap, humanSnap] = await Promise.all([
          getCountFromServer(totalCountQuery),
          getCountFromServer(humanInvolvedQuery)
        ]);

        const total = totalSnap.data().count;
        const humanInvolvedCount = humanSnap.data().count;
        const handoffRate = total > 0 ? Math.round((humanInvolvedCount / total) * 100) : 0;

        // 2. Limited Fetch for Chart & Agents (100 is enough for 7d view)
        const q = query(
          collection(db, 'conversations'),
          where('lastMessageAt', '>=', sevenDaysAgo),
          orderBy('lastMessageAt', 'desc'),
          limit(100)
        );

        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as any));

        // 3. Active Agents from the sample
        const agentIds = new Set();
        docs.forEach(d => {
          if (d.agent) {
            const id = typeof d.agent === 'object' && 'id' in d.agent ? d.agent.id : d.agent;
            if (id) agentIds.add(id);
          }
        });

        // 4. Optimized Response Time (Only sample 10 chats, fetch first 15 messages each)
        let totalResponseTime = 0;
        let responseCount = 0;

        if (docs.length > 0) {
          const sampleDocs = docs.filter(d => d.humanInvolved).slice(0, 10);
          await Promise.all(sampleDocs.map(async (convo) => {
            const mq = query(
              collection(db, 'messages'),
              where('conversationId', '==', convo.id),
              orderBy('timestamp', 'asc'),
              limit(15)
            );
            const mSnap = await getDocs(mq);
            const msgs = mSnap.docs.map(m => ({ ...m.data(), id: m.id } as any));

            // Find first transition User -> (AI or Agent)
            for (let i = 0; i < msgs.length - 1; i++) {
              const current = msgs[i];
              const next = msgs[i + 1];
              if (current.role === 'user' && (next.role === 'ai' || next.role === 'agent')) {
                const start = current.timestamp instanceof Timestamp ? current.timestamp.toDate().getTime() : new Date(current.timestamp).getTime();
                const end = next.timestamp instanceof Timestamp ? next.timestamp.toDate().getTime() : new Date(next.timestamp).getTime();
                const diff = (end - start) / 1000;
                if (diff > 0 && diff < 3600) {
                  totalResponseTime += diff;
                  responseCount++;
                  break; // Only take the first response per chat
                }
              }
            }
          }));
        }

        const avgResponseTimeSeconds = responseCount > 0 ? Math.round(totalResponseTime / responseCount) : null;
        const responseTimeStr = avgResponseTimeSeconds
          ? (avgResponseTimeSeconds < 60 ? `${avgResponseTimeSeconds}s` : `${Math.round(avgResponseTimeSeconds / 60)}m ${avgResponseTimeSeconds % 60}s`)
          : 'N/A';

        setStats([
          { title: 'Total Conversations (7d)', value: total.toString(), change: '', icon: MessageSquare },
          { title: 'Avg. Response Time', value: responseTimeStr, change: '', icon: Clock },
          { title: 'AI Handoff Rate', value: `${handoffRate}%`, change: '', icon: Bot },
          { title: 'Active Agents', value: agentIds.size.toString(), change: '', icon: Users },
        ]);

        // 5. Chart Data (Sort by date asc for chart)
        const days = [];
        for (let i = 0; i < 7; i++) days.push(subDays(new Date(), i));
        days.reverse();

        const data = days.map(day => {
          const dayDocs = docs.filter(d => {
            const date = d.lastMessageAt instanceof Timestamp ? d.lastMessageAt.toDate() : new Date(d.lastMessageAt);
            return isSameDay(date, day);
          });
          const humanCount = dayDocs.filter(d => d.humanInvolved || d.status === 'active' || d.status === 'pending').length;
          return {
            date: format(day, 'EEE'),
            total: dayDocs.length,
            ai: dayDocs.length - humanCount,
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
