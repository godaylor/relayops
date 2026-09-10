import { relations } from "drizzle-orm";
import {
  accountTable,
  activityTable,
  apikeyTable,
  assetTable,
  authorizationAuditEventTable,
  columnTable,
  commentTable,
  externalLinkTable,
  githubIntegrationTable,
  incidentAffectedServiceTable,
  incidentEventTable,
  incidentResponderTable,
  incidentSignalTable,
  incidentTable,
  integrationTable,
  invitationTable,
  labelTable,
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
  userNotificationPreferenceTable,
  userNotificationWorkspaceProjectTable,
  userNotificationWorkspaceRuleTable,
  userTable,
  verificationTable,
  workflowRuleTable,
  workspaceRoleTable,
  workspaceTable,
  workspaceUserTable,
} from "./schema";

export const userTableRelations = relations(userTable, ({ many, one }) => ({
  sessions: many(sessionTable),
  accounts: many(accountTable),
  teamMembers: many(teamMemberTable),
  workspaceMemberships: many(workspaceUserTable),
  assignedTasks: many(taskTable),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  notifications: many(notificationTable),
  notificationPreference: one(userNotificationPreferenceTable),
  notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
  sentInvitations: many(invitationTable),
  apikeys: many(apikeyTable),
  createdIncidents: many(incidentTable),
  incidentEvents: many(incidentEventTable),
  incidentResponses: many(incidentResponderTable),
  incidentSignalAttachments: many(incidentSignalTable),
  savedViews: many(savedViewTable),
  authorizationAuditEventsAuthored: many(authorizationAuditEventTable, {
    relationName: "authorizationAuditActor",
  }),
  authorizationAuditEventsTargeted: many(authorizationAuditEventTable, {
    relationName: "authorizationAuditTarget",
  }),
}));

export const sessionTableRelations = relations(sessionTable, ({ one }) => ({
  user: one(userTable, {
    fields: [sessionTable.userId],
    references: [userTable.id],
  }),
}));

export const accountTableRelations = relations(accountTable, ({ one }) => ({
  user: one(userTable, {
    fields: [accountTable.userId],
    references: [userTable.id],
  }),
}));

export const verificationTableRelations = relations(
  verificationTable,
  () => ({}),
);

export const workspaceTableRelations = relations(
  workspaceTable,
  ({ many }) => ({
    teams: many(teamTable),
    members: many(workspaceUserTable),
    projects: many(projectTable),
    assets: many(assetTable),
    invitations: many(invitationTable),
    notificationWorkspaceRules: many(userNotificationWorkspaceRuleTable),
    services: many(serviceTable),
    incidents: many(incidentTable),
    incidentEvents: many(incidentEventTable),
    incidentSignals: many(incidentSignalTable),
    outboxEvents: many(outboxEventTable),
    savedViews: many(savedViewTable),
    signals: many(signalTable),
    signalSources: many(signalSourceTable),
    signalIngestionAttempts: many(signalIngestionAttemptTable),
    authorizationAuditEvents: many(authorizationAuditEventTable),
  }),
);

export const authorizationAuditEventTableRelations = relations(
  authorizationAuditEventTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [authorizationAuditEventTable.workspaceId],
      references: [workspaceTable.id],
    }),
    actor: one(userTable, {
      fields: [authorizationAuditEventTable.actorUserId],
      references: [userTable.id],
      relationName: "authorizationAuditActor",
    }),
    target: one(userTable, {
      fields: [authorizationAuditEventTable.targetUserId],
      references: [userTable.id],
      relationName: "authorizationAuditTarget",
    }),
  }),
);

export const serviceTableRelations = relations(
  serviceTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [serviceTable.workspaceId],
      references: [workspaceTable.id],
    }),
    ownerTeam: one(teamTable, {
      fields: [serviceTable.workspaceId, serviceTable.ownerTeamId],
      references: [teamTable.workspaceId, teamTable.id],
    }),
    incidents: many(incidentTable),
    signals: many(signalTable),
    affectedIncidents: many(incidentAffectedServiceTable),
  }),
);

