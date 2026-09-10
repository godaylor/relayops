# RelayOps Helm Chart

This chart deploys RelayOps, a self-hosted realtime incident-operations product derived from [Kaneo](https://github.com/usekaneo/kaneo). It is not an official or endorsed Kaneo product. Preserve the bundled [upstream MIT license](LICENSE), [RelayOps MIT license](LICENSE-RELAYOPS), [attribution notice](NOTICE), Andrej Acevski's copyright and [third-party notices](THIRD_PARTY_NOTICES).

## Installation prerequisites and status

Helm 3.2.0+, Kubernetes 1.23+ and a provisioner for persistent volumes are required. Local lint/template/package checks do not prove Kubernetes runtime support; cluster smoke, PVC/upgrade and restore checks remain open before publication.

There is no published RelayOps chart or approved image namespace yet. The default `kaneo.image.repository: relayops` is a placeholder, not a verified registry destination. **Every installation must override it with your own verified RelayOps combined image repository and immutable release tag**, whose image digest, SBOM, license inventory and security reports have been checked. Do not install upstream Kaneo images or charts as RelayOps.

## Install from the reviewed local chart

Prepare a private `deployment-values.yaml` using the examples below. Explicitly configure `kaneo.env.clientUrl`, an auth secret (at least 32 characters or an existing Secret), and PostgreSQL credentials (or an external database). Overlay examples below supplement these required values; they are not standalone installations.

Set `RELAYOPS_IMAGE_REPOSITORY` and `RELAYOPS_IMAGE_TAG` to your own verified values, then:

```bash
helm install relayops ./charts/kaneo \
  --namespace relayops --create-namespace \
  -f deployment-values.yaml \
  --set-string kaneo.image.repository="${RELAYOPS_IMAGE_REPOSITORY:?Set your own verified image repository}" \
  --set-string kaneo.image.tag="${RELAYOPS_IMAGE_TAG:?Set your verified immutable release tag}"
# Access locally; clientUrl must match this origin for login.
kubectl port-forward svc/relayops 32002:5173 -n relayops
```

For the port-forward example use `http://127.0.0.1:32002` as clientUrl. For a target deployment supply your exact HTTPS URL and configure Ingress or Gateway API through the values below.

To review a chart archive locally:

```bash
helm package ./charts/kaneo --destination artifacts
```

Install the reviewed local archive using the same required overrides. Own registry publication and target deployment require separate approval.

## Compatibility and existing installations

The path `charts/kaneo`, values under `kaneo.*`, template helpers, service selectors, database defaults and `KANEO_*` environment variables are compatibility identifiers. They are not upstream deployment destinations. Keep the existing release name, namespace, `nameOverride`/`fullnameOverride` and resource/PVC bindings when upgrading an existing installation: the chart name is now `relayops`, so default generated names can differ from the Kaneo chart. Compare rendered names against the existing resources before any upgrade. Do not delete production PVCs or automatically convert legacy project/task data.

## Uninstalling the Chart

```bash
helm uninstall relayops --namespace relayops
```

Review the target release and persistence policy before uninstalling; preserve data and backups.

## Parameters
### Global parameters
| Name                     | Description                                                                                                        | Value       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| `nameOverride`           | String to partially override the fullname template (will maintain the release name)                                | `""`        |
| `fullnameOverride`       | String to fully override the fullname template                                                                     | `""`        |
| `replicaCount`           | Number of replicas (ignored if autoscaling is enabled)                                                             | `1`         |
### Autoscaling parameters
| Name                                | Description                                                                                                        | Value       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| `autoscaling.enabled`               | Enable autoscaling for the deployment                                                                              | `false`     |
| `autoscaling.minReplicas`           | Minimum number of replicas                                                                                         | `1`         |
| `autoscaling.maxReplicas`           | Maximum number of replicas                                                                                         | `10`        |
| `autoscaling.targetCPUUtilizationPercentage` | Target CPU utilization percentage                                                                         | `80`        |
When CPU autoscaling is enabled, set `kaneo.resources.requests.cpu`; Kubernetes cannot calculate CPU utilization without a CPU request.
### PostgreSQL Database parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `postgresql.enabled`                | Deploy PostgreSQL as part of this chart                                                                           | `true`                          |
| `postgresql.image.repository`       | PostgreSQL image repository                                                                                        | `postgres`                      |
| `postgresql.image.tag`              | PostgreSQL image tag                                                                                               | `16-alpine`                     |
| `postgresql.image.pullPolicy`       | PostgreSQL image pull policy                                                                                      | `IfNotPresent`                  |
| `postgresql.auth.database`          | PostgreSQL database name                                                                                           | `kaneo`                         |
| `postgresql.auth.username`          | PostgreSQL username                                                                                                | `kaneo_user`                    |
| `postgresql.auth.password`          | PostgreSQL password                                                                                                | `""` (must be supplied)                |
| `postgresql.auth.existingSecret`    | Name of existing secret containing PostgreSQL credentials                                                          | `""`                            |
| `postgresql.persistence.enabled`    | Enable persistence for PostgreSQL data                                                                             | `true`                          |
| `postgresql.persistence.size`       | PostgreSQL PVC size                                                                                                | `8Gi`                           |
| `postgresql.persistence.storageClass` | PostgreSQL PVC storage class                                                                                     | `""`                            |
| `postgresql.persistence.accessMode` | PostgreSQL PVC access mode                                                                                         | `ReadWriteOnce`                 |
| `postgresql.service.type`           | PostgreSQL service type                                                                                            | `ClusterIP`                     |
| `postgresql.service.port`           | PostgreSQL service port                                                                                            | `5432`                          |
| `postgresql.resources`              | Resource requests and limits for PostgreSQL container                                                              | `{}`                            |
### RelayOps application parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `kaneo.image.repository`            | RelayOps image repository                                                                                             | `relayops` (placeholder; override required)        |
| `kaneo.image.tag`                   | RelayOps image tag. Defaults to `Chart.appVersion` when empty                                                         | `""`                            |
| `kaneo.image.pullPolicy`            | RelayOps image pull policy                                                                                            | `IfNotPresent`                  |
| `kaneo.service.type`                | Kaneo service type                                                                                                 | `ClusterIP`                     |
| `kaneo.service.port`                | Kaneo service port                                                                                                 | `5173`                          |
| `kaneo.service.targetPort`          | RelayOps container port                                                                                               | `5173`                          |
| `kaneo.env`                         | Environment variables for the RelayOps container                                                                      | See `values.yaml`               |
| `kaneo.env.clientUrl`               | Public URL of the Kaneo instance. **Required for any non-localhost deployment**; sets `KANEO_CLIENT_URL`. Omitting this causes "invalid origin" errors on login. Note: this key is case-sensitive (`clientUrl`, not `clientURL`). | `""` |
| `kaneo.env.corsOrigins`             | Allowed CORS origins as a comma-separated string or YAML list                                                      | `[]`                            |
| `kaneo.env.authSecret`              | Required Better Auth secret (minimum 32 characters), ignored if existingSecret is enabled                           | `""` |
| `kaneo.env.existingSecret.enabled`  | Whether to use an existing secret for `AUTH_SECRET`                                                                | `false`                         |
| `kaneo.env.existingSecret.name`     | Name of the existing secret containing `AUTH_SECRET`                                                               | `""`                            |
| `kaneo.env.existingSecret.key`      | Key in the existing secret that contains `AUTH_SECRET`                                                             | `auth-secret`                   |
| `kaneo.env.disableRegistration`     | Disable new user registration                                                                                      | `false`                         |
| `kaneo.env.disablePasswordRegistration` | Disable password-based account creation while keeping social/OIDC registration available                        | `false`                         |
| `kaneo.env.disableEmailOtpSignIn`   | Use email/password sign-in instead of verification codes when SMTP is configured                                   | `false`                         |
| `kaneo.env.database.external.enabled` | Use external PostgreSQL database (set postgresql.enabled to false)                                               | `false`                         |
| `kaneo.env.database.external.host`  | External PostgreSQL host                                                                                           | `""`                            |
| `kaneo.env.database.external.port`  | External PostgreSQL port                                                                                           | `5432`                          |
| `kaneo.env.database.external.database` | External PostgreSQL database name                                                                               | `kaneo`                         |
| `kaneo.env.database.external.username` | External PostgreSQL username                                                                                    | `kaneo_user`                    |
| `kaneo.env.database.external.password` | External PostgreSQL password                                                                                    | `""`                            |
| `kaneo.env.database.external.existingSecret.enabled` | Use an existing secret for the external database connection URI                             | `false`                         |
| `kaneo.env.database.external.existingSecret.name` | Name of the secret containing the database connection URI                                    | `""`                            |
| `kaneo.env.database.external.existingSecret.passwordKey` | Key in the secret whose value is a full PostgreSQL connection URI                       | `postgres_uri`                  |
| `kaneo.extraEnv`                    | Additional Kubernetes EnvVar entries appended to the RelayOps container                                               | `[]`                            |
| `kaneo.resources`                   | Resource requests and limits for the RelayOps container (optional, disabled by default)                               | `{}`                            |
| `podSecurityContext`                | Security context applied at the Pod level                                                                          | `{}`                            |
| `securityContext`                   | Security context applied at the container level                                                                    | `{}`                            |
### Ingress parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `ingress.enabled`                   | Enable ingress                                                                                                     | `false`                         |
| `ingress.className`                 | Ingress class name                                                                                                 | `""`                            |
| `ingress.annotations`               | Ingress annotations                                                                                                | `{}`                            |
| `ingress.hosts`                     | Ingress hosts configuration                                                                                        | See `values.yaml`               |
| `ingress.tls`                       | Ingress TLS configuration                                                                                          | `[]`                            |
### Gateway API parameters
| Name                                | Description                                                                                                        | Value                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `gateway.enabled`                   | Enable Gateway API `HTTPRoute` creation                                                                            | `false`                         |
| `gateway.annotations`               | Annotations added to the `HTTPRoute`                                                                               | `{}`                            |
| `gateway.labels`                    | Extra labels added to the `HTTPRoute`                                                                              | `{}`                            |
| `gateway.parentRefs`                | Parent Gateway listener references for attaching the `HTTPRoute`                                                   | `[]`                            |
| `gateway.hostnames`                 | Hostnames exposed by the `HTTPRoute`                                                                               | `[]`                            |
| `gateway.rules`                     | Gateway API routing rules mapping paths to the chart services                                                      | See `values.yaml`               |
## Configuration Examples
### Minimal Configuration
```yaml
# values.yaml
kaneo:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://your-domain.com"
ingress:
  enabled: true
  className: nginx
  annotations: {}
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: kaneo
          port: 5173
```
### Production Configuration with TLS
```yaml
# values.yaml
replicaCount: 1
# PostgreSQL configuration
postgresql:
  auth:
    password: "your-secure-db-password"
  persistence:
    size: 20Gi
    storageClass: "managed-premium"
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
# RelayOps configuration
kaneo:
  resources:
    limits:
      cpu: 1000m
      memory: 1Gi
    requests:
      cpu: 200m
      memory: 256Mi
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://your-domain.com"
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: kaneo
          port: 5173
  tls:
    - secretName: kaneo-tls
      hosts:
        - your-domain.com
```
### Production Configuration with Traefik
If you're running Traefik as your ingress controller (common in self-hosted clusters), configure the ingress directly rather than through the chart's built-in ingress support:
```yaml
# values.yaml
kaneo:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    clientUrl: "https://kaneo.your-domain.com"
```
```yaml
# ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: kaneo-ingress
  namespace: kaneo
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: traefik
  rules:
    - host: kaneo.your-domain.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kaneo-kaneo
                port:
                  number: 5173
  tls:
    - hosts:
        - kaneo.your-domain.com
      secretName: kaneo-tls
```
### Using External PostgreSQL Database
If you prefer to use an external PostgreSQL database instead of the bundled one:
```yaml
# values.yaml
# Disable bundled PostgreSQL
postgresql:
  enabled: false
kaneo:
  env:
    authSecret: "your-secure-auth-secret-at-least-32-characters"
    database:
      external:
        enabled: true
        host: "your-postgres-host.com"
        port: 5432
        database: "kaneo"
        username: "kaneo_user"
        password: "your-db-password"
```
### Using an Existing Secret for Sensitive Data
For production environments, it's recommended to store sensitive data like the auth secret and database credentials in Kubernetes Secrets:
When `postgresql.auth.existingSecret` is used with bundled PostgreSQL, the password is expanded by Kubernetes into `DATABASE_URL` at runtime and must be URL-safe. If your password contains reserved URI characters such as `@`, `:`, `/`, `#`, `%`, or spaces, use an external database and provide the complete connection URI through `kaneo.env.database.external.existingSecret`.
```bash
# Create a Secret for sensitive data
kubectl create secret generic kaneo-secrets \
  --namespace kaneo \
  --from-literal=auth-secret="your-secure-auth-secret-at-least-32-characters" \
  --from-literal=postgres-password="your-secure-db-password"
```
Then reference these secrets in your values:
```yaml
# values.yaml
postgresql:
  auth:
    existingSecret: "kaneo-secrets"
    secretKeys:
      userPasswordKey: "postgres-password"
kaneo:
  env:
    existingSecret:
      enabled: true
      name: "kaneo-secrets"
      key: "auth-secret"
```
#### Using an Existing Secret with External PostgreSQL
When using an external database, the secret must contain a full PostgreSQL connection URI rather than just the password. Any special characters in the password (such as `@`, `:`, `/`) must be [percent-encoded](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding).
```bash
# Create the secret with a full connection URI
kubectl create secret generic kaneo-secrets \
  --namespace kaneo \
  --from-literal=auth-secret="your-secure-auth-secret-at-least-32-characters" \
  --from-literal=postgres_uri="postgresql://kaneo_user:your-password@your-host:5432/kaneo"
```
```yaml
# values.yaml
postgresql:
  enabled: false

kaneo:
  env:
    clientUrl: "https://kaneo.your-domain.com"
    existingSecret:
      enabled: true
      name: "kaneo-secrets"
      key: "auth-secret"
    database:
      external:
        enabled: true
        host: "your-postgres-host.com"
        port: 5432
        database: "kaneo"
        username: "kaneo_user"
        password: ""
        existingSecret:
          enabled: true
          name: "kaneo-secrets"
          passwordKey: postgres_uri
```
## Database Management
### PostgreSQL Configuration
The chart deploys PostgreSQL 16 (Alpine) by default with the following configuration:
- Database name: `kaneo`
- Username: `kaneo_user`
- No default password: supply one explicitly or reference an existing Secret.
- Persistent storage: 8Gi (configurable)
The bundled PostgreSQL deployment is intended for development, trials, and small self-hosted installs. For production environments, use an external managed PostgreSQL database by setting `postgresql.enabled=false` and configuring `kaneo.env.database.external`.
Bundled PostgreSQL credentials are only applied when PostgreSQL initializes an empty data directory. If a PVC already exists, changing `postgresql.auth.password` or `postgresql.auth.existingSecret` updates the Pod environment but does not rotate the password inside the existing database. For local retesting with a new password, uninstall the release and delete the test PVC before reinstalling:
```bash
helm uninstall kaneo -n kaneo-test
kubectl delete pvc kaneo-postgresql-data -n kaneo-test --ignore-not-found
```
To preserve data, rotate the password inside PostgreSQL first, then update the Helm values to match.
### Backup and Recovery
For production deployments, consider implementing regular database backups:
```bash
# Example backup command
kubectl exec -it deployment/my-kaneo-postgresql -- pg_dump -U kaneo_user kaneo > kaneo-backup.sql
```
### Migration from SQLite
If you're migrating from a previous SQLite-based installation, you'll need to:
1. Export your data from SQLite
2. Deploy the new PostgreSQL-based chart
3. Import your data into PostgreSQL
This legacy migration outline is not a verified RelayOps migration recipe. Validate a backed-up test copy before selecting any migration path.
## Troubleshooting
### "invalid origin" error on login
RelayOps API validates the `Origin` header on every request against `KANEO_CLIENT_URL`. If `clientUrl` is not set (or is set incorrectly), every login attempt fails with this error.

Set `clientUrl` to the URL users access RelayOps from:
```yaml
kaneo:
  env:
    clientUrl: "https://kaneo.your-domain.com"
```

> **Note:** The key is `clientUrl` (camelCase). `clientURL` (all-caps) is silently ignored; the env var will be empty and login will fail with no helpful error.

### Pods crash immediately after upgrading to use `existingSecret`
If pods enter `CrashLoopBackOff` after switching to an existing secret for the external database, the connection URI in the secret is likely wrong. Check what the pod is actually using:
```bash
kubectl get secret kaneo-secrets -n kaneo \
  -o jsonpath='{.data.postgres_uri}' | base64 -d
```
Common causes:
- Wrong password
- Password contains special characters that need percent-encoding (e.g. `p@ss` → `p%40ss`)
- Incorrect host, port, or database name in the URI

### PodSecurity warnings on install/upgrade
On clusters with Pod Security Admission enabled, you may see warnings like `would violate PodSecurity "restricted:latest"`. The chart exposes `podSecurityContext` and `securityContext` to address these. See the [Security](#security) section for recommended values.
## Architecture
This chart deploys the following components:
1. **RelayOps application**: Serves the web UI and API from the combined RelayOps image
2. **PostgreSQL Database**: Stores all application data with proper relational integrity
The RelayOps application and PostgreSQL run in separate pods for resource isolation and simpler database lifecycle management.
## Production Environment
For production deployments, you should:
1. Set secure values for `AUTH_SECRET` and PostgreSQL passwords
2. Use an Ingress controller to expose the application
3. Configure TLS for secure access
4. Set appropriate resource limits and requests
5. Enable persistent storage with appropriate storage classes
6. Consider using external PostgreSQL for better scalability
```yaml
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
  hosts:
    - host: your-domain.com
      paths:
        - path: /
          pathType: Prefix
          service: kaneo
          port: 5173
  tls:
    - secretName: kaneo-tls
      hosts:
        - your-domain.com
```
## Using Gateway API
As an alternative to Ingress, the chart can create an `HTTPRoute` for the Kubernetes Gateway API:
```yaml
# values.yaml
gateway:
  enabled: true
  parentRefs:
    - name: main-gateway
      namespace: gateway-system
      sectionName: https
  hostnames:
    - kaneo.example.com
```
By default the chart creates one Gateway API rule:
1. `/` goes to the RelayOps service
If you need custom matching or multiple backend references, override `gateway.rules` directly. Each `backendRefs` entry follows the same pattern as ingress and uses the chart-specific `service` field (`kaneo`), which is expanded to the release-specific Service name.
## Security
For production deployments, consider the following security recommendations:
1. Use secure `AUTH_SECRET` and PostgreSQL passwords, preferably stored in Kubernetes Secrets
2. Enable TLS for ingress or Gateway API
3. Enable and set resource limits to prevent resource exhaustion
4. Use a dedicated storage class for the PostgreSQL database
5. Consider using a network policy to restrict traffic between components
6. Regularly update PostgreSQL and application images
### Pod Security Context
On clusters with Pod Security Admission enforcement, set the following to satisfy the `restricted` policy:
```yaml
kaneo:
    podSecurityContext:
        runAsNonRoot: true
        seccompProfile:
            type: RuntimeDefault

    securityContext:
        allowPrivilegeEscalation: false
        capabilities:
            drop: ["ALL"]
```
### Registration Control
By default, user registration is enabled. To disable new user registration:
```yaml
kaneo:
  env:
    disableRegistration: true
```
This will prevent new users from registering while still allowing existing users to log in. The registration option will be hidden from the login page.
