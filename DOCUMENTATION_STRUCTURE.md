# API Documentation Structure

This document provides an overview of the API documentation created for the SQLite MCP GUI project.

## Documentation Files

### 1. OpenAPI Specification (`openapi.yaml`)
- **Format:** OpenAPI 3.0.3
- **Purpose:** Machine-readable API specification
- **Contents:**
  - All REST API endpoints documented
  - Request/response schemas
  - Error responses
  - Examples for each endpoint
  - Security schemes (Bearer Auth)
  - Rate limiting information

### 2. MCP Tools Documentation (`MCP_TOOLS.md`)
- **Format:** Markdown
- **Purpose:** Human-readable MCP protocol tools documentation
- **Contents:**
  - All 5 MCP tools documented
  - Parameters and return values
  - Error handling
  - Best practices
  - Usage examples

### 3. API Reference (`docs/api-reference.md`)
- **Format:** Markdown
- **Purpose:** Complete REST API reference
- **Contents:**
  - All API endpoints
  - Code examples in JavaScript/TypeScript
  - cURL examples
  - Response format documentation
  - Error handling examples

### 4. Postman Collection (`postman-collection.json`)
- **Format:** Postman Collection v2.1.0
- **Purpose:** Importable API testing collection
- **Contents:**
  - All endpoints with examples
  - Environment variables
  - Example responses
  - Example workflows

### 5. Inline JSDoc Comments
- **Location:** Source code files
- **Files Updated:**
  - `src/ui/server.ts` - REST API endpoints
  - `src/server/index.ts` - MCP tool handlers
- **Contents:**
  - Function documentation
  - Parameter descriptions
  - Return value documentation
  - Usage examples

## API Endpoints Documented

### REST API Endpoints
1. `POST /api/query` - Execute SQL queries
2. `POST /api/tables` - List all tables
3. `POST /api/schema` - Get table schema
4. `GET /health` - Health check
5. `GET /metrics` - API metrics

### MCP Protocol Tools
1. `sqlite_connect` - Connect to database
2. `sqlite_query` - Execute SELECT/PRAGMA queries
3. `sqlite_execute` - Execute INSERT/UPDATE/DELETE/CREATE/etc
4. `sqlite_tables` - List all tables
5. `sqlite_schema` - Get table schema

## Documentation Features

### Authentication
- Bearer token authentication documented
- JWT token format specified
- Marked as optional (not currently implemented)

### Rate Limiting
- 100 requests/minute for database operations
- No limit for health/metrics endpoints
- Headers documented (X-RateLimit-*, Retry-After)

### Error Handling
- All error responses documented
- Error codes included
- Troubleshooting guides provided
- Common errors with solutions

### Examples
- JavaScript/TypeScript code examples
- cURL command examples
- Postman request examples
- Example workflows

## Usage

### Viewing OpenAPI Spec
```bash
# View with Swagger UI
docker run -p 8080:8080 -e SWAGGER_JSON=/openapi.yaml \
  -v $(pwd):/usr/share/nginx \
  swaggerapi/swagger-ui

# Or use online editors
# https://editor.swagger.io/
# https://redocly.github.io/redoc/
```

### Importing Postman Collection
1. Open Postman
2. Click Import
3. Select `postman-collection.json`
4. Start testing endpoints

### Generating Client SDKs
```bash
# Using openapi-generator
openapi-generator-cli generate -i openapi.yaml \
  -g javascript -o ./generated-client

# Using swagger-codegen
swagger-codegen generate -i openapi.yaml \
  -l javascript -o ./generated-client
```

## Best Practices Documented

1. Always connect to database before operations
2. Use appropriate tools for different operations
3. Explore schema before querying
4. Use LIMIT for large tables
5. Handle errors properly
6. Implement rate limiting in clients

## Troubleshooting Guide

Common issues and solutions:
- Not connected to database
- Invalid SQL syntax
- Table not found
- Wrong query type
- Database locked

## Security Considerations

- SQL injection prevention
- File system access notes
- Database modification warnings
- Resource limits

## Future Enhancements

Potential additions:
- Authentication implementation
- Additional MCP tools (8 more mentioned in requirements)
- WebSocket support for real-time updates
- Query builder API
- Transaction management endpoints

## Related Documentation

- Main README: `README.md`
- Environment variables: `.env.example`
- This file: `DOCUMENTATION_STRUCTURE.md`
