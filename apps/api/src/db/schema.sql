-- Cloud Cost Guardian PostgreSQL Schema (Phase 0 & Phase 3)

CREATE TABLE IF NOT EXISTS scan_runs (
    id VARCHAR(64) PRIMARY KEY,
    status VARCHAR(32) NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    region VARCHAR(32) NOT NULL,
    resources_discovered INT DEFAULT 0,
    recommendations_generated INT DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS resources (
    id VARCHAR(64) PRIMARY KEY,
    aws_resource_id VARCHAR(128) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(32) NOT NULL CHECK (resource_type IN ('EC2_INSTANCE', 'EBS_VOLUME', 'S3_BUCKET', 'IAM_ACCESS_KEY')),
    region VARCHAR(32) NOT NULL,
    state VARCHAR(64) NOT NULL,
    instance_type_or_class VARCHAR(64) NOT NULL,
    monthly_cost_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    avg_cpu_percent NUMERIC(5, 2),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    tags JSONB NOT NULL DEFAULT '{}'::jsonb,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS resource_metrics (
    id SERIAL PRIMARY KEY,
    resource_id VARCHAR(64) NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    metric_name VARCHAR(64) NOT NULL,
    metric_value NUMERIC(10, 2) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendations (
    id VARCHAR(64) PRIMARY KEY,
    resource_id VARCHAR(64) NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    aws_resource_id VARCHAR(128) NOT NULL,
    resource_name VARCHAR(255) NOT NULL,
    resource_type VARCHAR(32) NOT NULL,
    rule_id VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    reason TEXT NOT NULL,
    suggested_action VARCHAR(128) NOT NULL,
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('HIGH', 'MEDIUM', 'LOW')),
    estimated_monthly_savings_usd NUMERIC(10, 2) NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTING', 'COMPLETED', 'FAILED')),
    approved_by VARCHAR(128),
    remediation_result TEXT,
    rollback_snapshot_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    recommendation_id VARCHAR(64) REFERENCES recommendations(id) ON DELETE SET NULL,
    aws_resource_id VARCHAR(128) NOT NULL,
    action VARCHAR(64) NOT NULL,
    actor VARCHAR(128) NOT NULL,
    previous_status VARCHAR(32),
    new_status VARCHAR(32) NOT NULL,
    dry_run BOOLEAN NOT NULL DEFAULT TRUE,
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
