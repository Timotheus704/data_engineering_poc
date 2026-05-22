/**
 * OpenTelemetry Tracing Configuration
 * ====================================
 * This file initializes distributed tracing for the API.
 *
 * In development: traces are exported to the console (human-readable)
 * In production:  traces would be exported to a collector (Jaeger, Datadog, etc.)
 *                 via OTLP HTTP exporter to OTEL_EXPORTER_OTLP_ENDPOINT
 *
 * The auto-instrumentations-node package automatically instruments:
 * - HTTP/HTTPS requests (incoming and outgoing)
 * - pg (PostgreSQL queries)
 * - dns, net, fs (as applicable)
 *
 * This means every database query automatically appears as a span
 * in the trace, with the SQL statement and duration captured.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION, ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';

const isProduction = process.env.NODE_ENV === 'production';
const hasCollector = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

// Use require to bypass TypeScript's persistent 'Type vs Value' ambiguity for Resource.
// This is a known issue in OpenTelemetry where the Resource interface shadows the class.
const { Resource } = require('@opentelemetry/resources');

// Choose exporter based on environment
const traceExporter = (isProduction && hasCollector)
  ? new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    })
  : new ConsoleSpanExporter();  // Development: print to console

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'poc-data-api',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]:
      process.env.NODE_ENV ?? 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Instrument pg queries — captures SQL, table name, duration
      '@opentelemetry/instrumentation-pg': { enhancedDatabaseReporting: true },
      // Instrument HTTP — captures all incoming requests automatically
      '@opentelemetry/instrumentation-http': { enabled: true },
      // Disable noisy file system instrumentation
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

// Initialize before importing any other modules
export function initTracing(): void {
  sdk.start();
  console.log(`[tracing] OpenTelemetry initialized (exporter: ${
    isProduction && hasCollector ? 'OTLP' : 'console'
  })`);

  // Gracefully shut down on process exit
  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('[tracing] Tracing terminated'))
      .catch(console.error)
      .finally(() => process.exit(0));
  });
}