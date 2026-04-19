# Security Guide

This document outlines the security posture of `mcp-server-starter-ts`.

## Authentication

### API Key Authentication

The default authentication method uses an API key:

```bash
# Set the API key
export API_KEY=your-secret-key

# Include in requests
curl -H "x-api-key: your-secret-key" http://localhost:8080/mcp
```

### Bearer Token Authentication

For user-authenticated flows:

```bash
export AUTH_MODE=bearer
export API_KEY=your-jwt-secret

# Include in requests
curl -H "Authorization: Bearer eyJhbGc..." http://localhost:8080/mcp
```

### Development Mode

In development (`NODE_ENV=development`), authentication is bypassed if no `API_KEY` is set. **Never use this in production.**

## Input Validation

### Zod Schema Validation

All tool inputs are validated against Zod schemas before processing:

```typescript
inputSchema: z.object({
  userId: z.string().uuid('Must be a valid UUID'),
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0).max(120),
})
```

Invalid inputs are rejected with a 400 error before reaching tool handlers.

### Size Limits

Request bodies are limited to prevent denial-of-service attacks:

- Default limit: 10MB
- Configurable via Express body-parser settings

### Prompt-Injection Defense

The sanitization middleware strips known injection patterns from string inputs:

```typescript
// Patterns stripped:
// - <script> tags
// - javascript: URLs
// - on* event handlers
// - <iframe> tags
// - And more...
```

**Limitation**: This is a best-effort defense. Tools handling sensitive operations should implement additional validation.

## Rate Limiting

### Token Bucket Algorithm

Rate limiting uses a token bucket algorithm per client:

- **Key**: API key (if authenticated) or IP address
- **Default**: 60 requests per minute
- **Configurable**: `RATE_LIMIT_RPM` environment variable

### Response on Limit

When rate limited, clients receive:

```json
{
  "error": "Too Many Requests",
  "retryAfter": 45
}
```

With headers:
- `X-RateLimit-Limit: 60`
- `X-RateLimit-Remaining: 0`
- `Retry-After: 45`

## Idempotency

### Request Deduplication

The idempotency middleware prevents duplicate processing:

1. Client sends `Idempotency-Key` header
2. Server caches the response for `IDEMPOTENCY_TTL_MS` (default: 5 minutes)
3. Duplicate requests return the cached response

### Security Considerations

- Idempotency keys are scoped per client (API key or IP)
- Keys are hashed before storage
- Cache is in-memory (swap to Redis for multi-instance deployments)

## Data Protection

### PII Redaction

The logger automatically redacts common PII patterns:

- Email addresses
- Phone numbers
- Social Security numbers
- Credit card numbers
- IP addresses (in some contexts)

### No Sensitive Data in Errors

Error responses never include:
- Stack traces
- Internal error messages
- Database details
- Configuration values

### Secure Defaults

- CORS is restricted by default
- Security headers are set via middleware
- HTTPS is recommended in production

## Secret Management

### Environment Variables

Secrets should be provided via environment variables, not committed to code:

```bash
# ✅ Good
export API_KEY=$(gcloud secrets versions access latest --secret=api-key)

# ❌ Bad
# Hardcoded in .env file committed to git
```

### GCP Secret Manager

```bash
# Create secret
gcloud secrets create mcp-api-key --replication-policy="automatic"
echo -n "your-api-key" | gcloud secrets stdin mcp-api-key

# Use in Cloud Run
gcloud run deploy mcp-server \
  --set-secrets API_KEY=mcp-api-key:latest
```

### AWS Secrets Manager

```bash
# Create secret
aws secretsmanager create-secret --name mcp/api-key --secret-string "your-api-key"

# Use in Lambda
# Reference via environment variable in Terraform
```

## Audit Logging

### What's Logged

Every request logs:
- Timestamp
- Request ID
- Client IP (hashed)
- Tool name (if applicable)
- Response status
- Duration

### What's NOT Logged

- Raw request bodies (may contain sensitive data)
- API keys or tokens
- Full input parameters
- Response content

### Log Access

Restrict log access to authorized personnel only. In cloud environments:
- GCP: Use Cloud Logging IAM roles
- AWS: Use CloudWatch Logs resource policies

## Security Checklist

Before deploying to production:

- [ ] `API_KEY` is set and kept secret
- [ ] `NODE_ENV` is set to `production`
- [ ] HTTPS is enforced (via load balancer or reverse proxy)
- [ ] Rate limiting is configured for expected traffic
- [ ] PII is not logged (verified via log sampling)
- [ ] Secrets are managed via Secret Manager/Secrets Manager
- [ ] CORS is configured appropriately
- [ ] Idempotency is implemented for mutation tools
- [ ] All tools have Zod-validated input schemas
- [ ] Error responses don't leak internal details

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. Do not open a public issue
2. Email security@example.com (configure for your deployment)
3. Include details to reproduce the issue
4. Allow time for a fix before public disclosure

## Compliance Notes

This template provides security features but compliance (SOC 2, HIPAA, GDPR, etc.) depends on your specific deployment and usage. Consult with your security team for compliance requirements.