export const incidentTableRelations = relations(
  incidentTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [incidentTable.workspaceId],
      references: [workspaceTable.id],
    }),
    service: one(serviceTable, {
      fields: [incidentTable.workspaceId, incidentTable.serviceId],
      references: [serviceTable.workspaceId, serviceTable.id],
    }),
    creator: one(userTable, {
      fields: [incidentTable.createdBy],
      references: [userTable.id],
    }),
    commander: one(userTable, {
      fields: [incidentTable.commanderId],
      references: [userTable.id],
    }),
    affectedServices: many(incidentAffectedServiceTable),
    responders: many(incidentResponderTable),
    events: many(incidentEventTable),
    signals: many(incidentSignalTable),
  }),
);

export const incidentAffectedServiceTableRelations = relations(
  incidentAffectedServiceTable,
  ({ one }) => ({
    incident: one(incidentTable, {
      fields: [
        incidentAffectedServiceTable.workspaceId,
        incidentAffectedServiceTable.incidentId,
      ],
      references: [incidentTable.workspaceId, incidentTable.id],
    }),
    service: one(serviceTable, {
      fields: [
        incidentAffectedServiceTable.workspaceId,
        incidentAffectedServiceTable.serviceId,
      ],
      references: [serviceTable.workspaceId, serviceTable.id],
    }),
  }),
);

export const incidentResponderTableRelations = relations(
  incidentResponderTable,
  ({ one }) => ({
    incident: one(incidentTable, {
      fields: [
        incidentResponderTable.workspaceId,
        incidentResponderTable.incidentId,
      ],
      references: [incidentTable.workspaceId, incidentTable.id],
    }),
    user: one(userTable, {
      fields: [incidentResponderTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const savedViewTableRelations = relations(savedViewTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [savedViewTable.workspaceId],
    references: [workspaceTable.id],
  }),
  owner: one(userTable, {
    fields: [savedViewTable.ownerUserId],
    references: [userTable.id],
  }),
}));

export const signalSourceTableRelations = relations(
  signalSourceTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [signalSourceTable.workspaceId],
      references: [workspaceTable.id],
    }),
    ingestionAttempts: many(signalIngestionAttemptTable),
  }),
);

export const signalTableRelations = relations(signalTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [signalTable.workspaceId],
    references: [workspaceTable.id],
  }),
  service: one(serviceTable, {
    fields: [signalTable.workspaceId, signalTable.serviceId],
    references: [serviceTable.workspaceId, serviceTable.id],
  }),
  incidents: many(incidentSignalTable),
}));

export const signalIngestionAttemptTableRelations = relations(
  signalIngestionAttemptTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [signalIngestionAttemptTable.workspaceId],
      references: [workspaceTable.id],
    }),
    source: one(signalSourceTable, {
      fields: [
        signalIngestionAttemptTable.workspaceId,
        signalIngestionAttemptTable.sourceId,
      ],
      references: [signalSourceTable.workspaceId, signalSourceTable.id],
    }),
  }),
);

export const incidentSignalTableRelations = relations(
  incidentSignalTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [incidentSignalTable.workspaceId],
      references: [workspaceTable.id],
    }),
    incident: one(incidentTable, {
      fields: [incidentSignalTable.workspaceId, incidentSignalTable.incidentId],
      references: [incidentTable.workspaceId, incidentTable.id],
    }),
    signal: one(signalTable, {
      fields: [incidentSignalTable.workspaceId, incidentSignalTable.signalId],
      references: [signalTable.workspaceId, signalTable.id],
    }),
    attachedBy: one(userTable, {
      fields: [incidentSignalTable.attachedBy],
      references: [userTable.id],
    }),
  }),
);

