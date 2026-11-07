// Phase 5: AWS CloudWatch Metrics Pipeline
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { env } from '../config/env.js';

export class MetricsService {
  public static async getEc2CpuSeries(instanceId: string, region = env.awsRegion): Promise<number[]> {
    if (env.demoMode) {
      return [1.8, 2.1, 1.6, 1.9, 2.0, 1.5, 1.7, 1.8, 2.2, 1.6, 1.9, 1.7, 1.8, 1.9];
    }

    const cw = new CloudWatchClient({ region });
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - env.lookbackDays * 24 * 60 * 60 * 1000);

    const response = await cw.send(
      new GetMetricStatisticsCommand({
        Namespace: 'AWS/EC2',
        MetricName: 'CPUUtilization',
        Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
        StartTime: startTime,
        EndTime: endTime,
        Period: 86400,
        Statistics: ['Average'],
      })
    );

    const datapoints = (response.Datapoints || []).sort(
      (a, b) => (a.Timestamp?.getTime() || 0) - (b.Timestamp?.getTime() || 0)
    );
    return datapoints.map((dp) => Number((dp.Average || 0).toFixed(2)));
  }
}
