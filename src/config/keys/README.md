# JWT Key Management

This directory contains the RSA key pair used for signing and verifying JWTs.

## Files

- `jwt-private.pem` - Private key for signing JWTs (NEVER commit to version control)
- `jwt-public.pem` - Public key for verifying JWTs (safe to commit and distribute)

## Key Generation

To generate a new key pair:

```bash
# Generate private key (2048-bit RSA)
openssl genrsa -out jwt-private.pem 2048

# Extract public key
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

## Security Best Practices

### Private Key Storage

**Development:**
- Store private key locally in this directory
- Ensure `jwt-private.pem` is in `.gitignore`
- Never commit private keys to version control

**Production:**
- Use Google Cloud Secret Manager or similar service
- Set environment variable `JWT_PRIVATE_KEY_PATH` to the mounted secret path
- Alternatively, set `JWT_PRIVATE_KEY` directly with the PEM content (less recommended)
- Ensure proper IAM permissions restrict access to the secret

### Key Rotation

When rotating keys:

1. Generate new key pair with different name (e.g., `jwt-private-v2.pem`)
2. Deploy application with both old and new keys
3. Update signing to use new key
4. Keep old public key in JWKS endpoint until all old tokens expire (30 days)
5. After 30 days, remove old keys

Example rotation process:

```bash
# Step 1: Generate new key pair
openssl genrsa -out jwt-private-v2.pem 2048
openssl rsa -in jwt-private-v2.pem -pubout -out jwt-public-v2.pem

# Step 2: Update JWT_PRIVATE_KEY_PATH to point to jwt-private-v2.pem
# Step 3: Expose both public keys in JWKS endpoint for 30 days
# Step 4: After 30 days, remove old keys
```

## Environment Variables

Configure key paths via environment variables:

```bash
# Path to private key file (required for signing)
JWT_PRIVATE_KEY_PATH=/path/to/jwt-private.pem

# Path to public key file (required for verification)
JWT_PUBLIC_KEY_PATH=/path/to/jwt-public.pem

# Alternative: Direct key content (not recommended, use for Secret Manager integration)
# JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
# JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
```

## Verification for External Services

External services can verify JWTs using the public key exposed at:

- JWKS endpoint: `GET /.well-known/jwks.json`
- Direct public key: The `jwt-public.pem` file

See `docs/jwt.md` for detailed verification instructions.

## Key Requirements

- **Algorithm**: RS256 (RSA with SHA-256)
- **Key Size**: 2048 bits minimum (4096 bits recommended for high-security environments)
- **Format**: PEM encoded
- **Rotation**: Every 90 days recommended, or immediately if compromised

## Troubleshooting

### Permission Denied Errors

Ensure the private key has restricted permissions:

```bash
chmod 600 jwt-private.pem
```

### Invalid Key Format

Verify the key format:

```bash
# Check private key
openssl rsa -in jwt-private.pem -check

# Check public key
openssl rsa -pubin -in jwt-public.pem -text -noout
```

### Key Mismatch

Verify public key matches private key:

```bash
# Compare modulus (should be identical)
openssl rsa -in jwt-private.pem -modulus -noout
openssl rsa -pubin -in jwt-public.pem -modulus -noout
```