export const incidentEventTableRelations = relations(
  incidentEventTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [incidentEventTable.workspaceId],
      references: [workspaceTable.id],
    }),
    incident: one(incidentTable, {
      fields: [incidentEventTable.workspaceId, incidentEventTable.incidentId],
      references: [incidentTable.workspaceId, incidentTable.id],
    }),
    actor: one(userTable, {
      fields: [incidentEventTable.actorUserId],
      references: [userTable.id],
    }),
  }),
);

export const outboxEventTableRelations = relations(
  outboxEventTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [outboxEventTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);

export const workspaceUserTableRelations = relations(
  workspaceUserTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceUserTable.workspaceId],
      references: [workspaceTable.id],
    }),
    user: one(userTable, {
      fields: [workspaceUserTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const projectTableRelations = relations(
  projectTable,
  ({ one, many }) => ({
    workspace: one(workspaceTable, {
      fields: [projectTable.workspaceId],
      references: [workspaceTable.id],
    }),
    tasks: many(taskTable),
    assets: many(assetTable),
    columns: many(columnTable),
    workflowRules: many(workflowRuleTable),
    githubIntegration: many(githubIntegrationTable),
    integrations: many(integrationTable),
    notificationWorkspaceProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const columnTableRelations = relations(columnTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [columnTable.projectId],
    references: [projectTable.id],
  }),
  tasks: many(taskTable),
  workflowRules: many(workflowRuleTable),
}));

export const workflowRuleTableRelations = relations(
  workflowRuleTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [workflowRuleTable.projectId],
      references: [projectTable.id],
    }),
    column: one(columnTable, {
      fields: [workflowRuleTable.columnId],
      references: [columnTable.id],
    }),
  }),
);

export const taskTableRelations = relations(taskTable, ({ one, many }) => ({
  project: one(projectTable, {
    fields: [taskTable.projectId],
    references: [projectTable.id],
  }),
  assignee: one(userTable, {
    fields: [taskTable.userId],
    references: [userTable.id],
  }),
  column: one(columnTable, {
    fields: [taskTable.columnId],
    references: [columnTable.id],
  }),
  timeEntries: many(timeEntryTable),
  activities: many(activityTable),
  comments: many(commentTable),
  assets: many(assetTable),
  labels: many(labelTable),
  externalLinks: many(externalLinkTable),
  sourceRelations: many(taskRelationTable, { relationName: "sourceTask" }),
  targetRelations: many(taskRelationTable, { relationName: "targetTask" }),
  remindersSent: many(taskReminderSentTable),
}));

export const timeEntryTableRelations = relations(timeEntryTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [timeEntryTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [timeEntryTable.userId],
    references: [userTable.id],
  }),
}));

export const activityTableRelations = relations(activityTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [activityTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [activityTable.userId],
    references: [userTable.id],
  }),
}));

export const assetTableRelations = relations(assetTable, ({ one }) => ({
  workspace: one(workspaceTable, {
    fields: [assetTable.workspaceId],
    references: [workspaceTable.id],
  }),
  project: one(projectTable, {
    fields: [assetTable.projectId],
    references: [projectTable.id],
  }),
  task: one(taskTable, {
    fields: [assetTable.taskId],
    references: [taskTable.id],
  }),
  activity: one(activityTable, {
    fields: [assetTable.activityId],
    references: [activityTable.id],
  }),
  creator: one(userTable, {
    fields: [assetTable.createdBy],
    references: [userTable.id],
  }),
}));

export const labelTableRelations = relations(labelTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [labelTable.taskId],
    references: [taskTable.id],
  }),
}));

