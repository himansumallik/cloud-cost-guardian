import dotenv from 'dotenv';
dotenv.config();

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ccg_user:ccg_password@localhost:5432/cloud_cost_guardian',
  awsRegion: process.env.AWS_REGION || 'ap-south-1',
  demoMode: process.env.DEMO_MODE !== 'false',
  dryRunDefault: process.env.DRY_RUN_DEFAULT !== 'false',
  idleCpuThreshold: Number(process.env.IDLE_CPU_THRESHOLD || 5.0),
  lookbackDays: Number(process.env.LOOKBACK_DAYS || 14),
};
