import { config } from "dotenv-mono";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  accountTableRelations,
  activityTableRelations,
  apikeyTableRelations,
  assetTableRelations,
  authorizationAuditEventTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  incidentAffectedServiceTableRelations,
  incidentEventTableRelations,
  incidentResponderTableRelations,
  incidentSignalTableRelations,
  incidentTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  outboxEventTableRelations,
  projectTableRelations,
  savedViewTableRelations,
  serviceTableRelations,
  sessionTableRelations,
  signalIngestionAttemptTableRelations,
  signalSourceTableRelations,
  signalTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  userTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
} from "./relations";
import { resolveDatabaseConnectionString } from "./resolve-database-url";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  authorizationAuditEventTable,
  billingEventTable,
  billingReminderSentTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  externalLinkTable,
  githubIntegrationTable,
  incidentAffectedServiceTable,
  incidentEventTable,
  incidentResponderTable,
  incidentSignalTable,
  incidentTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  outboxEventTable,
  projectTable,
  savedViewTable,
  serviceTable,
  sessionTable,
  signalIngestionAttemptTable,
  signalSourceTable,
  signalTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
  workspaceBillingTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

config();

export const schema = {
  accountTable,
  assetTable,
  activityTable,
  authorizationAuditEventTable,
  apikeyTable,
  billingReminderSentTable,
  billingEventTable,
  workspaceBillingTable,
  columnTable,
  commentTable,
  deviceCodeTable,
  externalLinkTable,
  githubIntegrationTable,
  integrationTable,
  invitationTable,
  jobLeaseTable,
  labelTable,
  mcpOauthStateTable,
  notificationTable,
  outboxEventTable,
  projectTable,
  savedViewTable,
  signalIngestionAttemptTable,
  signalSourceTable,
  signalTable,
  incidentAffectedServiceTable,
  incidentEventTable,
  incidentResponderTable,
  incidentSignalTable,
  incidentTable,
  serviceTable,
  sessionTable,
  taskRelationTable,
  taskReminderSentTable,
  taskTable,
  teamMemberTable,
  teamTable,
  timeEntryTable,
  trialGrantTable,
  userTable,
  userAvatarTable,
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  verificationTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
  accountTableRelations,
  assetTableRelations,
  activityTableRelations,
  authorizationAuditEventTableRelations,
  apikeyTableRelations,
  columnTableRelations,
  commentTableRelations,
  externalLinkTableRelations,
  githubIntegrationTableRelations,
  integrationTableRelations,
  invitationTableRelations,
  labelTableRelations,
  notificationTableRelations,
  outboxEventTableRelations,
  projectTableRelations,
  savedViewTableRelations,
  signalIngestionAttemptTableRelations,
  signalSourceTableRelations,
  signalTableRelations,
  incidentAffectedServiceTableRelations,
  incidentEventTableRelations,
  incidentResponderTableRelations,
  incidentSignalTableRelations,
  incidentTableRelations,
  serviceTableRelations,
  sessionTableRelations,
  taskRelationTableRelations,
  taskReminderSentTableRelations,
  taskTableRelations,
  teamMemberTableRelations,
  teamTableRelations,
  timeEntryTableRelations,
  userTableRelations,
  userNotificationPreferenceTableRelations,
  userNotificationWorkspaceProjectTableRelations,
  userNotificationWorkspaceRuleTableRelations,
  verificationTableRelations,
  workflowRuleTableRelations,
  workspaceRoleTableRelations,
  workspaceTableRelations,
  workspaceUserTableRelations,
};

type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

let pool: Pool | undefined;
let dbInstance: DatabaseInstance | undefined;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: resolveDatabaseConnectionString(),
      // Fail fast when Railway's internal network is slow rather than hanging
      // indefinitely and blocking every API request.
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
  }

  return pool;
}

export function getDatabase(): DatabaseInstance {
  if (!dbInstance) {
    dbInstance = drizzle(getDatabasePool(), {
      schema,
    });
  }

  return dbInstance;
}

const db = new Proxy({} as DatabaseInstance, {
  get(_target, property, receiver) {
    const value = Reflect.get(getDatabase(), property, receiver);

    if (typeof value === "function") {
      return value.bind(getDatabase());
    }

    return value;
  },
});

export default db;