export const notificationTableRelations = relations(
  notificationTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [notificationTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationPreferenceTableRelations = relations(
  userNotificationPreferenceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userNotificationPreferenceTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userNotificationWorkspaceRuleTableRelations = relations(
  userNotificationWorkspaceRuleTable,
  ({ one, many }) => ({
    user: one(userTable, {
      fields: [userNotificationWorkspaceRuleTable.userId],
      references: [userTable.id],
    }),
    workspace: one(workspaceTable, {
      fields: [userNotificationWorkspaceRuleTable.workspaceId],
      references: [workspaceTable.id],
    }),
    selectedProjects: many(userNotificationWorkspaceProjectTable),
  }),
);

export const userNotificationWorkspaceProjectTableRelations = relations(
  userNotificationWorkspaceProjectTable,
  ({ one }) => ({
    workspaceRule: one(userNotificationWorkspaceRuleTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.workspaceRuleId,
      ],
      references: [
        userNotificationWorkspaceRuleTable.workspaceId,
        userNotificationWorkspaceRuleTable.id,
      ],
    }),
    project: one(projectTable, {
      fields: [
        userNotificationWorkspaceProjectTable.workspaceId,
        userNotificationWorkspaceProjectTable.projectId,
      ],
      references: [projectTable.workspaceId, projectTable.id],
    }),
  }),
);

export const githubIntegrationTableRelations = relations(
  githubIntegrationTable,
  ({ one }) => ({
    project: one(projectTable, {
      fields: [githubIntegrationTable.projectId],
      references: [projectTable.id],
    }),
  }),
);

export const teamTableRelations = relations(teamTable, ({ one, many }) => ({
  workspace: one(workspaceTable, {
    fields: [teamTable.workspaceId],
    references: [workspaceTable.id],
  }),
  teamMembers: many(teamMemberTable),
}));

export const teamMemberTableRelations = relations(
  teamMemberTable,
  ({ one }) => ({
    team: one(teamTable, {
      fields: [teamMemberTable.teamId],
      references: [teamTable.id],
    }),
    user: one(userTable, {
      fields: [teamMemberTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const invitationTableRelations = relations(
  invitationTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [invitationTable.workspaceId],
      references: [workspaceTable.id],
    }),
    inviter: one(userTable, {
      fields: [invitationTable.inviterId],
      references: [userTable.id],
    }),
  }),
);

export const workspaceRoleTableRelations = relations(
  workspaceRoleTable,
  ({ one }) => ({
    workspace: one(workspaceTable, {
      fields: [workspaceRoleTable.workspaceId],
      references: [workspaceTable.id],
    }),
  }),
);

export const apikeyTableRelations = relations(apikeyTable, ({ one }) => ({
  user: one(userTable, {
    fields: [apikeyTable.referenceId],
    references: [userTable.id],
  }),
}));

export const integrationTableRelations = relations(
  integrationTable,
  ({ one, many }) => ({
    project: one(projectTable, {
      fields: [integrationTable.projectId],
      references: [projectTable.id],
    }),
    externalLinks: many(externalLinkTable),
  }),
);

export const taskRelationTableRelations = relations(
  taskRelationTable,
  ({ one }) => ({
    sourceTask: one(taskTable, {
      fields: [taskRelationTable.sourceTaskId],
      references: [taskTable.id],
      relationName: "sourceTask",
    }),
    targetTask: one(taskTable, {
      fields: [taskRelationTable.targetTaskId],
      references: [taskTable.id],
      relationName: "targetTask",
    }),
  }),
);

export const externalLinkTableRelations = relations(
  externalLinkTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [externalLinkTable.taskId],
      references: [taskTable.id],
    }),
    integration: one(integrationTable, {
      fields: [externalLinkTable.integrationId],
      references: [integrationTable.id],
    }),
  }),
);

export const taskReminderSentTableRelations = relations(
  taskReminderSentTable,
  ({ one }) => ({
    task: one(taskTable, {
      fields: [taskReminderSentTable.taskId],
      references: [taskTable.id],
    }),
  }),
);

export const commentTableRelations = relations(commentTable, ({ one }) => ({
  task: one(taskTable, {
    fields: [commentTable.taskId],
    references: [taskTable.id],
  }),
  user: one(userTable, {
    fields: [commentTable.userId],
    references: [userTable.id],
  }),
}));
