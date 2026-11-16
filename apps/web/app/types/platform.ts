// API shapes come from the platform packages' schemas; this file only narrows what the API leaves untyped.
import type { Condition } from '@elvine-sk/platform-core'
import type {
  Policy as PolicyRow,
  RoleDetail as RoleDetailRow,
} from '@elvine-sk/platform-authorization/schemas'

export type { UserAdmin, UsersOverview, UserStatus } from '@elvine-sk/platform-auth/schemas'
export type { HandoffHost, HandoffIdentity } from '@elvine-sk/platform-auth-handoff/schemas'
export type { OidcIdentity, OidcProvider } from '@elvine-sk/platform-auth-oidc/schemas'
export type {
  AccessExplanation,
  AuthzCatalog,
  Group,
  GroupDetail,
  GroupMember,
  GroupsOverview,
  PermissionDef,
  ResourceDef,
  Role,
  UserAccess,
} from '@elvine-sk/platform-authorization/schemas'
export type {
  AuditCategory,
  AuditEventRow as AuditEvent,
  AuditOutcome,
  AuditOverview,
} from '@elvine-sk/platform-audit/schemas'
export type { DashboardLayout, DashboardStat } from '@elvine-sk/platform-dashboard/schemas'
export type { SavedView, ViewList } from '@elvine-sk/platform-views/schemas'
export type {
  MoveCounter,
  NumberCounter,
  NumberSequence,
  NumberSequences,
} from '@elvine-sk/platform-numbering/schemas'
export type { OrgPersonView, OrgUnitView } from '@elvine-sk/platform-org/schemas'
export type {
  CorrectRefSheet,
  CreateRefSheet,
  RedateRefSheet,
  RefColumnInfo,
  RefLevel,
  RefOption,
  RefOptions,
  RefRowView,
  RefSheet,
  RefSheets,
  RefTable,
  RefTables,
} from '@elvine-sk/platform-refdata/schemas'
export type { MyTenants, Tenant, TenantMember, TenantRef } from '@elvine-sk/platform-tenancy/schemas'
export type {
  FileLimits,
  FileListMeta,
  FileMeta,
  FileUsage,
  MyFile,
  TrashedFile,
} from '@elvine-sk/platform-files/schemas'
export type { Job, JobDetail, JobsOverview, JobStatus } from '@elvine-sk/platform-jobs/schemas'
export type {
  WebhookDelivery,
  WebhookEventOption,
  WebhookHandlerOption,
  WebhookInboundEvent,
  WebhookSecret,
  WebhookSource,
  WebhookSourceCreated,
  WebhookSubscription,
  WebhookSubscriptionCreated,
} from '@elvine-sk/platform-webhooks/schemas'

export type Policy = Omit<PolicyRow, 'condition'> & { condition?: Condition | null }
export type RoleDetail = Omit<RoleDetailRow, 'policies'> & { policies: Policy[] }
