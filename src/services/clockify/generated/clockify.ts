// @ts-nocheck
import { makeApi, Zodios, type ZodiosOptions } from '@zodios/core'
import { z } from 'zod'

export type AddLimitedUsersRequest = {
  users: Array<LimitedUserRequest>
}
export type LimitedUserRequest = {
  costRate?: number | undefined
  hourlyRate?: number | undefined
  name: string
  userCustomFields?: Array<UpsertUserCustomFieldRequest> | undefined
  userGroups?: Array<string> | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  workCapacity?: string | undefined
  workingDays?: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'> | undefined
}
export type UpsertUserCustomFieldRequest = {
  customFieldId: string
  value?: {} | undefined
}
export type AddUsersToProjectRequestV1 = Partial<{
  remove: boolean
  userGroups: UserGroupIdsSchema
  userIds: Array<string>
}>
export type UserGroupIdsSchema = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN'
  ids: Array<string>
  status: 'ALL' | 'ACTIVE' | 'INACTIVE'
}>
export type ApprovalDetailsDtoV1 = Partial<{
  approvalRequest: ApprovalRequestDtoV1
  approvedTime: string
  billableAmount: number
  billableTime: string
  breakTime: string
  costAmount: number
  entries: Array<TimeEntryInfoDto>
  expenseTotal: number
  expenses: Array<ExpenseHydratedDto>
  pendingTime: string
  trackedTime: string
}>
export type ApprovalRequestDtoV1 = Partial<{
  creator: ApprovalRequestCreatorDtoV1
  dateRange: DateRangeDto
  id: string
  owner: ApprovalRequestOwnerDtoV1
  status: ApprovalRequestStatusDtoV1
  workspaceId: string
}>
export type ApprovalRequestCreatorDtoV1 = Partial<{
  userEmail: string
  userId: string
  userName: string
}>
export type DateRangeDto = Partial<{
  end: string
  start: string
}>
export type ApprovalRequestOwnerDtoV1 = Partial<{
  startOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  timeZone: string
  userId: string
  userName: string
}>
export type ApprovalRequestStatusDtoV1 = Partial<{
  note: string
  state: 'PENDING' | 'APPROVED' | 'WITHDRAWN_SUBMISSION' | 'WITHDRAWN_APPROVAL' | 'REJECTED'
  updatedAt: string
  updatedBy: string
  updatedByUserName: string
}>
export type TimeEntryInfoDto = Partial<{
  approvalRequestId: string
  billable: boolean
  costRate: RateDto
  customFieldValues: Array<CustomFieldValueDto>
  description: string
  hourlyRate: RateDto
  id: string
  isLocked: boolean
  project: ProjectInfoDto
  tags: Array<TagDto>
  task: TaskInfoDto
  timeInterval: TimeIntervalDto
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF'
}>
export type RateDto = Partial<{
  amount: number
  currency: string
}>
export type CustomFieldValueDto = Partial<{
  customFieldId: string
  sourceType: 'WORKSPACE' | 'PROJECT' | 'TIMEENTRY'
  timeEntryId: string
  value: {}
}>
export type ProjectInfoDto = Partial<{
  clientId: string
  clientName: string
  color: string
  id: string
  name: string
}>
export type TagDto = Partial<{
  archived: boolean
  id: string
  name: string
  workspaceId: string
}>
export type TaskInfoDto = Partial<{
  id: string
  name: string
}>
export type TimeIntervalDto = Partial<{
  duration: string
  end: string
  offsetEnd: number
  offsetStart: number
  start: string
  timeZone: string
  zonedEnd: string
  zonedStart: string
}>
export type ExpenseHydratedDto = Partial<{
  approvalRequestId: string
  approvalStatus: 'PENDING' | 'APPROVED' | 'UNSUBMITTED' | 'REJECTED' | 'WITHDRAWN_APPROVAL' | 'WITHDRAWN_SUBMISSION'
  billable: boolean
  category: ExpenseCategoryDto
  currency: string
  date: string
  detailedApprovalStatus:
    | 'PENDING'
    | 'APPROVED'
    | 'UNSUBMITTED'
    | 'REJECTED'
    | 'WITHDRAWN_APPROVAL'
    | 'WITHDRAWN_SUBMISSION'
  fileId: string
  fileName: string
  fileUrl: string
  id: string
  isLocked: boolean
  locked: boolean
  notes: string
  project: ProjectInfoDto
  quantity: number
  task: TaskInfoDto
  total: number
  userId: string
  workspaceId: string
}>
export type ExpenseCategoryDto = Partial<{
  archived: boolean
  hasUnitPrice: boolean
  id: string
  name: string
  priceInCents: number
  unit: string
  workspaceId: string
}>
export type AssignmentCreateRequestV1 = {
  billable?: boolean | undefined
  end: string
  hoursPerDay: number
  includeNonWorkingDays?: boolean | undefined
  note?: string | undefined
  projectId: string
  recurringAssignment?: CreateRecurringAssignmentRequestV1 | undefined
  start: string
  startTime?: string | undefined
  taskId?: string | undefined
  userId: string
}
export type CreateRecurringAssignmentRequestV1 = {
  repeat?: boolean | undefined
  weeks: number
}
export type AssignmentDtoV1 = Partial<{
  billable: boolean
  excludeDays: Array<SchedulingExcludeDay>
  hoursPerDay: number
  id: string
  includeNonWorkingDays: boolean
  note: string
  period: DateRangeDto
  projectId: string
  published: boolean
  recurring: RecurringAssignmentDto
  startTime: string
  taskId: string
  userId: string
  workspaceId: string
}>
export type SchedulingExcludeDay = Partial<{
  date: string
  type: 'WEEKEND' | 'HOLIDAY' | 'TIME_OFF'
}>
export type RecurringAssignmentDto = Partial<{
  repeat: boolean
  seriesId: string
  weeks: number
}>
export type AssignmentHydratedDtoV1 = Partial<{
  billable: boolean
  clientId: string
  clientName: string
  hoursPerDay: number
  id: string
  note: string
  period: DateRangeDto
  projectArchived: boolean
  projectBillable: boolean
  projectColor: string
  projectId: string
  projectName: string
  startTime: string
  taskId: string
  taskName: string
  userId: string
  userName: string
  workspaceId: string
}>
export type AutomaticTimeEntryCreationDto = Partial<{
  defaultEntities: DefaultEntitiesDto
  enabled: boolean
}>
export type DefaultEntitiesDto = Partial<{
  projectId: string
  taskId: string
}>
export type AutomaticTimeEntryCreationRequest = {
  defaultEntities: DefaultEntitiesRequest
  enabled?: boolean | undefined
}
export type DefaultEntitiesRequest = Partial<{
  projectId: string
  taskId: string
}>
export type BalancesWithCountDtoV1 = Partial<{
  balances: Array<BalanceDtoV1>
  count: number
}>
export type BalanceDtoV1 = Partial<{
  balance: number
  id: string
  negativeBalanceAmount: number
  negativeBalanceLimit: boolean
  policyArchived: boolean
  policyId: string
  policyName: string
  policyTimeUnit: 'DAYS' | 'HOURS'
  total: number
  used: number
  userId: string
  userName: string
  workspaceId: string
}>
export type CreateHolidayRequestV1 = {
  automaticTimeEntryCreation?: AutomaticTimeEntryCreationRequest | undefined
  color?: string | undefined
  datePeriod: DatePeriodRequest
  everyoneIncludingNew?: boolean | undefined
  name: string
  occursAnnually?: boolean | undefined
  userGroups?: UserGroupIdsSchema | undefined
  users?: UserIdsSchema | undefined
}
export type DatePeriodRequest = {
  endDate: string
  startDate: string
}
export type UserIdsSchema = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN'
  ids: Array<string>
  status: 'ALL' | 'ACTIVE' | 'INACTIVE'
}>
export type CreatePolicyRequestV1 = {
  allowHalfDay?: boolean | undefined
  allowNegativeBalance?: boolean | undefined
  approve: PolicyApprovalDto
  archived?: boolean | undefined
  automaticAccrual?: AutomaticAccrualRequest | undefined
  automaticTimeEntryCreation?: AutomaticTimeEntryCreationRequest | undefined
  color?: string | undefined
  everyoneIncludingNew?: boolean | undefined
  hasExpiration?: boolean | undefined
  icon?:
    | (
        | 'UMBRELLA'
        | 'SNOWFLAKE'
        | 'FAMILY'
        | 'PLANE'
        | 'STETHOSCOPE'
        | 'HEALTH_METRICS'
        | 'CHILDCARE'
        | 'LUGGAGE'
        | 'MONETIZATION'
        | 'CALENDAR'
      )
    | undefined
  name: string
  negativeBalance?: NegativeBalanceRequest | undefined
  timeUnit?: ('DAYS' | 'HOURS') | undefined
  userGroups?: UserGroupIdsSchema | undefined
  users?: UserIdsSchema | undefined
}
export type PolicyApprovalDto = Partial<{
  requiresApproval: boolean
  specificMembers: boolean
  teamManagers: boolean
  userIds: Array<string>
}>
export type AutomaticAccrualRequest = {
  amount: number
  period?: ('MONTH' | 'YEAR') | undefined
  timeUnit?: ('DAYS' | 'HOURS') | undefined
}
export type NegativeBalanceRequest = {
  amount: number
  period?: ('MONTH' | 'YEAR') | undefined
  shouldReset?: boolean | undefined
}
export type CreateTimeEntryRequest = Partial<{
  billable: boolean
  customAttributes: Array<CreateCustomAttributeRequest>
  customFields: Array<UpdateCustomFieldRequest>
  description: string
  end: string
  projectId: string
  start: string
  tagIds: Array<string>
  taskId: string
  type: 'REGULAR' | 'BREAK'
}>
export type CreateCustomAttributeRequest = {
  name: string
  namespace: string
  value: string
}
export type UpdateCustomFieldRequest = {
  customFieldId: string
  sourceType?: ('WORKSPACE' | 'PROJECT' | 'TIMEENTRY') | undefined
  value?: {} | undefined
}
export type CreateTimeOffRequestV1Request = {
  note?: string | undefined
  timeOffPeriod: TimeOffRequestPeriodV1Request
}
export type TimeOffRequestPeriodV1Request = {
  halfDayPeriod?: ('FIRST_HALF' | 'SECOND_HALF' | 'NOT_DEFINED') | undefined
  isHalfDay?: boolean | undefined
  period: PeriodV1Request
  timeOffHalfDayPeriod?: ('FIRST_HALF' | 'SECOND_HALF' | 'NOT_DEFINED') | undefined
}
export type PeriodV1Request = Partial<{
  days: number
  end: string
  start: string
}>
export type CustomFieldDtoV1 = Partial<{
  allowedValues: Array<string>
  description: string
  entityType: string
  id: string
  name: string
  onlyAdminCanEdit: boolean
  placeholder: string
  projectDefaultValues: Array<CustomFieldDefaultValuesDtoV1>
  required: boolean
  status: string
  type: string
  workspaceDefaultValue: {}
  workspaceId: string
}>
export type CustomFieldDefaultValuesDtoV1 = Partial<{
  projectId: string
  status: string
  value: {}
}>
export type EntityCreationPermissionsDtoV1 = Partial<{
  whoCanCreateProjectsAndClients: EntityCreationPermission
  whoCanCreateTags: EntityCreationPermission
  whoCanCreateTasks: EntityCreationPermission
}>
export type EntityCreationPermission = 'ADMINS' | 'ADMINS_AND_PROJECT_MANAGERS' | 'EVERYONE'
export type ExpenseCategoriesWithCountDtoV1 = Partial<{
  categories: Array<ExpenseCategoryDtoV1>
  count: number
}>
export type ExpenseCategoryDtoV1 = Partial<{
  archived: boolean
  hasUnitPrice: boolean
  id: string
  name: string
  priceInCents: number
  unit: string
  workspaceId: string
}>
export type ExpenseHydratedDtoV1 = Partial<{
  billable: boolean
  category: ExpenseCategoryDto
  date: string
  fileId: string
  fileName: string
  id: string
  isLocked: boolean
  locked: boolean
  notes: string
  project: ProjectInfoDto
  quantity: number
  task: TaskInfoDto
  total: number
  userId: string
  workspaceId: string
}>
export type ExpensesAndTotalsDtoV1 = Partial<{
  dailyTotals: Array<ExpenseDailyTotalsDtoV1>
  expenses: ExpensesWithCountDtoV1
  weeklyTotals: Array<ExpenseWeeklyTotalsDtoV1>
}>
export type ExpenseDailyTotalsDtoV1 = Partial<{
  date: string
  dateAsInstant: string
  total: number
}>
export type ExpensesWithCountDtoV1 = Partial<{
  count: number
  expenses: Array<ExpenseHydratedDtoV1>
}>
export type ExpenseWeeklyTotalsDtoV1 = Partial<{
  date: string
  total: number
}>
export type FeaturePlan = FeaturePlan
export type GetUserTotalsRequestV1 = {
  end: string
  page?: number | undefined
  pageSize?: number | undefined
  search?: string | undefined
  start: string
  statusFilter?: ('PUBLISHED' | 'UNPUBLISHED' | 'ALL') | undefined
  userFilter?: ContainsUsersFilterRequestV1 | undefined
  userGroupFilter?: ContainsUserGroupFilterRequestV1 | undefined
}
export type ContainsUsersFilterRequestV1 = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  sourceType: 'USER_GROUP'
  status: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'
  statuses: Array<'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'>
}>
export type ContainsUserGroupFilterRequestV1 = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'
}>
export type HolidayDto = Partial<{
  automaticTimeEntryCreation: AutomaticTimeEntryCreationDto
  color: string
  datePeriod: DatePeriod
  everyoneIncludingNew: boolean
  id: string
  name: string
  occursAnnually: boolean
  userGroupIds: Array<string>
  userGroups: Array<EntityIdNameDto>
  userIds: Array<string>
  users: Array<EntityIdNameDto>
  workspaceId: string
}>
export type DatePeriod = Partial<{
  endDate: string
  startDate: string
}>
export type EntityIdNameDto = Partial<{
  id: string
  name: string
}>
export type HolidayDtoV1 = Partial<{
  automaticTimeEntryCreation: boolean
  datePeriod: DatePeriod
  everyoneIncludingNew: boolean
  id: string
  name: string
  occursAnnually: boolean
  projectId: string
  taskId: string
  userGroupIds: Array<string>
  userIds: Array<string>
  workspaceId: string
}>
export type ImportTimeEntriesAndExpensesRequestV1 = {
  expenseFieldsForDetailedGroup?: Array<'PROJECT' | 'TASK' | 'CATEGORY' | 'NOTE' | 'DATE' | 'USER'> | undefined
  expensesGroupBy?: ('CATEGORY' | 'PROJECT' | 'USER') | undefined
  expensesGroupType?: ('GROUPED' | 'DETAILED') | undefined
  from: string
  importExpenses: boolean
  projectFilter: ContainsArchivedFilterRequest
  roundTimeEntryDuration?: boolean | undefined
  timeEntryFieldsForDetailedGroup?: Array<'PROJECT' | 'TASK' | 'TAGS' | 'DESCRIPTION' | 'DATE' | 'USER'> | undefined
  timeEntryGroupType: 'SINGLE_ITEM' | 'GROUPED' | 'DETAILED'
  timeEntryPrimaryGroupBy?: ('USER' | 'PROJECT' | 'DATE') | undefined
  timeEntrySecondaryGroupBy?: ('PROJECT' | 'USER' | 'TASK' | 'DATE' | 'DESCRIPTION' | 'NONE') | undefined
  to: string
}
export type ContainsArchivedFilterRequest = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL'
}>
export type InvoiceFilterRequestV1 = Partial<{
  clients: ContainsArchivedFilterRequest
  companies: BaseFilterRequest
  exactAmount: number
  exactBalance: number
  greaterThanAmount: number
  greaterThanBalance: number
  invoiceNumber: string
  issueDate: TimeRangeRequestDtoV1
  lessThanAmount: number
  lessThanBalance: number
  page: number
  pageSize: number
  sortColumn: 'ID' | 'CLIENT' | 'DUE_ON' | 'ISSUE_DATE' | 'AMOUNT' | 'BALANCE'
  sortOrder: 'ASCENDING' | 'DESCENDING'
  statuses: Array<'UNSENT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'OVERDUE'>
  strictSearch: boolean
}>
export type BaseFilterRequest = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
}>
export type TimeRangeRequestDtoV1 = Partial<{
  'issue-date-end': string
  'issue-date-start': string
}>
export type InvoiceInfoResponseDtoV1 = Partial<{
  invoices: Array<InvoiceInfoV1>
  total: number
}>
export type InvoiceInfoV1 = Partial<{
  amount: number
  balance: number
  billFrom: string
  clientId: string
  clientName: string
  currency: string
  daysOverdue: number
  dueDate: string
  id: string
  issuedDate: string
  number: string
  paid: number
  status: 'UNSENT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'OVERDUE'
  visibleZeroFields: VisibleZeroFieldsInvoice
}>
export type VisibleZeroFieldsInvoice = 'TAX' | 'TAX_2' | 'DISCOUNT'
export type InvoiceItemDto = Partial<{
  amount: number
  applyTaxes: ApplyTaxes
  description: string
  expenseIds: Array<string>
  importType: 'NOT_IMPORTED' | 'TIME_ENTRY_IMPORT' | 'EXPENSE_IMPORT'
  itemType: string
  order: number
  quantity: number
  timeEntryIds: Array<string>
  unitPrice: number
}>
export type ApplyTaxes = 'TAX1' | 'TAX2' | 'TAX1TAX2' | 'NONE'
export type InvoiceOverviewDtoV1 = Partial<{
  amount: number
  balance: number
  billFrom: string
  calculationType: CalculationType
  clientAddress: string
  clientId: string
  clientName: string
  companyId: string
  containsImportedExpenses: boolean
  containsImportedTimes: boolean
  currency: string
  discount: number
  discountAmount: number
  dueDate: string
  id: string
  issuedDate: string
  items: Array<InvoiceItemDto>
  note: string
  number: string
  paid: number
  status: 'UNSENT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'OVERDUE'
  subject: string
  subtotal: number
  tax: number
  tax2: number
  tax2Amount: number
  taxAmount: number
  taxType: TaxType
  userId: string
  visibleZeroFields: VisibleZeroFieldsInvoice
}>
export type CalculationType = 'INVOICE_BASED' | 'ITEM_BASED'
export type TaxType = 'COMPOUND' | 'SIMPLE' | 'NONE'
export type InvoiceSettingsDtoV1 = Partial<{
  defaults: InvoiceDefaultSettingsDto
  exportFields: InvoiceExportFields
  labels: LabelsCustomization
}>
export type InvoiceDefaultSettingsDto = Partial<{
  companyId: string
  defaultImportExpenseItemTypeId: string
  defaultImportTimeItemTypeId: string
  dueDays: number
  itemType: string
  itemTypeId: string
  notes: string
  subject: string
  tax: number
  tax2: number
  tax2Percent: number
  taxPercent: number
  taxType: 'COMPOUND' | 'SIMPLE' | 'NONE'
}>
export type InvoiceExportFields = Partial<{
  RTL: boolean
  itemType: boolean
  quantity: boolean
  rtl: boolean
  tax: boolean
  tax2: boolean
  unitPrice: boolean
}>
export type LabelsCustomization = Partial<{
  amount: string
  billFrom: string
  billTo: string
  description: string
  discount: string
  dueDate: string
  issueDate: string
  itemType: string
  notes: string
  paid: string
  quantity: string
  subtotal: string
  tax: string
  tax2: string
  total: string
  totalAmount: string
  unitPrice: string
}>
export type InvoicesListDtoV1 = Partial<{
  invoices: Array<InvoiceDtoV1>
  total: number
}>
export type InvoiceDtoV1 = Partial<{
  amount: number
  balance: number
  clientId: string
  clientName: string
  currency: string
  dueDate: string
  id: string
  issuedDate: string
  number: string
  paid: number
  status: 'UNSENT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'VOID' | 'OVERDUE'
}>
export type MemberProfileDtoV1 = Partial<{
  email: string
  hasPassword: boolean
  hasPendingApprovalRequest: boolean
  imageUrl: string
  name: string
  userCustomFieldValues: Array<UserCustomFieldValueFullDtoV1>
  weekStart: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  workCapacity: string
  workingDays: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  workspaceNumber: number
}>
export type UserCustomFieldValueFullDtoV1 = Partial<{
  customField: CustomFieldDtoV1
  customFieldId: string
  name: string
  sourceType: 'WORKSPACE' | 'USER'
  type: 'TXT' | 'NUMBER' | 'DROPDOWN_SINGLE' | 'DROPDOWN_MULTIPLE' | 'CHECKBOX' | 'LINK'
  userId: string
  value: {}
}>
export type MemberProfileFullRequestV1 = Partial<{
  imageUrl: string
  name: string
  removeProfileImage: boolean
  userCustomFields: Array<UpsertUserCustomFieldRequest>
  weekStart: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  workCapacity: string
  workingDays: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
}>
export type MembershipDtoV1 = Partial<{
  costRate: RateDtoV1
  hourlyRate: HourlyRateDtoV1
  membershipStatus: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'
  membershipType: 'WORKSPACE' | 'PROJECT' | 'USERGROUP'
  targetId: string
  userId: string
}>
export type RateDtoV1 = Partial<{
  amount: number
  currency: string
}>
export type HourlyRateDtoV1 = Partial<{
  amount: number
  currency: string
}>
export type MembershipRequest = Partial<{
  hourlyRate: HourlyRateRequest
  membershipStatus: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'
  membershipType: 'WORKSPACE' | 'PROJECT' | 'USERGROUP'
  userId: string
}>
export type HourlyRateRequest = {
  amount: number
  since?: string | undefined
}
export type PageableCollectionLogBinDocumentDto = Partial<{
  response: Array<LogBinDocumentDto>
}>
export type LogBinDocumentDto = Partial<{
  deletedAt: string
  document: {}
  documentCode: string
  id: string
}>
export type PolicyDtoV1 = Partial<{
  allowHalfDay: boolean
  allowNegativeBalance: boolean
  approve: PolicyApprovalDto
  archived: boolean
  automaticAccrual: AutomaticAccrualDto
  automaticTimeEntryCreation: AutomaticTimeEntryCreationDto
  everyoneIncludingNew: boolean
  id: string
  name: string
  negativeBalance: NegativeBalanceDto
  projectId: string
  timeUnit: 'DAYS' | 'HOURS'
  userGroupIds: Array<string>
  userIds: Array<string>
  workspaceId: string
}>
export type AutomaticAccrualDto = Partial<{
  amount: number
  period: 'MONTH' | 'YEAR'
  timeUnit: 'DAYS' | 'HOURS'
}>
export type NegativeBalanceDto = Partial<{
  amount: number
  period: string
  shouldReset: boolean
  timeUnit: string
}>
export type ProjectDtoImplV1 = Partial<{
  archived: boolean
  billable: boolean
  budgetEstimate: EstimateWithOptionsDto
  clientId: string
  clientName: string
  color: string
  costRate: RateDtoV1
  duration: string
  estimate: EstimateDtoV1
  estimateReset: EstimateResetDto
  hourlyRate: RateDtoV1
  id: string
  isPublic: boolean
  isTemplate: boolean
  memberships: Array<MembershipDtoV1>
  name: string
  note: string
  public: boolean
  template: boolean
  timeEstimate: TimeEstimateDto
  workspaceId: string
}>
export type EstimateWithOptionsDto = Partial<{
  active: boolean
  estimate: number
  includeExpenses: boolean
  resetOption: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  type: 'AUTO' | 'MANUAL'
}>
export type EstimateDtoV1 = Partial<{
  estimate: string
  type: 'AUTO' | 'MANUAL'
}>
export type EstimateResetDto = Partial<{
  dayOfMonth: number
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  hour: number
  interval: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  month:
    | 'JANUARY'
    | 'FEBRUARY'
    | 'MARCH'
    | 'APRIL'
    | 'MAY'
    | 'JUNE'
    | 'JULY'
    | 'AUGUST'
    | 'SEPTEMBER'
    | 'OCTOBER'
    | 'NOVEMBER'
    | 'DECEMBER'
}>
export type TimeEstimateDto = Partial<{
  active: boolean
  estimate: string
  includeNonBillable: boolean
  resetOption: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  type: 'AUTO' | 'MANUAL'
}>
export type ProjectDtoV1 = Partial<{
  archived: boolean
  billable: boolean
  budgetEstimate: EstimateWithOptionsDto
  color: string
  costRate: RateDtoV1
  duration: string
  estimate: EstimateDtoV1
  hourlyRate: RateDtoV1
  id: string
  memberships: Array<MembershipDtoV1>
  name: string
  note: string
  public: boolean
  template: boolean
  timeEstimate: TimeEstimateDto
  workspaceId: string
}>
export type ProjectEstimateRequest = Partial<{
  budgetEstimate: EstimateWithOptionsRequest
  estimateReset: EstimateResetRequest
  timeEstimate: TimeEstimateRequest
}>
export type EstimateWithOptionsRequest = Partial<{
  active: boolean
  estimate: number
  includeExpenses: boolean
  resetOption: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  type: 'AUTO' | 'MANUAL'
}>
export type EstimateResetRequest = Partial<{
  active: boolean
  dayOfMonth: number
  dayOfWeek: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  hour: number
  interval: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  isActive: boolean
  month:
    | 'JANUARY'
    | 'FEBRUARY'
    | 'MARCH'
    | 'APRIL'
    | 'MAY'
    | 'JUNE'
    | 'JULY'
    | 'AUGUST'
    | 'SEPTEMBER'
    | 'OCTOBER'
    | 'NOVEMBER'
    | 'DECEMBER'
}>
export type TimeEstimateRequest = Partial<{
  active: boolean
  estimate: string
  includeNonBillable: boolean
  resetOption: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  type: 'AUTO' | 'MANUAL'
}>
export type ProjectRequest = {
  billable?: boolean | undefined
  clientId?: string | undefined
  color?: string | undefined
  costRate?: CostRateRequestV1 | undefined
  estimate?: EstimateRequest | undefined
  hourlyRate?: HourlyRateRequestV1 | undefined
  isPublic?: boolean | undefined
  memberships?: Array<MembershipRequest> | undefined
  name: string
  note?: string | undefined
  tasks?: Array<TaskRequest> | undefined
}
export type CostRateRequestV1 = {
  amount: number
  since?: string | undefined
}
export type EstimateRequest = Partial<{
  estimate: string
  type: 'AUTO' | 'MANUAL'
}>
export type HourlyRateRequestV1 = {
  amount: number
  since?: string | undefined
}
export type TaskRequest = {
  assigneeId?: string | undefined
  assigneeIds?: Array<string> | undefined
  billable?: boolean | undefined
  budgetEstimate?: number | undefined
  costRate?: CostRateRequest | undefined
  estimate?: string | undefined
  hourlyRate?: HourlyRateRequest | undefined
  id?: string | undefined
  name: string
  projectId?: string | undefined
  status?: string | undefined
  userGroupIds?: Array<string> | undefined
}
export type CostRateRequest = Partial<{
  amount: number
  since: string
  sinceAsInstant: string
}>
export type PublishAssignmentsRequestV1 = {
  end: string
  notifyUsers?: boolean | undefined
  search?: string | undefined
  start: string
  userFilter?: ContainsUsersFilterRequestV1 | undefined
  userGroupFilter?: ContainsUserGroupFilterRequestV1 | undefined
  viewType?: ('PROJECTS' | 'TEAM' | 'ALL') | undefined
}
export type RoleDetailsDtoV1 = Partial<{
  role: RoleDtoV1
  userId: string
  workspaceId: string
}>
export type RoleDtoV1 = Partial<{
  id: string
  name: string
  source: AuthorizationSourceDtoV1
}>
export type AuthorizationSourceDtoV1 = Partial<{
  id: string
  type: 'USER_GROUP'
}>
export type SchedulingProjectsTotalsDtoV1 = Partial<{
  assignments: Array<AssignmentPerDayDto>
  clientName: string
  milestones: Array<MilestoneDto>
  projectArchived: boolean
  projectBillable: boolean
  projectColor: string
  projectId: string
  projectName: string
  taskId: string
  taskName: string
  totalHours: number
  workspaceId: string
}>
export type AssignmentPerDayDto = Partial<{
  date: string
  hasAssignment: boolean
}>
export type MilestoneDto = Partial<{
  date: string
  id: string
  name: string
  projectId: string
  workspaceId: string
}>
export type SchedulingUsersTotalsDtoV1 = Partial<{
  capacityPerDay: number
  totalHoursPerDay: Array<TotalsPerDayDto>
  userId: string
  userImage: string
  userName: string
  userStatus: string
  workingDays: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  workspaceId: string
}>
export type TotalsPerDayDto = Partial<{
  date: string
  totalHours: number
}>
export type TaskDtoV1 = Partial<{
  assigneeId: string
  assigneeIds: Array<string>
  billable: boolean
  budgetEstimate: number
  costRate: RateDtoV1
  duration: string
  estimate: string
  hourlyRate: RateDtoV1
  id: string
  name: string
  projectId: string
  status: TaskStatus
  userGroupIds: Array<string>
}>
export type TaskStatus = 'ACTIVE' | 'DONE' | 'ALL'
export type TemplateDtoImpl = Partial<{
  entries: Array<TimeEntryWithCustomFieldsDto>
  id: string
  name: string
  projectsAndTasks: Array<ProjectTaskTupleDto>
  userId: string
  weekStart: string
  workspaceId: string
}>
export type TimeEntryWithCustomFieldsDto = Partial<{
  billable: boolean
  customFieldValues: Array<CustomFieldValueDto>
  description: string
  id: string
  projectId: string
  tagIds: Array<string>
  taskId: string
  timeInterval: TimeIntervalDto
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF'
  userId: string
  workspaceId: string
}>
export type ProjectTaskTupleDto = Partial<{
  projectId: string
  taskId: string
}>
export type TemplateRequest = {
  name: string
  projectsAndTasks: Array<ProjectTaskTupleRequest>
  timeEntryIds?: Array<string> | undefined
  weekStart?: string | undefined
}
export type ProjectTaskTupleRequest = {
  projectId: string
  taskId?: string | undefined
  type?: string | undefined
}
export type TimeEntryDtoImplV1 = Partial<{
  billable: boolean
  customFieldValues: Array<CustomFieldValueDtoV1>
  description: string
  id: string
  isLocked: boolean
  kioskId: string
  projectId: string
  tagIds: Array<string>
  taskId: string
  timeInterval: TimeIntervalDtoV1
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF'
  userId: string
  workspaceId: string
}>
export type CustomFieldValueDtoV1 = Partial<{
  customFieldId: string
  name: string
  timeEntryId: string
  type: string
  value: {}
}>
export type TimeIntervalDtoV1 = Partial<{
  duration: string
  end: string
  start: string
}>
export type TimeEntryDtoV1 = Partial<{
  billable: boolean
  customFieldValues: Array<CustomFieldValueDtoV1>
  description: string
  id: string
  isLocked: boolean
  kioskId: string
  projectId: string
  tagIds: Array<string>
  taskId: string
  timeInterval: TimeIntervalDtoV1
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF'
  userId: string
  workspaceId: string
}>
export type TimeEntryWithRatesDtoV1 = Partial<{
  billable: boolean
  costRate: RateDtoV1
  customFieldValues: Array<CustomFieldValueDtoV1>
  description: string
  hourlyRate: RateDtoV1
  id: string
  isLocked: boolean
  kioskId: string
  projectId: string
  tagIds: Array<string>
  taskId: string
  timeInterval: TimeIntervalDtoV1
  type: 'REGULAR' | 'BREAK' | 'HOLIDAY' | 'TIME_OFF'
  userId: string
  workspaceId: string
}>
export type TimeOffRequestFullV1Dto = Partial<{
  balance: number
  balanceDiff: number
  createdAt: string
  id: string
  note: string
  policyId: string
  policyName: string
  requesterUserId: string
  requesterUserName: string
  status: TimeOffRequestStatus
  timeOffPeriod: TimeOffRequestPeriodDto
  timeUnit: 'DAYS' | 'HOURS'
  userEmail: string
  userId: string
  userName: string
  userTimeZone: string
  workspaceId: string
}>
export type TimeOffRequestStatus = Partial<{
  changedAt: string
  changedByUserId: string
  changedByUserName: string
  changedForUserName: string
  note: string
  statusType: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'
}>
export type TimeOffRequestPeriodDto = Partial<{
  halfDay: boolean
  halfDayHours: Period
  halfDayPeriod: string
  period: Period
}>
export type Period = Partial<{
  end: string
  start: string
}>
export type TimeOffRequestV1Dto = Partial<{
  balanceDiff: number
  createdAt: string
  id: string
  note: string
  policyId: string
  status: TimeOffRequestStatus
  timeOffPeriod: TimeOffRequestPeriodDto
  userId: string
  workspaceId: string
}>
export type TimeOffRequestsWithCountV1Dto = Partial<{
  count: number
  requests: Array<TimeOffRequestFullV1Dto>
}>
export type UpdateHolidayRequestV1 = {
  automaticTimeEntryCreation?: AutomaticTimeEntryCreationRequest | undefined
  color?: string | undefined
  datePeriod: DatePeriodRequest
  everyoneIncludingNew?: boolean | undefined
  name: string
  occursAnnually: boolean
  userGroups?: ContainsUserGroupFilterRequest | undefined
  users?: ContainsUsersFilterRequestForHoliday | undefined
}
export type ContainsUserGroupFilterRequest = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'PENDING' | 'ACTIVE' | 'DECLINED' | 'INACTIVE' | 'ALL'
}>
export type ContainsUsersFilterRequestForHoliday = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ALL' | 'ACTIVE' | 'INACTIVE'
  statuses: Array<string>
}>
export type UpdateInvoiceRequestV1 = {
  clientId?: string | undefined
  companyId?: string | undefined
  currency: string
  discountPercent: number
  dueDate: string
  issuedDate: string
  note?: string | undefined
  number: string
  subject?: string | undefined
  tax2Percent: number
  taxPercent: number
  taxType?: TaxType | undefined
  visibleZeroFields?: ('TAX' | 'TAX_2' | 'DISCOUNT') | undefined
}
export type UpdateInvoiceSettingsRequestV1 = {
  defaults?: InvoiceDefaultSettingsRequestV1 | undefined
  exportFields?: InvoiceExportFieldsRequest | undefined
  labels: LabelsCustomizationRequest
}
export type InvoiceDefaultSettingsRequestV1 = {
  companyId?: string | undefined
  dueDays?: number | undefined
  itemTypeId?: string | undefined
  notes: string
  subject: string
  tax2Percent?: number | undefined
  taxPercent?: number | undefined
  taxType?: ('COMPOUND' | 'SIMPLE' | 'NONE') | undefined
}
export type InvoiceExportFieldsRequest = Partial<{
  itemType: boolean
  quantity: boolean
  rtl: boolean
  tax: boolean
  tax2: boolean
  unitPrice: boolean
}>
export type LabelsCustomizationRequest = {
  amount: string
  billFrom: string
  billTo: string
  description: string
  discount: string
  dueDate: string
  issueDate: string
  itemType: string
  notes: string
  paid: string
  quantity: string
  subtotal: string
  tax: string
  tax2: string
  total: string
  totalAmountDue: string
  unitPrice: string
}
export type UpdateInvoicedStatusRequest = {
  invoiced: boolean
  timeEntryIds: Array<TimeEntryId>
}
export type TimeEntryId = Partial<{
  dateOfCreationFromObjectId: string
}>
export type UpdatePolicyRequestV1 = {
  allowHalfDay: boolean
  allowNegativeBalance: boolean
  approve: PolicyApprovalDto
  archived: boolean
  automaticAccrual?: AutomaticAccrualRequest | undefined
  automaticTimeEntryCreation?: AutomaticTimeEntryCreationRequest | undefined
  color?: string | undefined
  everyoneIncludingNew: boolean
  hasExpiration: boolean
  icon?:
    | (
        | 'UMBRELLA'
        | 'SNOWFLAKE'
        | 'FAMILY'
        | 'PLANE'
        | 'STETHOSCOPE'
        | 'HEALTH_METRICS'
        | 'CHILDCARE'
        | 'LUGGAGE'
        | 'MONETIZATION'
        | 'CALENDAR'
      )
    | undefined
  name: string
  negativeBalance?: NegativeBalanceRequest | undefined
  userGroups: UserGroupIdsSchema
  users: UserIdsSchema
}
export type UpdateProjectMembershipsRequest = {
  memberships: Array<UserIdWithRatesRequest>
  userGroups?: UserGroupIdsSchema | undefined
}
export type UserIdWithRatesRequest = {
  costRate?: CostRateRequestV1 | undefined
  hourlyRate?: HourlyRateRequestV1 | undefined
  userId: string
}
export type UpdateProjectRequest = Partial<{
  archived: boolean
  billable: boolean
  clientId: string
  color: string
  costRate: CostRateRequestV1
  hourlyRate: HourlyRateRequestV1
  isPublic: boolean
  name: string
  note: string
}>
export type UpdateTimeEntryBulkRequest = {
  billable?: boolean | undefined
  customFields?: Array<UpdateCustomFieldRequest> | undefined
  description?: string | undefined
  end?: string | undefined
  id: string
  projectId?: string | undefined
  start?: string | undefined
  tagIds?: Array<string> | undefined
  taskId?: string | undefined
  type?: ('REGULAR' | 'BREAK') | undefined
}
export type UpdateTimeEntryRequest = {
  billable?: boolean | undefined
  customFields?: Array<UpdateCustomFieldRequest> | undefined
  description?: string | undefined
  end?: string | undefined
  projectId?: string | undefined
  start: string
  tagIds?: Array<string> | undefined
  taskId?: string | undefined
  type?: ('REGULAR' | 'BREAK') | undefined
}
export type UserCustomFieldValueDtoV1 = Partial<{
  customFieldId: string
  customFieldName: string
  customFieldType: CustomFieldType
  userId: string
  value: {}
}>
export type CustomFieldType = 'TXT' | 'NUMBER' | 'DROPDOWN_SINGLE' | 'DROPDOWN_MULTIPLE' | 'CHECKBOX' | 'LINK'
export type UserDtoV1 = Partial<{
  activeWorkspace: string
  customFields: Array<UserCustomFieldValueDtoV1>
  defaultWorkspace: string
  email: string
  id: string
  memberships: Array<MembershipDtoV1>
  name: string
  profilePicture: string
  settings: UserSettingsDtoV1
  status: AccountStatus
}>
export type UserSettingsDtoV1 = {
  alerts?: boolean | undefined
  approval?: boolean | undefined
  collapseAllProjectLists?: boolean | undefined
  dashboardPinToTop?: boolean | undefined
  dashboardSelection?: ('ME' | 'TEAM') | undefined
  dashboardViewType?: ('PROJECT' | 'BILLABILITY') | undefined
  dateFormat: string
  groupSimilarEntriesDisabled?: boolean | undefined
  invoiceReminders?: boolean | undefined
  isCompactViewOn?: boolean | undefined
  lang?: string | undefined
  longRunning?: boolean | undefined
  multiFactorEnabled?: boolean | undefined
  myStartOfDay?: string | undefined
  onboarding?: boolean | undefined
  projectListCollapse?: number | undefined
  projectPickerTaskFilter?: boolean | undefined
  pto?: boolean | undefined
  reminders?: boolean | undefined
  scheduledReports?: boolean | undefined
  scheduling?: boolean | undefined
  sendNewsletter?: boolean | undefined
  showOnlyWorkingDays?: boolean | undefined
  summaryReportSettings?: SummaryReportSettingsDtoV1 | undefined
  theme?: ('DARK' | 'DEFAULT') | undefined
  timeFormat: 'HOUR12' | 'HOUR24'
  timeTrackingManual?: boolean | undefined
  timeZone: string
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyUpdates?: boolean | undefined
}
export type SummaryReportSettingsDtoV1 = {
  group: string
  subgroup: string
}
export type AccountStatus =
  | 'ACTIVE'
  | 'PENDING_EMAIL_VERIFICATION'
  | 'DELETED'
  | 'NOT_REGISTERED'
  | 'LIMITED'
  | 'LIMITED_DELETED'
export type UserGroupDtoV1 = Partial<{
  id: string
  name: string
  teamManagers: Array<UserRedactedDtoV1>
  userIds: Array<string>
  workspaceId: string
}>
export type UserRedactedDtoV1 = Partial<{
  id: string
  name: string
}>
export type WebhookDtoV1 = Partial<{
  authToken: string
  deliveryEnabled: boolean
  enabled: boolean
  id: string
  name: string
  planEnabled: boolean
  triggerSource: Array<string>
  triggerSourceType: WebhookEventTriggerSourceType
  url: string
  userId: string
  webhookEvent: WebhookEventType
  workspaceId: string
}>
export type WebhookEventTriggerSourceType =
  | 'PROJECT_ID'
  | 'USER_ID'
  | 'TAG_ID'
  | 'TASK_ID'
  | 'WORKSPACE_ID'
  | 'ASSIGNMENT_ID'
  | 'EXPENSE_ID'
export type WebhookEventType =
  | 'NEW_PROJECT'
  | 'NEW_TASK'
  | 'NEW_CLIENT'
  | 'NEW_TIMER_STARTED'
  | 'TIMER_STOPPED'
  | 'TIME_ENTRY_UPDATED'
  | 'TIME_ENTRY_DELETED'
  | 'TIME_ENTRY_SPLIT'
  | 'NEW_TIME_ENTRY'
  | 'TIME_ENTRY_RESTORED'
  | 'NEW_TAG'
  | 'USER_DELETED_FROM_WORKSPACE'
  | 'USER_JOINED_WORKSPACE'
  | 'USER_DEACTIVATED_ON_WORKSPACE'
  | 'USER_ACTIVATED_ON_WORKSPACE'
  | 'USER_EMAIL_CHANGED'
  | 'USER_UPDATED'
  | 'NEW_INVOICE'
  | 'INVOICE_UPDATED'
  | 'NEW_APPROVAL_REQUEST'
  | 'APPROVAL_REQUEST_STATUS_UPDATED'
  | 'TIME_OFF_REQUESTED'
  | 'TIME_OFF_REQUEST_UPDATED'
  | 'TIME_OFF_REQUEST_APPROVED'
  | 'TIME_OFF_REQUEST_REJECTED'
  | 'TIME_OFF_REQUEST_STARTED'
  | 'TIME_OFF_REQUEST_WITHDRAWN'
  | 'BALANCE_UPDATED'
  | 'TAG_UPDATED'
  | 'TAG_DELETED'
  | 'TASK_UPDATED'
  | 'CLIENT_UPDATED'
  | 'TASK_DELETED'
  | 'CLIENT_DELETED'
  | 'EXPENSE_RESTORED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_DELETED'
  | 'ASSIGNMENT_PUBLISHED'
  | 'ASSIGNMENT_UPDATED'
  | 'EXPENSE_CREATED'
  | 'EXPENSE_DELETED'
  | 'EXPENSE_UPDATED'
  | 'PROJECT_UPDATED'
  | 'PROJECT_DELETED'
  | 'USER_GROUP_CREATED'
  | 'USER_GROUP_UPDATED'
  | 'USER_GROUP_DELETED'
  | 'USERS_INVITED_TO_WORKSPACE'
  | 'LIMITED_USERS_ADDED_TO_WORKSPACE'
  | 'COST_RATE_UPDATED'
  | 'BILLABLE_RATE_UPDATED'
export type WebhooksDtoV1 = Partial<{
  webhooks: Array<WebhookDtoV1>
  workspaceWebhookCount: number
}>
export type WorkspaceDtoV1 = Partial<{
  cakeOrganizationId: string
  costRate: RateDtoV1
  currencies: Array<CurrencyWithDefaultInfoDtoV1>
  featureSubscriptionType: FeaturePlan
  features: Feature
  hourlyRate: HourlyRateDtoV1
  id: string
  imageUrl: string
  memberships: Array<MembershipDtoV1>
  name: string
  subdomain: WorkspaceSubdomainDtoV1
  workspaceSettings: WorkspaceSettingsDtoV1
}>
export type CurrencyWithDefaultInfoDtoV1 = Partial<{
  code: string
  id: string
  isDefault: boolean
}>
export type Feature =
  | 'ADD_TIME_FOR_OTHERS'
  | 'ADMIN_PANEL'
  | 'ALERTS'
  | 'APPROVAL'
  | 'AUDIT_LOG'
  | 'AUTOMATIC_LOCK'
  | 'BRANDED_REPORTS'
  | 'BULK_EDIT'
  | 'CUSTOM_FIELDS'
  | 'CUSTOM_REPORTING'
  | 'CUSTOM_SUBDOMAIN'
  | 'CREATION_PERMISSIONS'
  | 'DECIMAL_FORMAT'
  | 'DISABLE_MANUAL_MODE'
  | 'EDIT_MEMBER_PROFILE'
  | 'EXCLUDE_NON_BILLABLE_FROM_ESTIMATE'
  | 'EXPENSES'
  | 'FILE_IMPORT'
  | 'TIMESHEET_IMPORT'
  | 'USER_IMPORT'
  | 'HIDE_PAGES'
  | 'HISTORIC_RATES'
  | 'INVOICING'
  | 'INVOICE_EMAILS'
  | 'INVOICE_REMINDERS'
  | 'LABOR_COST'
  | 'LOCATIONS'
  | 'MANAGER_ROLE'
  | 'MULTI_FACTOR_AUTHENTICATION'
  | 'PROJECT_BUDGET'
  | 'PROJECT_TEMPLATES'
  | 'GRANT_PROJECT_MANAGER_ROLE'
  | 'PRIVATE_PROJECT_ACCESS'
  | 'QUICKBOOKS_INTEGRATION'
  | 'RECURRING_ESTIMATES'
  | 'RECURRING_INVOICES'
  | 'REQUIRED_FIELDS'
  | 'SCHEDULED_REPORTS'
  | 'SCHEDULING'
  | 'SCREENSHOTS'
  | 'SSO'
  | 'SUMMARY_ESTIMATE'
  | 'TARGETS_AND_REMINDERS'
  | 'TASK_RATES'
  | 'TIME_OFF'
  | 'UNLIMITED_REPORTS'
  | 'USER_CUSTOM_FIELDS'
  | 'WHO_CAN_CHANGE_TIMEENTRY_BILLABILITY'
  | 'BREAKS'
  | 'KIOSK_SESSION_DURATION'
  | 'KIOSK_PIN_REQUIRED'
  | 'WHO_CAN_SEE_ALL_TIME_ENTRIES'
  | 'WHO_CAN_SEE_PROJECT_STATUS'
  | 'WHO_CAN_SEE_PUBLIC_PROJECTS_ENTRIES'
  | 'WHO_CAN_SEE_TEAMS_DASHBOARD'
  | 'WORKSPACE_LOCK_TIMEENTRIES'
  | 'WORKSPACE_TIME_AUDIT'
  | 'WORKSPACE_TIME_ROUNDING'
  | 'KIOSK'
  | 'KIOSK_SIX_DIGIT_PIN'
  | 'KIOSK_QR_CODE'
  | 'LIMITED_USERS'
  | 'FORECASTING'
  | 'TIME_TRACKING'
  | 'ATTENDANCE_REPORT'
  | 'WEEKLY_OVERTIME_CALCULATION_PERIOD'
  | 'MONTHLY_OVERTIME_CALCULATION_PERIOD'
  | 'WORKSPACE_TRANSFER'
  | 'FAVORITE_ENTRIES'
  | 'SPLIT_TIME_ENTRY'
  | 'CLIENT_CURRENCY'
  | 'SCHEDULING_FORECASTING'
  | 'SCIM'
  | 'UNLIMITED_USER_SEATS'
  | 'BILLABLE_HOURS'
  | 'PROJECT_ESTIMATE'
  | 'CSV_EXPORT'
  | 'XLSX_EXPORT'
  | 'ONE_MONTH_RANGE_REPORTS'
  | 'ONE_YEAR_RANGE_REPORTS'
  | 'SHARED_REPORTS'
export type WorkspaceSubdomainDtoV1 = Partial<{
  enabled: boolean
  name: string
}>
export type WorkspaceSettingsDtoV1 = Partial<{
  activeBillableHours: boolean
  adminOnlyPages: 'PROJECT' | 'TEAM' | 'REPORTS'
  automaticLock: AutomaticLockDtoV1
  canSeeTimeSheet: boolean
  canSeeTracker: boolean
  currencyFormat: 'CURRENCY_SPACE_VALUE' | 'VALUE_SPACE_CURRENCY' | 'CURRENCY_VALUE' | 'VALUE_CURRENCY'
  defaultBillableProjects: boolean
  durationFormat: 'FULL' | 'COMPACT' | 'DECIMAL'
  entityCreationPermissions: EntityCreationPermissionsDtoV1
  forceDescription: boolean
  forceProjects: boolean
  forceTags: boolean
  forceTasks: boolean
  isProjectPublicByDefault: boolean
  lockTimeEntries: string
  lockTimeZone: string
  multiFactorEnabled: boolean
  numberFormat: 'COMMA_PERIOD' | 'PERIOD_COMMA' | 'QUOTATION_MARK_PERIOD' | 'SPACE_COMMA'
  onlyAdminsCanChangeBillableStatus: boolean
  onlyAdminsCreateProject: boolean
  onlyAdminsCreateTag: boolean
  onlyAdminsCreateTask: boolean
  onlyAdminsSeeAllTimeEntries: boolean
  onlyAdminsSeeBillableRates: boolean
  onlyAdminsSeeDashboard: boolean
  onlyAdminsSeePublicProjectsEntries: boolean
  projectFavorites: boolean
  projectGroupingLabel: string
  projectLabel: string
  projectPickerSpecialFilter: boolean
  round: RoundDto
  taskLabel: string
  timeRoundingInReports: boolean
  timeTrackingMode: 'DEFAULT' | 'STOPWATCH_ONLY'
  trackTimeDownToSecond: boolean
  workingDays: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'>
}>
export type AutomaticLockDtoV1 = Partial<{
  changeDay: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  dayOfMonth: number
  firstDay: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'
  olderThanPeriod: 'DAYS' | 'WEEKS' | 'MONTHS'
  olderThanValue: number
  type: 'WEEKLY' | 'MONTHLY' | 'OLDER_THAN'
}>
export type RoundDto = Partial<{
  minutes: string
  round: string
}>
export type AttendanceFilterV1 = Partial<{
  balanceFilters: Array<CompareBalanceFilter>
  breakFilters: Array<CompareBreakFilter>
  capacityFilters: Array<CompareCapacityFilter>
  endFilters: Array<CompareEndFilter>
  groups: Array<string>
  hasTimeOff: boolean
  overtimeFilters: Array<CompareOvertimeFilter>
  page: number
  pageSize: number
  sortColumn:
    | 'GROUP'
    | 'USER'
    | 'DATE'
    | 'START'
    | 'END'
    | 'BREAK'
    | 'WORK'
    | 'CAPACITY'
    | 'OVERTIME'
    | 'UNDERTIME'
    | 'BALANCE'
    | 'TIME_OFF'
  startFilters: Array<CompareStartFilter>
  undertimeFilters: Array<CompareUndertimeFilter>
  workFilters: Array<CompareWorkFilter>
}>
export type CompareBalanceFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareBreakFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareCapacityFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareEndFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareOvertimeFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareStartFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareUndertimeFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type CompareWorkFilter = Partial<{
  filtrationType: 'EXACTLY' | 'LARGER_THAN' | 'SMALLER_THAN'
  value: string
}>
export type AttendanceReportDtoV1 = Partial<{
  entities: Array<AttendanceDto>
}>
export type AttendanceDto = Partial<{
  break: number
  capacity: number
  date: string
  endTime: string
  hasRunningEntry: boolean
  imageUrl: string
  overtime: number
  remainingCapacity: number
  startTime: string
  timeOff: number
  totalDuration: number
  userId: string
  userName: string
}>
export type AttendanceReportFilterV1 = {
  amountShown?: ('EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT') | undefined
  amounts?: Array<'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'> | undefined
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  archived?: boolean | undefined
  attendanceFilter: AttendanceFilterV1
  billable?: boolean | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  customFields?: Array<CustomFieldFilterV1> | undefined
  dateFormat?: string | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  description?: string | undefined
  detailedFilter?: DetailedFilterV1 | undefined
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  rounding?: boolean | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  summaryFilter?: SummaryFilterV1 | undefined
  tags?: ContainsTagFilterV1 | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeFormat?: string | undefined
  timeZone?: string | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyFilter?: WeeklyFilterV1 | undefined
  withoutDescription?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type ContainsArchivedFilterV1 = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL'
}>
export type CustomFieldFilterV1 = Partial<{
  id: string
  isEmpty: boolean
  numberCondition: 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN'
  type: 'TXT' | 'NUMBER' | 'DROPDOWN_SINGLE' | 'DROPDOWN_MULTIPLE' | 'CHECKBOX' | 'LINK'
  value: {}
}>
export type DetailedFilterV1 = Partial<{
  auditFilter: AuditFilterV1
  options: DetailedOptionsV1
  page: number
  pageSize: number
  sortColumn: 'ID' | 'DESCRIPTION' | 'USER' | 'DURATION' | 'DATE' | 'ZONED_DATE' | 'NATURAL' | 'USER_DATE'
}>
export type AuditFilterV1 = Partial<{
  duration: number
  durationShorter: boolean
  withoutProject: boolean
  withoutTask: boolean
}>
export type DetailedOptionsV1 = Partial<{
  totals: 'CALCULATE' | 'EXCLUDE'
}>
export type SummaryFilterV1 = Partial<{
  groups: Array<string>
  sortColumn: 'GROUP' | 'DURATION' | 'AMOUNT' | 'EARNED' | 'COST' | 'PROFIT'
  summaryChartType: 'BILLABILITY' | 'PROJECT'
}>
export type ContainsTagFilterV1 = Partial<{
  containedInTimeentry: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL'
}>
export type ContainsTaskFilterV1 = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ACTIVE' | 'ARCHIVED' | 'ALL'
}>
export type ContainsUsersFilterV1 = Partial<{
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN' | 'CONTAINS_ONLY'
  ids: Array<string>
  status: 'ALL' | 'ACTIVE_WITH_PENDING' | 'ACTIVE' | 'PENDING' | 'INACTIVE'
}>
export type WeeklyFilterV1 = Partial<{
  group: string
  subgroup: string
}>
export type DetailedReportFilterV1 = {
  amountShown?: ('EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT') | undefined
  amounts?: Array<'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'> | undefined
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  archived?: boolean | undefined
  attendanceFilter?: AttendanceFilterV1 | undefined
  billable?: boolean | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  customFields?: Array<CustomFieldFilterV1> | undefined
  dateFormat?: string | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  description?: string | undefined
  detailedFilter: DetailedFilterV1
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  rounding?: boolean | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  summaryFilter?: SummaryFilterV1 | undefined
  tags?: ContainsTagFilterV1 | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeFormat?: string | undefined
  timeZone?: string | undefined
  userCustomFields?: Array<CustomFieldFilterV1> | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyFilter?: WeeklyFilterV1 | undefined
  withoutDescription?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type ExpenseDetailedReportDtoV1 = Partial<{
  expenses: Array<ExpenseReportDtoV1>
  totals: ExpenseTotalsDtoV1
}>
export type ExpenseReportDtoV1 = Partial<{
  amount: number
  approvalRequestId: string
  billable: boolean
  categoryHasUnitPrice: boolean
  categoryId: string
  categoryName: string
  categoryUnit: string
  date: string
  exportFields: Array<
    | 'PROJECT'
    | 'CLIENT'
    | 'TASK'
    | 'DESCRIPTION'
    | 'USER'
    | 'TAGS'
    | 'START_DATE'
    | 'START_TIME'
    | 'END_TIME'
    | 'DURATION'
    | 'BILLABLE_AMOUNT'
    | 'COST_AMOUNT'
    | 'PROFIT'
    | 'EMAIL'
    | 'BILLABLE'
    | 'BILLABLE_H'
    | 'NON_BILLABLE_H'
    | 'END_DATE'
    | 'DECIMAL_DURATION'
    | 'BILLABLE_RATE'
    | 'COST_RATE'
    | 'APPROVAL'
    | 'APPROVAL_SUBMISSION_DATE'
    | 'APPROVAL_SUBMISSION_TIME'
    | 'APPROVAL_DATE'
    | 'APPROVAL_TIME'
    | 'BAR_CHART'
    | 'PIE_CHART_1'
    | 'PIE_CHART_2'
    | 'PIE_CHART_3'
    | 'RTL'
    | 'TOTAL'
    | 'SUBGROUP'
    | 'GROUP'
    | 'DATE'
    | 'TIME'
    | 'CATEGORY'
    | 'NOTE'
    | 'AMOUNT'
    | 'INVOICED'
    | 'INVOICE_ID'
    | 'CATEGORY_NO_OF_UNITS'
    | 'CATEGORY_UNIT'
    | 'KIOSK'
    | 'KIOSK_QR_CODE'
    | 'TYPE'
    | 'BREAK'
    | 'NOTES'
    | 'BILLABLE_TOTAL'
    | 'RECEIPTS'
    | 'EXPENSE_TOTAL'
    | 'DATE_OF_CREATION'
    | 'DATE_OF_APPROVAL'
    | 'NAME'
    | 'ROLE'
    | 'PROJECTS'
    | 'STATUS'
    | 'WEEK_START'
    | 'WORKING_DAYS'
    | 'TEAM_MANAGERS'
    | 'TEAM_MEMBERS'
    | 'DAILY_WORK_CAPACITY'
    | 'VISIBILITY'
    | 'BILLABILITY'
    | 'TASKS'
    | 'TRACKED_H'
    | 'ESTIMATED_H'
    | 'REMAINING_H'
    | 'OVERAGE_H'
    | 'TRACKED_BUDGET'
    | 'ESTIMATED_BUDGET'
    | 'REMAINING_BUDGET'
    | 'OVERAGE_BUDGET'
    | 'PROGRESS'
    | 'RECURRING_ESTIMATE'
    | 'EXPENSES'
    | 'BILLABLE_EXPENSES'
    | 'NON_BILLABLE_EXPENSES'
    | 'ADDITIONAL_FIELDS'
    | 'PROJECT_MEMBERS'
    | 'PROJECT_MANAGER'
    | 'APPROVED_BY'
    | 'ISSUE_DATE'
    | 'DUE_ON'
    | 'BALANCE'
  >
  fileId: string
  fileName: string
  id: string
  invoicingInfo: invoicingInfo
  locked: boolean
  notes: string
  projectColor: string
  projectId: string
  projectName: string
  quantity: number
  reportName: string
  time: string
  userEmail: string
  userId: string
  userName: string
  userStatus: string
  workspaceId: string
}>
export type invoicingInfo = Partial<{
  invoiceId: string
  manuallyInvoiced: boolean
}>
export type ExpenseTotalsDtoV1 = Partial<{
  expensesCount: number
  totalAmount: number
  totalAmountBillable: number
}>
export type ExpenseReportFilterV1 = {
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  billable?: boolean | undefined
  categories?: ContainsArchivedFilterV1 | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  note?: string | undefined
  page?: number | undefined
  pageSize?: number | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  sortColumn?: ('ID' | 'PROJECT' | 'USER' | 'CATEGORY' | 'DATE' | 'AMOUNT') | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeZone?: string | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  withoutNote?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type GroupOneDto = Partial<{
  amount: number
  children: Array<GroupOneDto>
  clientName: string
  days: Array<DailyTotalDto>
  duration: number
  id: string
  name: string
  nameLowerCase: string
}>
export type DailyTotalDto = Partial<{
  amount: number
  date: string
  duration: number
}>
export type ReportFilterV1 = {
  amountShown?: ('EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT') | undefined
  amounts?: Array<'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'> | undefined
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  archived?: boolean | undefined
  attendanceFilter?: AttendanceFilterV1 | undefined
  billable?: boolean | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  customFields?: Array<CustomFieldFilterV1> | undefined
  dateFormat?: string | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  description?: string | undefined
  detailedFilter?: DetailedFilterV1 | undefined
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  rounding?: boolean | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  summaryFilter?: SummaryFilterV1 | undefined
  tags?: ContainsTagFilterV1 | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeFormat?: string | undefined
  timeZone?: string | undefined
  userCustomFields?: Array<CustomFieldFilterV1> | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyFilter?: WeeklyFilterV1 | undefined
  withoutDescription?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type SharedReportDtoV1 = Partial<{
  fixedDate: boolean
  id: string
  isPublic: boolean
  link: string
  name: string
  reportAuthor: string
  type:
    | 'DETAILED'
    | 'WEEKLY'
    | 'SUMMARY'
    | 'SCHEDULED'
    | 'EXPENSE_DETAILED'
    | 'EXPENSE_RECEIPT'
    | 'PTO_REQUESTS'
    | 'PTO_BALANCE'
    | 'ATTENDANCE'
    | 'INVOICE_EXPENSE'
    | 'INVOICE_TIME'
    | 'PROJECT'
    | 'TEAM_FULL'
    | 'TEAM_LIMITED'
    | 'TEAM_GROUPS'
    | 'INVOICES'
    | 'KIOSK_PIN_LIST'
    | 'KIOSK_ASSIGNEES'
    | 'USER_DATA_EXPORT'
  visibleToUserGroups: Array<EntityName>
  visibleToUsers: Array<EntityName>
}>
export type EntityName = Partial<{
  id: string
  name: string
}>
export type SharedReportRequestV1 = Partial<{
  filter: ReportFilterV1
  fixedDate: boolean
  isPublic: boolean
  name: string
  type:
    | 'DETAILED'
    | 'WEEKLY'
    | 'SUMMARY'
    | 'SCHEDULED'
    | 'EXPENSE_DETAILED'
    | 'EXPENSE_RECEIPT'
    | 'PTO_REQUESTS'
    | 'PTO_BALANCE'
    | 'ATTENDANCE'
    | 'INVOICE_EXPENSE'
    | 'INVOICE_TIME'
    | 'PROJECT'
    | 'TEAM_FULL'
    | 'TEAM_LIMITED'
    | 'TEAM_GROUPS'
    | 'INVOICES'
    | 'KIOSK_PIN_LIST'
    | 'KIOSK_ASSIGNEES'
    | 'USER_DATA_EXPORT'
  visibleToUserGroups: Array<string>
  visibleToUsers: Array<string>
}>
export type SharedReportV1 = Partial<{
  filter: ReportFilterV1
  fixedDate: boolean
  id: string
  isPublic: boolean
  name: string
  type:
    | 'DETAILED'
    | 'WEEKLY'
    | 'SUMMARY'
    | 'SCHEDULED'
    | 'EXPENSE_DETAILED'
    | 'EXPENSE_RECEIPT'
    | 'PTO_REQUESTS'
    | 'PTO_BALANCE'
    | 'ATTENDANCE'
    | 'INVOICE_EXPENSE'
    | 'INVOICE_TIME'
    | 'PROJECT'
    | 'TEAM_FULL'
    | 'TEAM_LIMITED'
    | 'TEAM_GROUPS'
    | 'INVOICES'
    | 'KIOSK_PIN_LIST'
    | 'KIOSK_ASSIGNEES'
    | 'USER_DATA_EXPORT'
  userId: string
  visibleToUserGroups: Array<string>
  visibleToUsers: Array<string>
  workspaceId: string
}>
export type SharedReportsAndCountDtoV1 = Partial<{
  count: number
  reports: Array<SharedReportDtoV1>
}>
export type SummaryReportFilterV1 = {
  amountShown?: ('EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT') | undefined
  amounts?: Array<'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'> | undefined
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  archived?: boolean | undefined
  attendanceFilter?: AttendanceFilterV1 | undefined
  billable?: boolean | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  customFields?: Array<CustomFieldFilterV1> | undefined
  dateFormat?: string | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  description?: string | undefined
  detailedFilter?: DetailedFilterV1 | undefined
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  rounding?: boolean | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  summaryFilter: SummaryFilterV1
  tags?: ContainsTagFilterV1 | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeFormat?: string | undefined
  timeZone?: string | undefined
  userCustomFields?: Array<CustomFieldFilterV1> | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyFilter?: WeeklyFilterV1 | undefined
  withoutDescription?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type TimeEntryDetailedReportDto = Partial<{
  timeEntries: Array<TimeEntryDto>
  totals: Array<TimeEntryReportTotals>
}>
export type TimeEntryDto = Partial<{
  approvalRequestId: string
  billable: boolean
  clientId: string
  clientName: string
  description: string
  get_id: string
  locked: boolean
  projectColor: string
  projectId: string
  projectName: string
  tags: Array<ReportTagDto>
  taskId: string
  taskName: string
  timeInterval: ReportTimeIntervalDto
  userEmail: string
  userId: string
  userName: string
}>
export type ReportTagDto = Partial<{
  id: string
  name: string
}>
export type ReportTimeIntervalDto = Partial<{
  duration: number
  end: string
  start: string
}>
export type TimeEntryReportTotals = Partial<{
  amounts: Array<AmountDto>
  entriesCount: number
  id: string
  totalBillableTime: number
  totalTime: number
}>
export type AmountDto = Partial<{
  type: 'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'
  value: number
}>
export type TimeEntrySummaryReportDto = Partial<{
  chart: Array<SummaryReportChartDto>
  groupOne: Array<GroupOneDto>
  totals: Array<TimeEntryReportTotals>
}>
export type SummaryReportChartDto = Partial<{
  earned: number
  id: string
  totalAmount: number
  totalBillableTime: number
  totalTime: number
}>
export type TimeEntryWeeklyReportDto = Partial<{
  decimalFormat: boolean
  groupOne: Array<GroupOneDto>
  includeUsersWithoutTime: boolean
  totals: Array<TimeEntryReportTotals>
  totalsByDay: Array<DailyTotalDto>
  trackTimeDownToSeconds: boolean
  usersWithoutTime: Array<UserDto>
}>
export type UserDto = Partial<{
  dateFormat: string
  email: string
  id: string
  name: string
  timeFormat: string
  timeZone: string
  weekStart: string
}>
export type WeeklyReportFilterV1 = {
  amountShown?: ('EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT') | undefined
  amounts?: Array<'EARNED' | 'COST' | 'PROFIT' | 'HIDE_AMOUNT' | 'EXPORT'> | undefined
  approvalState?: ('APPROVED' | 'UNAPPROVED' | 'ALL') | undefined
  archived?: boolean | undefined
  attendanceFilter?: AttendanceFilterV1 | undefined
  billable?: boolean | undefined
  clients?: ContainsArchivedFilterV1 | undefined
  currency?: ContainsArchivedFilterV1 | undefined
  customFields?: Array<CustomFieldFilterV1> | undefined
  dateFormat?: string | undefined
  dateRangeEnd: string
  dateRangeStart: string
  dateRangeType?:
    | (
        | 'ABSOLUTE'
        | 'TODAY'
        | 'YESTERDAY'
        | 'THIS_WEEK'
        | 'LAST_WEEK'
        | 'PAST_TWO_WEEKS'
        | 'THIS_MONTH'
        | 'LAST_MONTH'
        | 'THIS_YEAR'
        | 'LAST_YEAR'
      )
    | undefined
  description?: string | undefined
  detailedFilter?: DetailedFilterV1 | undefined
  exportType?: ('JSON' | 'JSON_V1' | 'PDF' | 'CSV' | 'XLSX' | 'ZIP') | undefined
  invoicingState?: ('INVOICED' | 'UNINVOICED' | 'ALL') | undefined
  projects?: ContainsArchivedFilterV1 | undefined
  rounding?: boolean | undefined
  sortOrder?: ('ASCENDING' | 'DESCENDING') | undefined
  summaryFilter?: SummaryFilterV1 | undefined
  tags?: ContainsTagFilterV1 | undefined
  tasks?: ContainsTaskFilterV1 | undefined
  timeFormat?: string | undefined
  timeZone?: string | undefined
  userCustomFields?: Array<CustomFieldFilterV1> | undefined
  userGroups?: ContainsUsersFilterV1 | undefined
  userLocale?: string | undefined
  users?: ContainsUsersFilterV1 | undefined
  weekStart?: ('MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY') | undefined
  weeklyFilter: WeeklyFilterV1
  withoutDescription?: boolean | undefined
  zoomLevel?: ('WEEK' | 'MONTH' | 'YEAR') | undefined
}
export type AuditLogGetRequestV1 = {
  actions: Array<
    | 'CREATE_TIME_PERSONAL_TIMER'
    | 'CREATE_TIME_PERSONAL_MANUAL'
    | 'CREATE_TIME_IMPORT'
    | 'CREATE_TIME_KIOSK'
    | 'CREATE_TIME_FOR_OTHER'
    | 'RESTORE_TIME'
    | 'RESTORE_TIME_FOR_OTHER'
    | 'UPDATE_TIME_PERSONAL'
    | 'UPDATE_TIME_FOR_OTHER'
    | 'DELETE_TIME_PERSONAL'
    | 'DELETE_TIME_FOR_OTHER'
    | 'CREATE_PROJECT'
    | 'CREATE_PROJECT_IMPORT'
    | 'CREATE_PROJECT_QUICKBOOKS'
    | 'UPDATE_PROJECT'
    | 'DELETE_PROJECT'
    | 'CREATE_TASK'
    | 'CREATE_TASK_IMPORT'
    | 'UPDATE_TASK'
    | 'DELETE_TASK'
    | 'CREATE_CLIENT'
    | 'CREATE_CLIENT_IMPORT'
    | 'CREATE_CLIENT_QUICKBOOKS'
    | 'UPDATE_CLIENT'
    | 'DELETE_CLIENT'
    | 'CREATE_TAG'
    | 'CREATE_TAG_IMPORT'
    | 'UPDATE_TAG'
    | 'DELETE_TAG'
    | 'CREATE_EXPENSE'
    | 'CREATE_EXPENSE_FOR_OTHER'
    | 'RESTORE_EXPENSE'
    | 'RESTORE_EXPENSE_FOR_OTHER'
    | 'UPDATE_EXPENSE'
    | 'UPDATE_EXPENSE_FOR_OTHER'
    | 'DELETE_EXPENSE'
    | 'DELETE_EXPENSE_FOR_OTHER'
  >
  authors: authors
  end: string
  page?: number | undefined
  'page-size'?: number | undefined
  start: string
}
export type authors = {
  authorIds: Array<string>
  contains: 'CONTAINS' | 'DOES_NOT_CONTAIN'
}
export type PageableV1ListAuditLogDtoV1 = Partial<{
  response: Array<AuditLogDtoV1>
}>
export type AuditLogDtoV1 = Partial<{
  action:
    | 'CREATE_TIME_PERSONAL_TIMER'
    | 'CREATE_TIME_PERSONAL_MANUAL'
    | 'CREATE_TIME_IMPORT'
    | 'CREATE_TIME_KIOSK'
    | 'CREATE_TIME_FOR_OTHER'
    | 'RESTORE_TIME'
    | 'RESTORE_TIME_FOR_OTHER'
    | 'UPDATE_TIME_PERSONAL'
    | 'UPDATE_TIME_FOR_OTHER'
    | 'DELETE_TIME_PERSONAL'
    | 'DELETE_TIME_FOR_OTHER'
    | 'CREATE_PROJECT'
    | 'CREATE_PROJECT_IMPORT'
    | 'CREATE_PROJECT_QUICKBOOKS'
    | 'UPDATE_PROJECT'
    | 'DELETE_PROJECT'
    | 'CREATE_TASK'
    | 'CREATE_TASK_IMPORT'
    | 'UPDATE_TASK'
    | 'DELETE_TASK'
    | 'CREATE_CLIENT'
    | 'CREATE_CLIENT_IMPORT'
    | 'CREATE_CLIENT_QUICKBOOKS'
    | 'UPDATE_CLIENT'
    | 'DELETE_CLIENT'
    | 'CREATE_TAG'
    | 'CREATE_TAG_IMPORT'
    | 'UPDATE_TAG'
    | 'DELETE_TAG'
    | 'CREATE_EXPENSE'
    | 'CREATE_EXPENSE_FOR_OTHER'
    | 'RESTORE_EXPENSE'
    | 'RESTORE_EXPENSE_FOR_OTHER'
    | 'UPDATE_EXPENSE'
    | 'UPDATE_EXPENSE_FOR_OTHER'
    | 'DELETE_EXPENSE'
    | 'DELETE_EXPENSE_FOR_OTHER'
  content: string
  previousContent: string
  timestamp: string
  userEmail: string
  userId: string
  userName: string
  workspaceId: string
}>

const UploadFileResponseV1 = z.object({ name: z.string(), url: z.string() }).partial().passthrough()
const CustomFieldType: z.ZodType<CustomFieldType> = z.enum([
  'TXT',
  'NUMBER',
  'DROPDOWN_SINGLE',
  'DROPDOWN_MULTIPLE',
  'CHECKBOX',
  'LINK',
])
const UserCustomFieldValueDtoV1: z.ZodType<UserCustomFieldValueDtoV1> = z
  .object({
    customFieldId: z.string(),
    customFieldName: z.string(),
    customFieldType: CustomFieldType,
    userId: z.string(),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const RateDtoV1: z.ZodType<RateDtoV1> = z
  .object({ amount: z.number().int(), currency: z.string() })
  .partial()
  .passthrough()
const HourlyRateDtoV1: z.ZodType<HourlyRateDtoV1> = z
  .object({ amount: z.number().int(), currency: z.string() })
  .partial()
  .passthrough()
const MembershipDtoV1: z.ZodType<MembershipDtoV1> = z
  .object({
    costRate: RateDtoV1,
    hourlyRate: HourlyRateDtoV1,
    membershipStatus: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
    membershipType: z.enum(['WORKSPACE', 'PROJECT', 'USERGROUP']),
    targetId: z.string(),
    userId: z.string(),
  })
  .partial()
  .passthrough()
const SummaryReportSettingsDtoV1: z.ZodType<SummaryReportSettingsDtoV1> = z
  .object({ group: z.string().min(1), subgroup: z.string().min(1) })
  .passthrough()
const UserSettingsDtoV1: z.ZodType<UserSettingsDtoV1> = z
  .object({
    alerts: z.boolean().optional().default(false),
    approval: z.boolean().optional().default(false),
    collapseAllProjectLists: z.boolean().optional().default(false),
    dashboardPinToTop: z.boolean().optional().default(false),
    dashboardSelection: z.enum(['ME', 'TEAM']).optional(),
    dashboardViewType: z.enum(['PROJECT', 'BILLABILITY']).optional(),
    dateFormat: z.string().min(1),
    groupSimilarEntriesDisabled: z.boolean().optional().default(false),
    invoiceReminders: z.boolean().optional().default(false),
    isCompactViewOn: z.boolean().optional().default(false),
    lang: z.string().optional(),
    longRunning: z.boolean().optional().default(false),
    multiFactorEnabled: z.boolean().optional().default(false),
    myStartOfDay: z.string().optional(),
    onboarding: z.boolean().optional().default(false),
    projectListCollapse: z.number().int().optional(),
    projectPickerTaskFilter: z.boolean().optional().default(false),
    pto: z.boolean().optional().default(false),
    reminders: z.boolean().optional().default(false),
    scheduledReports: z.boolean().optional().default(false),
    scheduling: z.boolean().optional().default(false),
    sendNewsletter: z.boolean().optional().default(false),
    showOnlyWorkingDays: z.boolean().optional().default(false),
    summaryReportSettings: SummaryReportSettingsDtoV1.optional(),
    theme: z.enum(['DARK', 'DEFAULT']).optional(),
    timeFormat: z.enum(['HOUR12', 'HOUR24']),
    timeTrackingManual: z.boolean().optional().default(false),
    timeZone: z.string().min(1),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyUpdates: z.boolean().optional().default(false),
  })
  .passthrough()
const AccountStatus: z.ZodType<AccountStatus> = z.enum([
  'ACTIVE',
  'PENDING_EMAIL_VERIFICATION',
  'DELETED',
  'NOT_REGISTERED',
  'LIMITED',
  'LIMITED_DELETED',
])
const UserDtoV1: z.ZodType<UserDtoV1> = z
  .object({
    activeWorkspace: z.string(),
    customFields: z.array(UserCustomFieldValueDtoV1),
    defaultWorkspace: z.string(),
    email: z.string(),
    id: z.string(),
    memberships: z.array(MembershipDtoV1),
    name: z.string(),
    profilePicture: z.string(),
    settings: UserSettingsDtoV1,
    status: AccountStatus,
  })
  .partial()
  .passthrough()
const CurrencyWithDefaultInfoDtoV1: z.ZodType<CurrencyWithDefaultInfoDtoV1> = z
  .object({
    code: z.string(),
    id: z.string(),
    isDefault: z.boolean().default(false),
  })
  .partial()
  .passthrough()
const FeaturePlan: z.ZodType<FeaturePlan> = z.lazy(() => FeaturePlan)
const Feature: z.ZodType<Feature> = z.enum([
  'ADD_TIME_FOR_OTHERS',
  'ADMIN_PANEL',
  'ALERTS',
  'APPROVAL',
  'AUDIT_LOG',
  'AUTOMATIC_LOCK',
  'BRANDED_REPORTS',
  'BULK_EDIT',
  'CUSTOM_FIELDS',
  'CUSTOM_REPORTING',
  'CUSTOM_SUBDOMAIN',
  'CREATION_PERMISSIONS',
  'DECIMAL_FORMAT',
  'DISABLE_MANUAL_MODE',
  'EDIT_MEMBER_PROFILE',
  'EXCLUDE_NON_BILLABLE_FROM_ESTIMATE',
  'EXPENSES',
  'FILE_IMPORT',
  'TIMESHEET_IMPORT',
  'USER_IMPORT',
  'HIDE_PAGES',
  'HISTORIC_RATES',
  'INVOICING',
  'INVOICE_EMAILS',
  'INVOICE_REMINDERS',
  'LABOR_COST',
  'LOCATIONS',
  'MANAGER_ROLE',
  'MULTI_FACTOR_AUTHENTICATION',
  'PROJECT_BUDGET',
  'PROJECT_TEMPLATES',
  'GRANT_PROJECT_MANAGER_ROLE',
  'PRIVATE_PROJECT_ACCESS',
  'QUICKBOOKS_INTEGRATION',
  'RECURRING_ESTIMATES',
  'RECURRING_INVOICES',
  'REQUIRED_FIELDS',
  'SCHEDULED_REPORTS',
  'SCHEDULING',
  'SCREENSHOTS',
  'SSO',
  'SUMMARY_ESTIMATE',
  'TARGETS_AND_REMINDERS',
  'TASK_RATES',
  'TIME_OFF',
  'UNLIMITED_REPORTS',
  'USER_CUSTOM_FIELDS',
  'WHO_CAN_CHANGE_TIMEENTRY_BILLABILITY',
  'BREAKS',
  'KIOSK_SESSION_DURATION',
  'KIOSK_PIN_REQUIRED',
  'WHO_CAN_SEE_ALL_TIME_ENTRIES',
  'WHO_CAN_SEE_PROJECT_STATUS',
  'WHO_CAN_SEE_PUBLIC_PROJECTS_ENTRIES',
  'WHO_CAN_SEE_TEAMS_DASHBOARD',
  'WORKSPACE_LOCK_TIMEENTRIES',
  'WORKSPACE_TIME_AUDIT',
  'WORKSPACE_TIME_ROUNDING',
  'KIOSK',
  'KIOSK_SIX_DIGIT_PIN',
  'KIOSK_QR_CODE',
  'LIMITED_USERS',
  'FORECASTING',
  'TIME_TRACKING',
  'ATTENDANCE_REPORT',
  'WEEKLY_OVERTIME_CALCULATION_PERIOD',
  'MONTHLY_OVERTIME_CALCULATION_PERIOD',
  'WORKSPACE_TRANSFER',
  'FAVORITE_ENTRIES',
  'SPLIT_TIME_ENTRY',
  'CLIENT_CURRENCY',
  'SCHEDULING_FORECASTING',
  'SCIM',
  'UNLIMITED_USER_SEATS',
  'BILLABLE_HOURS',
  'PROJECT_ESTIMATE',
  'CSV_EXPORT',
  'XLSX_EXPORT',
  'ONE_MONTH_RANGE_REPORTS',
  'ONE_YEAR_RANGE_REPORTS',
  'SHARED_REPORTS',
])
const WorkspaceSubdomainDtoV1: z.ZodType<WorkspaceSubdomainDtoV1> = z
  .object({ enabled: z.boolean().default(false), name: z.string() })
  .partial()
  .passthrough()
const AutomaticLockDtoV1: z.ZodType<AutomaticLockDtoV1> = z
  .object({
    changeDay: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    dayOfMonth: z.number().int(),
    firstDay: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    olderThanPeriod: z.enum(['DAYS', 'WEEKS', 'MONTHS']),
    olderThanValue: z.number().int(),
    type: z.enum(['WEEKLY', 'MONTHLY', 'OLDER_THAN']),
  })
  .partial()
  .passthrough()
const EntityCreationPermission: z.ZodType<EntityCreationPermission> = z.enum([
  'ADMINS',
  'ADMINS_AND_PROJECT_MANAGERS',
  'EVERYONE',
])
const EntityCreationPermissionsDtoV1: z.ZodType<EntityCreationPermissionsDtoV1> = z
  .object({
    whoCanCreateProjectsAndClients: EntityCreationPermission,
    whoCanCreateTags: EntityCreationPermission,
    whoCanCreateTasks: EntityCreationPermission,
  })
  .partial()
  .passthrough()
const RoundDto: z.ZodType<RoundDto> = z.object({ minutes: z.string(), round: z.string() }).partial().passthrough()
const WorkspaceSettingsDtoV1: z.ZodType<WorkspaceSettingsDtoV1> = z
  .object({
    activeBillableHours: z.boolean().default(false),
    adminOnlyPages: z.enum(['PROJECT', 'TEAM', 'REPORTS']),
    automaticLock: AutomaticLockDtoV1,
    canSeeTimeSheet: z.boolean().default(false),
    canSeeTracker: z.boolean().default(false),
    currencyFormat: z.enum(['CURRENCY_SPACE_VALUE', 'VALUE_SPACE_CURRENCY', 'CURRENCY_VALUE', 'VALUE_CURRENCY']),
    defaultBillableProjects: z.boolean().default(false),
    durationFormat: z.enum(['FULL', 'COMPACT', 'DECIMAL']),
    entityCreationPermissions: EntityCreationPermissionsDtoV1,
    forceDescription: z.boolean().default(false),
    forceProjects: z.boolean().default(false),
    forceTags: z.boolean().default(false),
    forceTasks: z.boolean().default(false),
    isProjectPublicByDefault: z.boolean(),
    lockTimeEntries: z.string(),
    lockTimeZone: z.string(),
    multiFactorEnabled: z.boolean().default(false),
    numberFormat: z.enum(['COMMA_PERIOD', 'PERIOD_COMMA', 'QUOTATION_MARK_PERIOD', 'SPACE_COMMA']),
    onlyAdminsCanChangeBillableStatus: z.boolean().default(false),
    onlyAdminsCreateProject: z.boolean().default(false),
    onlyAdminsCreateTag: z.boolean().default(false),
    onlyAdminsCreateTask: z.boolean().default(false),
    onlyAdminsSeeAllTimeEntries: z.boolean().default(false),
    onlyAdminsSeeBillableRates: z.boolean().default(false),
    onlyAdminsSeeDashboard: z.boolean().default(false),
    onlyAdminsSeePublicProjectsEntries: z.boolean().default(false),
    projectFavorites: z.boolean().default(false),
    projectGroupingLabel: z.string(),
    projectLabel: z.string(),
    projectPickerSpecialFilter: z.boolean().default(false),
    round: RoundDto,
    taskLabel: z.string(),
    timeRoundingInReports: z.boolean().default(false),
    timeTrackingMode: z.enum(['DEFAULT', 'STOPWATCH_ONLY']),
    trackTimeDownToSecond: z.boolean().default(false),
    workingDays: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])),
  })
  .partial()
  .passthrough()
const WorkspaceDtoV1: z.ZodType<WorkspaceDtoV1> = z
  .object({
    cakeOrganizationId: z.string(),
    costRate: RateDtoV1,
    currencies: z.array(CurrencyWithDefaultInfoDtoV1),
    featureSubscriptionType: FeaturePlan,
    features: Feature,
    hourlyRate: HourlyRateDtoV1,
    id: z.string(),
    imageUrl: z.string(),
    memberships: z.array(MembershipDtoV1),
    name: z.string(),
    subdomain: WorkspaceSubdomainDtoV1,
    workspaceSettings: WorkspaceSettingsDtoV1,
  })
  .partial()
  .passthrough()
const CreateWorkspaceRequestV1 = z
  .object({ name: z.string().min(1).max(50), organizationId: z.string() })
  .partial()
  .passthrough()
const WebhookEventTriggerSourceType: z.ZodType<WebhookEventTriggerSourceType> = z.enum([
  'PROJECT_ID',
  'USER_ID',
  'TAG_ID',
  'TASK_ID',
  'WORKSPACE_ID',
  'ASSIGNMENT_ID',
  'EXPENSE_ID',
])
const WebhookEventType: z.ZodType<WebhookEventType> = z.enum([
  'NEW_PROJECT',
  'NEW_TASK',
  'NEW_CLIENT',
  'NEW_TIMER_STARTED',
  'TIMER_STOPPED',
  'TIME_ENTRY_UPDATED',
  'TIME_ENTRY_DELETED',
  'TIME_ENTRY_SPLIT',
  'NEW_TIME_ENTRY',
  'TIME_ENTRY_RESTORED',
  'NEW_TAG',
  'USER_DELETED_FROM_WORKSPACE',
  'USER_JOINED_WORKSPACE',
  'USER_DEACTIVATED_ON_WORKSPACE',
  'USER_ACTIVATED_ON_WORKSPACE',
  'USER_EMAIL_CHANGED',
  'USER_UPDATED',
  'NEW_INVOICE',
  'INVOICE_UPDATED',
  'NEW_APPROVAL_REQUEST',
  'APPROVAL_REQUEST_STATUS_UPDATED',
  'TIME_OFF_REQUESTED',
  'TIME_OFF_REQUEST_UPDATED',
  'TIME_OFF_REQUEST_APPROVED',
  'TIME_OFF_REQUEST_REJECTED',
  'TIME_OFF_REQUEST_STARTED',
  'TIME_OFF_REQUEST_WITHDRAWN',
  'BALANCE_UPDATED',
  'TAG_UPDATED',
  'TAG_DELETED',
  'TASK_UPDATED',
  'CLIENT_UPDATED',
  'TASK_DELETED',
  'CLIENT_DELETED',
  'EXPENSE_RESTORED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_DELETED',
  'ASSIGNMENT_PUBLISHED',
  'ASSIGNMENT_UPDATED',
  'EXPENSE_CREATED',
  'EXPENSE_DELETED',
  'EXPENSE_UPDATED',
  'PROJECT_UPDATED',
  'PROJECT_DELETED',
  'USER_GROUP_CREATED',
  'USER_GROUP_UPDATED',
  'USER_GROUP_DELETED',
  'USERS_INVITED_TO_WORKSPACE',
  'LIMITED_USERS_ADDED_TO_WORKSPACE',
  'COST_RATE_UPDATED',
  'BILLABLE_RATE_UPDATED',
])
const WebhookDtoV1: z.ZodType<WebhookDtoV1> = z
  .object({
    authToken: z.string(),
    deliveryEnabled: z.boolean().default(false),
    enabled: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    planEnabled: z.boolean().default(false),
    triggerSource: z.array(z.string()),
    triggerSourceType: WebhookEventTriggerSourceType,
    url: z.string(),
    userId: z.string(),
    webhookEvent: WebhookEventType,
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const WebhooksDtoV1: z.ZodType<WebhooksDtoV1> = z
  .object({
    webhooks: z.array(WebhookDtoV1),
    workspaceWebhookCount: z.number().int(),
  })
  .partial()
  .passthrough()
const ApprovalRequestCreatorDtoV1: z.ZodType<ApprovalRequestCreatorDtoV1> = z
  .object({ userEmail: z.string(), userId: z.string(), userName: z.string() })
  .partial()
  .passthrough()
const DateRangeDto: z.ZodType<DateRangeDto> = z
  .object({
    end: z.string().datetime({ offset: true }),
    start: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const ApprovalRequestOwnerDtoV1: z.ZodType<ApprovalRequestOwnerDtoV1> = z
  .object({
    startOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    timeZone: z.string(),
    userId: z.string(),
    userName: z.string(),
  })
  .partial()
  .passthrough()
const ApprovalRequestStatusDtoV1: z.ZodType<ApprovalRequestStatusDtoV1> = z
  .object({
    note: z.string(),
    state: z.enum(['PENDING', 'APPROVED', 'WITHDRAWN_SUBMISSION', 'WITHDRAWN_APPROVAL', 'REJECTED']),
    updatedAt: z.string().datetime({ offset: true }),
    updatedBy: z.string(),
    updatedByUserName: z.string(),
  })
  .partial()
  .passthrough()
const ApprovalRequestDtoV1: z.ZodType<ApprovalRequestDtoV1> = z
  .object({
    creator: ApprovalRequestCreatorDtoV1,
    dateRange: DateRangeDto,
    id: z.string(),
    owner: ApprovalRequestOwnerDtoV1,
    status: ApprovalRequestStatusDtoV1,
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const RateDto: z.ZodType<RateDto> = z.object({ amount: z.number().int(), currency: z.string() }).partial().passthrough()
const CustomFieldValueDto: z.ZodType<CustomFieldValueDto> = z
  .object({
    customFieldId: z.string(),
    sourceType: z.enum(['WORKSPACE', 'PROJECT', 'TIMEENTRY']),
    timeEntryId: z.string(),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const ProjectInfoDto: z.ZodType<ProjectInfoDto> = z
  .object({
    clientId: z.string(),
    clientName: z.string(),
    color: z.string(),
    id: z.string(),
    name: z.string(),
  })
  .partial()
  .passthrough()
const TagDto: z.ZodType<TagDto> = z
  .object({
    archived: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const TaskInfoDto: z.ZodType<TaskInfoDto> = z.object({ id: z.string(), name: z.string() }).partial().passthrough()
const TimeIntervalDto: z.ZodType<TimeIntervalDto> = z
  .object({
    duration: z.string(),
    end: z.string().datetime({ offset: true }),
    offsetEnd: z.number().int(),
    offsetStart: z.number().int(),
    start: z.string().datetime({ offset: true }),
    timeZone: z.string(),
    zonedEnd: z.string().datetime({ offset: true }),
    zonedStart: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const TimeEntryInfoDto: z.ZodType<TimeEntryInfoDto> = z
  .object({
    approvalRequestId: z.string(),
    billable: z.boolean().default(false),
    costRate: RateDto,
    customFieldValues: z.array(CustomFieldValueDto),
    description: z.string(),
    hourlyRate: RateDto,
    id: z.string(),
    isLocked: z.boolean().default(false),
    project: ProjectInfoDto,
    tags: z.array(TagDto),
    task: TaskInfoDto,
    timeInterval: TimeIntervalDto,
    type: z.enum(['REGULAR', 'BREAK', 'HOLIDAY', 'TIME_OFF']),
  })
  .partial()
  .passthrough()
const ExpenseCategoryDto: z.ZodType<ExpenseCategoryDto> = z
  .object({
    archived: z.boolean().default(false),
    hasUnitPrice: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    priceInCents: z.number().int(),
    unit: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ExpenseHydratedDto: z.ZodType<ExpenseHydratedDto> = z
  .object({
    approvalRequestId: z.string(),
    approvalStatus: z.enum([
      'PENDING',
      'APPROVED',
      'UNSUBMITTED',
      'REJECTED',
      'WITHDRAWN_APPROVAL',
      'WITHDRAWN_SUBMISSION',
    ]),
    billable: z.boolean().default(false),
    category: ExpenseCategoryDto,
    currency: z.string(),
    date: z.string(),
    detailedApprovalStatus: z.enum([
      'PENDING',
      'APPROVED',
      'UNSUBMITTED',
      'REJECTED',
      'WITHDRAWN_APPROVAL',
      'WITHDRAWN_SUBMISSION',
    ]),
    fileId: z.string(),
    fileName: z.string(),
    fileUrl: z.string(),
    id: z.string(),
    isLocked: z.boolean(),
    locked: z.boolean(),
    notes: z.string(),
    project: ProjectInfoDto,
    quantity: z.number(),
    task: TaskInfoDto,
    total: z.number(),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ApprovalDetailsDtoV1: z.ZodType<ApprovalDetailsDtoV1> = z
  .object({
    approvalRequest: ApprovalRequestDtoV1,
    approvedTime: z.string(),
    billableAmount: z.number(),
    billableTime: z.string(),
    breakTime: z.string(),
    costAmount: z.number(),
    entries: z.array(TimeEntryInfoDto),
    expenseTotal: z.number(),
    expenses: z.array(ExpenseHydratedDto),
    pendingTime: z.string(),
    trackedTime: z.string(),
  })
  .partial()
  .passthrough()
const CreateApprovalRequest = z
  .object({
    period: z.enum(['WEEKLY', 'SEMI_MONTHLY', 'MONTHLY']).optional(),
    periodStart: z.string().min(1),
  })
  .passthrough()
const UpdateApprovalRequest = z
  .object({
    note: z.string().optional(),
    state: z.enum(['PENDING', 'APPROVED', 'WITHDRAWN_SUBMISSION', 'WITHDRAWN_APPROVAL', 'REJECTED']),
  })
  .passthrough()
const ClientWithCurrencyDtoV1 = z
  .object({
    address: z.string(),
    archived: z.boolean().default(false),
    ccEmails: z.array(z.string()),
    currencyCode: z.string(),
    currencyId: z.string(),
    email: z.string(),
    id: z.string(),
    name: z.string(),
    note: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const CreateClientRequestV1 = z
  .object({
    address: z.string().min(0).max(3000),
    email: z.string().email(),
    name: z.string().min(0).max(100),
    note: z.string().min(0).max(3000),
  })
  .partial()
  .passthrough()
const ClientDtoV1 = z
  .object({
    address: z.string(),
    archived: z.boolean().default(false),
    ccEmails: z.array(z.string()),
    currencyId: z.string(),
    email: z.string(),
    id: z.string(),
    name: z.string(),
    note: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const UpdateClientRequestV1 = z
  .object({
    address: z.string().min(0).max(3000),
    archived: z.boolean().default(false),
    ccEmails: z.array(z.string().email()).max(3),
    currencyId: z.string(),
    email: z.string().email(),
    name: z.string().min(0).max(100),
    note: z.string().min(0).max(3000),
  })
  .partial()
  .passthrough()
const CostRateRequestV1: z.ZodType<CostRateRequestV1> = z
  .object({ amount: z.number().int().gte(0), since: z.string().optional() })
  .passthrough()
const CustomFieldDefaultValuesDtoV1: z.ZodType<CustomFieldDefaultValuesDtoV1> = z
  .object({
    projectId: z.string(),
    status: z.string(),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const CustomFieldDtoV1: z.ZodType<CustomFieldDtoV1> = z
  .object({
    allowedValues: z.array(z.string()),
    description: z.string(),
    entityType: z.string(),
    id: z.string(),
    name: z.string(),
    onlyAdminCanEdit: z.boolean().default(false),
    placeholder: z.string(),
    projectDefaultValues: z.array(CustomFieldDefaultValuesDtoV1),
    required: z.boolean().default(false),
    status: z.string(),
    type: z.string(),
    workspaceDefaultValue: z.object({}).partial().passthrough(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const CustomFieldRequestV1 = z
  .object({
    allowedValues: z.array(z.string()).optional(),
    description: z.string().optional(),
    entityType: z.enum(['TIMEENTRY', 'USER']).optional(),
    name: z.string(),
    onlyAdminCanEdit: z.boolean().optional().default(false),
    placeholder: z.string().optional(),
    status: z.enum(['INACTIVE', 'VISIBLE', 'INVISIBLE']).optional(),
    type: z.enum(['TXT', 'NUMBER', 'DROPDOWN_SINGLE', 'DROPDOWN_MULTIPLE', 'CHECKBOX', 'LINK']),
    workspaceDefaultValue: z.object({}).partial().passthrough().optional(),
  })
  .passthrough()
const UpdateCustomFieldRequestV1 = z
  .object({
    allowedValues: z.array(z.string()).optional(),
    description: z.string().optional(),
    name: z.string().min(2).max(250),
    onlyAdminCanEdit: z.boolean().optional().default(false),
    placeholder: z.string().optional(),
    required: z.boolean().optional().default(false),
    status: z.enum(['INACTIVE', 'VISIBLE', 'INVISIBLE']).optional(),
    type: z.enum(['TXT', 'NUMBER', 'DROPDOWN_SINGLE', 'DROPDOWN_MULTIPLE', 'CHECKBOX', 'LINK']),
    workspaceDefaultValue: z.object({}).partial().passthrough().optional(),
  })
  .passthrough()
const LogBinDocumentDto: z.ZodType<LogBinDocumentDto> = z
  .object({
    deletedAt: z.string().datetime({ offset: true }),
    document: z.object({}).partial().passthrough(),
    documentCode: z.string(),
    id: z.string(),
  })
  .partial()
  .passthrough()
const PageableCollectionLogBinDocumentDto: z.ZodType<PageableCollectionLogBinDocumentDto> = z
  .object({ response: z.array(LogBinDocumentDto) })
  .partial()
  .passthrough()
const ExpenseDailyTotalsDtoV1: z.ZodType<ExpenseDailyTotalsDtoV1> = z
  .object({
    date: z.string(),
    dateAsInstant: z.string().datetime({ offset: true }),
    total: z.number(),
  })
  .partial()
  .passthrough()
const ExpenseHydratedDtoV1: z.ZodType<ExpenseHydratedDtoV1> = z
  .object({
    billable: z.boolean().default(false),
    category: ExpenseCategoryDto,
    date: z.string(),
    fileId: z.string(),
    fileName: z.string(),
    id: z.string(),
    isLocked: z.boolean(),
    locked: z.boolean(),
    notes: z.string(),
    project: ProjectInfoDto,
    quantity: z.number(),
    task: TaskInfoDto,
    total: z.number(),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ExpensesWithCountDtoV1: z.ZodType<ExpensesWithCountDtoV1> = z
  .object({ count: z.number().int(), expenses: z.array(ExpenseHydratedDtoV1) })
  .partial()
  .passthrough()
const ExpenseWeeklyTotalsDtoV1: z.ZodType<ExpenseWeeklyTotalsDtoV1> = z
  .object({ date: z.string(), total: z.number() })
  .partial()
  .passthrough()
const ExpensesAndTotalsDtoV1: z.ZodType<ExpensesAndTotalsDtoV1> = z
  .object({
    dailyTotals: z.array(ExpenseDailyTotalsDtoV1),
    expenses: ExpensesWithCountDtoV1,
    weeklyTotals: z.array(ExpenseWeeklyTotalsDtoV1),
  })
  .partial()
  .passthrough()
const CreateExpenseV1Request = z
  .object({
    amount: z.number().lte(92233720368547760),
    billable: z.boolean().optional().default(false),
    categoryId: z.string(),
    date: z.string().datetime({ offset: true }),
    file: z.instanceof(File),
    notes: z.string().min(0).max(3000).optional(),
    projectId: z.string(),
    taskId: z.string().optional(),
    userId: z.string().min(1),
  })
  .passthrough()
const ExpenseDtoV1 = z
  .object({
    billable: z.boolean().default(false),
    categoryId: z.string(),
    date: z.string(),
    fileId: z.string(),
    id: z.string(),
    isLocked: z.boolean(),
    locked: z.boolean(),
    notes: z.string(),
    projectId: z.string(),
    quantity: z.number(),
    taskId: z.string(),
    total: z.number(),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ExpenseCategoryDtoV1: z.ZodType<ExpenseCategoryDtoV1> = z
  .object({
    archived: z.boolean().default(false),
    hasUnitPrice: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    priceInCents: z.number().int(),
    unit: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ExpenseCategoriesWithCountDtoV1: z.ZodType<ExpenseCategoriesWithCountDtoV1> = z
  .object({
    categories: z.array(ExpenseCategoryDtoV1),
    count: z.number().int(),
  })
  .partial()
  .passthrough()
const ExpenseCategoryV1Request = z
  .object({
    hasUnitPrice: z.boolean().optional().default(false),
    name: z.string().min(0).max(250),
    priceInCents: z.number().int().optional(),
    unit: z.string().optional(),
  })
  .passthrough()
const ExpenseCategoryArchiveV1Request = z
  .object({ archived: z.boolean().default(false) })
  .partial()
  .passthrough()
const UpdateExpenseV1Request = z
  .object({
    amount: z.number().gte(0).lte(92233720368547760),
    billable: z.boolean().optional().default(false),
    categoryId: z.string(),
    changeFields: z.array(
      z.enum(['USER', 'DATE', 'PROJECT', 'TASK', 'CATEGORY', 'NOTES', 'AMOUNT', 'BILLABLE', 'FILE']),
    ),
    date: z.string().datetime({ offset: true }),
    file: z.instanceof(File),
    notes: z.string().min(0).max(3000).optional(),
    projectId: z.string().optional(),
    taskId: z.string().optional(),
    userId: z.string().min(1),
  })
  .passthrough()
const DatePeriod: z.ZodType<DatePeriod> = z
  .object({ endDate: z.string(), startDate: z.string() })
  .partial()
  .passthrough()
const HolidayDtoV1: z.ZodType<HolidayDtoV1> = z
  .object({
    automaticTimeEntryCreation: z.boolean().default(false),
    datePeriod: DatePeriod,
    everyoneIncludingNew: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    occursAnnually: z.boolean().default(false),
    projectId: z.string(),
    taskId: z.string(),
    userGroupIds: z.array(z.string()),
    userIds: z.array(z.string()),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const DefaultEntitiesRequest: z.ZodType<DefaultEntitiesRequest> = z
  .object({ projectId: z.string(), taskId: z.string() })
  .partial()
  .passthrough()
const AutomaticTimeEntryCreationRequest: z.ZodType<AutomaticTimeEntryCreationRequest> = z
  .object({
    defaultEntities: DefaultEntitiesRequest,
    enabled: z.boolean().optional().default(false),
  })
  .passthrough()
const DatePeriodRequest: z.ZodType<DatePeriodRequest> = z
  .object({ endDate: z.string().min(1), startDate: z.string().min(1) })
  .passthrough()
const UserGroupIdsSchema: z.ZodType<UserGroupIdsSchema> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN']),
    ids: z.array(z.string()),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']),
  })
  .partial()
  .passthrough()
const UserIdsSchema: z.ZodType<UserIdsSchema> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN']),
    ids: z.array(z.string()),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']),
  })
  .partial()
  .passthrough()
const CreateHolidayRequestV1: z.ZodType<CreateHolidayRequestV1> = z
  .object({
    automaticTimeEntryCreation: AutomaticTimeEntryCreationRequest.optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    datePeriod: DatePeriodRequest,
    everyoneIncludingNew: z.boolean().optional().default(false),
    name: z.string().min(2).max(100),
    occursAnnually: z.boolean().optional().default(false),
    userGroups: UserGroupIdsSchema.optional(),
    users: UserIdsSchema.optional(),
  })
  .passthrough()
const DefaultEntitiesDto: z.ZodType<DefaultEntitiesDto> = z
  .object({ projectId: z.string(), taskId: z.string() })
  .partial()
  .passthrough()
const AutomaticTimeEntryCreationDto: z.ZodType<AutomaticTimeEntryCreationDto> = z
  .object({ defaultEntities: DefaultEntitiesDto, enabled: z.boolean() })
  .partial()
  .passthrough()
const EntityIdNameDto: z.ZodType<EntityIdNameDto> = z
  .object({ id: z.string(), name: z.string() })
  .partial()
  .passthrough()
const HolidayDto: z.ZodType<HolidayDto> = z
  .object({
    automaticTimeEntryCreation: AutomaticTimeEntryCreationDto,
    color: z.string(),
    datePeriod: DatePeriod,
    everyoneIncludingNew: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    occursAnnually: z.boolean().default(false),
    userGroupIds: z.array(z.string()),
    userGroups: z.array(EntityIdNameDto),
    userIds: z.array(z.string()),
    users: z.array(EntityIdNameDto),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ContainsUserGroupFilterRequest: z.ZodType<ContainsUserGroupFilterRequest> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
  })
  .partial()
  .passthrough()
const ContainsUsersFilterRequestForHoliday: z.ZodType<ContainsUsersFilterRequestForHoliday> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ALL', 'ACTIVE', 'INACTIVE']),
    statuses: z.array(z.string()),
  })
  .partial()
  .passthrough()
const UpdateHolidayRequestV1: z.ZodType<UpdateHolidayRequestV1> = z
  .object({
    automaticTimeEntryCreation: AutomaticTimeEntryCreationRequest.optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    datePeriod: DatePeriodRequest,
    everyoneIncludingNew: z.boolean().optional().default(false),
    name: z.string().min(1),
    occursAnnually: z.boolean().default(false),
    userGroups: ContainsUserGroupFilterRequest.optional(),
    users: ContainsUsersFilterRequestForHoliday.optional(),
  })
  .passthrough()
const RateWithCurrencyRequestV1 = z
  .object({
    amount: z.number().int().gte(0),
    currency: z.string().min(1).max(100).default('USD'),
    since: z.string().optional(),
  })
  .passthrough()
const InvoiceDtoV1: z.ZodType<InvoiceDtoV1> = z
  .object({
    amount: z.number().int(),
    balance: z.number().int(),
    clientId: z.string(),
    clientName: z.string(),
    currency: z.string(),
    dueDate: z.string().datetime({ offset: true }),
    id: z.string(),
    issuedDate: z.string().datetime({ offset: true }),
    number: z.string(),
    paid: z.number().int(),
    status: z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']),
  })
  .partial()
  .passthrough()
const InvoicesListDtoV1: z.ZodType<InvoicesListDtoV1> = z
  .object({ invoices: z.array(InvoiceDtoV1), total: z.number().int() })
  .partial()
  .passthrough()
const CreateInvoiceRequest = z
  .object({
    clientId: z.string().min(1),
    currency: z.string().min(1),
    dueDate: z.string().datetime({ offset: true }),
    issuedDate: z.string().datetime({ offset: true }),
    number: z.string().min(1),
    timeViewMode: z.enum(['TIME_SENSITIVE_VIEW', 'AGGREGATED_TIME_VIEW']).optional(),
  })
  .passthrough()
const CreateInvoiceDtoV1 = z
  .object({
    billFrom: z.string(),
    clientId: z.string(),
    currency: z.string(),
    dueDate: z.string().datetime({ offset: true }),
    id: z.string(),
    issuedDate: z.string().datetime({ offset: true }),
    number: z.string(),
  })
  .partial()
  .passthrough()
const ContainsArchivedFilterRequest: z.ZodType<ContainsArchivedFilterRequest> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']),
  })
  .partial()
  .passthrough()
const BaseFilterRequest: z.ZodType<BaseFilterRequest> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
  })
  .partial()
  .passthrough()
const TimeRangeRequestDtoV1: z.ZodType<TimeRangeRequestDtoV1> = z
  .object({ 'issue-date-end': z.string(), 'issue-date-start': z.string() })
  .partial()
  .passthrough()
const InvoiceFilterRequestV1: z.ZodType<InvoiceFilterRequestV1> = z
  .object({
    clients: ContainsArchivedFilterRequest,
    companies: BaseFilterRequest,
    exactAmount: z.number().int(),
    exactBalance: z.number().int(),
    greaterThanAmount: z.number().int(),
    greaterThanBalance: z.number().int(),
    invoiceNumber: z.string(),
    issueDate: TimeRangeRequestDtoV1,
    lessThanAmount: z.number().int(),
    lessThanBalance: z.number().int(),
    page: z.number().int().default(1),
    pageSize: z.number().int().default(50),
    sortColumn: z.enum(['ID', 'CLIENT', 'DUE_ON', 'ISSUE_DATE', 'AMOUNT', 'BALANCE']),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']),
    statuses: z.array(z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE'])),
    strictSearch: z.boolean().default(false),
  })
  .partial()
  .passthrough()
const VisibleZeroFieldsInvoice: z.ZodType<VisibleZeroFieldsInvoice> = z.enum(['TAX', 'TAX_2', 'DISCOUNT'])
const InvoiceInfoV1: z.ZodType<InvoiceInfoV1> = z
  .object({
    amount: z.number().int(),
    balance: z.number().int(),
    billFrom: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    currency: z.string(),
    daysOverdue: z.number().int(),
    dueDate: z.string().datetime({ offset: true }),
    id: z.string(),
    issuedDate: z.string().datetime({ offset: true }),
    number: z.string(),
    paid: z.number().int(),
    status: z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']),
    visibleZeroFields: VisibleZeroFieldsInvoice,
  })
  .partial()
  .passthrough()
const InvoiceInfoResponseDtoV1: z.ZodType<InvoiceInfoResponseDtoV1> = z
  .object({ invoices: z.array(InvoiceInfoV1), total: z.number().int() })
  .partial()
  .passthrough()
const InvoiceDefaultSettingsDto: z.ZodType<InvoiceDefaultSettingsDto> = z
  .object({
    companyId: z.string(),
    defaultImportExpenseItemTypeId: z.string(),
    defaultImportTimeItemTypeId: z.string(),
    dueDays: z.number().int(),
    itemType: z.string(),
    itemTypeId: z.string(),
    notes: z.string(),
    subject: z.string(),
    tax: z.number().int(),
    tax2: z.number().int(),
    tax2Percent: z.number(),
    taxPercent: z.number(),
    taxType: z.enum(['COMPOUND', 'SIMPLE', 'NONE']),
  })
  .partial()
  .passthrough()
const InvoiceExportFields: z.ZodType<InvoiceExportFields> = z
  .object({
    RTL: z.boolean(),
    itemType: z.boolean(),
    quantity: z.boolean(),
    rtl: z.boolean(),
    tax: z.boolean(),
    tax2: z.boolean(),
    unitPrice: z.boolean(),
  })
  .partial()
  .passthrough()
const LabelsCustomization: z.ZodType<LabelsCustomization> = z
  .object({
    amount: z.string(),
    billFrom: z.string(),
    billTo: z.string(),
    description: z.string(),
    discount: z.string(),
    dueDate: z.string(),
    issueDate: z.string(),
    itemType: z.string(),
    notes: z.string(),
    paid: z.string(),
    quantity: z.string(),
    subtotal: z.string(),
    tax: z.string(),
    tax2: z.string(),
    total: z.string(),
    totalAmount: z.string(),
    unitPrice: z.string(),
  })
  .partial()
  .passthrough()
const InvoiceSettingsDtoV1: z.ZodType<InvoiceSettingsDtoV1> = z
  .object({
    defaults: InvoiceDefaultSettingsDto,
    exportFields: InvoiceExportFields,
    labels: LabelsCustomization,
  })
  .partial()
  .passthrough()
const InvoiceDefaultSettingsRequestV1: z.ZodType<InvoiceDefaultSettingsRequestV1> = z
  .object({
    companyId: z.string().optional(),
    dueDays: z.number().int().optional(),
    itemTypeId: z.string().optional(),
    notes: z.string(),
    subject: z.string(),
    tax2Percent: z.number().optional(),
    taxPercent: z.number().optional(),
    taxType: z.enum(['COMPOUND', 'SIMPLE', 'NONE']).optional(),
  })
  .passthrough()
const InvoiceExportFieldsRequest: z.ZodType<InvoiceExportFieldsRequest> = z
  .object({
    itemType: z.boolean().default(false),
    quantity: z.boolean().default(false),
    rtl: z.boolean().default(false),
    tax: z.boolean().default(false),
    tax2: z.boolean().default(false),
    unitPrice: z.boolean().default(false),
  })
  .partial()
  .passthrough()
const LabelsCustomizationRequest: z.ZodType<LabelsCustomizationRequest> = z
  .object({
    amount: z.string().min(0).max(20),
    billFrom: z.string().min(0).max(20),
    billTo: z.string().min(0).max(20),
    description: z.string().min(0).max(20),
    discount: z.string().min(0).max(20),
    dueDate: z.string().min(0).max(20),
    issueDate: z.string().min(0).max(20),
    itemType: z.string().min(0).max(20),
    notes: z.string().min(0).max(20),
    paid: z.string().min(0).max(20),
    quantity: z.string().min(0).max(20),
    subtotal: z.string().min(0).max(20),
    tax: z.string().min(0).max(20),
    tax2: z.string().min(0).max(20),
    total: z.string().min(0).max(20),
    totalAmountDue: z.string().min(0).max(20),
    unitPrice: z.string().min(0).max(20),
  })
  .passthrough()
const UpdateInvoiceSettingsRequestV1: z.ZodType<UpdateInvoiceSettingsRequestV1> = z
  .object({
    defaults: InvoiceDefaultSettingsRequestV1.optional(),
    exportFields: InvoiceExportFieldsRequest.optional(),
    labels: LabelsCustomizationRequest,
  })
  .passthrough()
const CalculationType: z.ZodType<CalculationType> = z.enum(['INVOICE_BASED', 'ITEM_BASED'])
const ApplyTaxes: z.ZodType<ApplyTaxes> = z.enum(['TAX1', 'TAX2', 'TAX1TAX2', 'NONE'])
const InvoiceItemDto: z.ZodType<InvoiceItemDto> = z
  .object({
    amount: z.number().int(),
    applyTaxes: ApplyTaxes,
    description: z.string(),
    expenseIds: z.array(z.string()),
    importType: z.enum(['NOT_IMPORTED', 'TIME_ENTRY_IMPORT', 'EXPENSE_IMPORT']),
    itemType: z.string(),
    order: z.number().int(),
    quantity: z.number().int(),
    timeEntryIds: z.array(z.string()),
    unitPrice: z.number().int(),
  })
  .partial()
  .passthrough()
const TaxType: z.ZodType<TaxType> = z.enum(['COMPOUND', 'SIMPLE', 'NONE'])
const InvoiceOverviewDtoV1: z.ZodType<InvoiceOverviewDtoV1> = z
  .object({
    amount: z.number().int(),
    balance: z.number().int(),
    billFrom: z.string(),
    calculationType: CalculationType,
    clientAddress: z.string(),
    clientId: z.string(),
    clientName: z.string(),
    companyId: z.string(),
    containsImportedExpenses: z.boolean().default(false),
    containsImportedTimes: z.boolean().default(false),
    currency: z.string(),
    discount: z.number(),
    discountAmount: z.number().int(),
    dueDate: z.string().datetime({ offset: true }),
    id: z.string(),
    issuedDate: z.string().datetime({ offset: true }),
    items: z.array(InvoiceItemDto),
    note: z.string(),
    number: z.string(),
    paid: z.number().int(),
    status: z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']),
    subject: z.string(),
    subtotal: z.number().int(),
    tax: z.number(),
    tax2: z.number(),
    tax2Amount: z.number().int(),
    taxAmount: z.number().int(),
    taxType: TaxType,
    userId: z.string(),
    visibleZeroFields: VisibleZeroFieldsInvoice,
  })
  .partial()
  .passthrough()
const UpdateInvoiceRequestV1: z.ZodType<UpdateInvoiceRequestV1> = z
  .object({
    clientId: z.string().optional(),
    companyId: z.string().optional(),
    currency: z.string().min(1).max(100),
    discountPercent: z.number(),
    dueDate: z.string().datetime({ offset: true }),
    issuedDate: z.string().datetime({ offset: true }),
    note: z.string().optional(),
    number: z.string().min(1),
    subject: z.string().optional(),
    tax2Percent: z.number(),
    taxPercent: z.number(),
    taxType: TaxType.optional(),
    visibleZeroFields: z.enum(['TAX', 'TAX_2', 'DISCOUNT']).optional(),
  })
  .passthrough()
const CreateInvoiceItemRequestV1 = z
  .object({
    applyTaxes: z.enum(['TAX1', 'TAX2', 'TAX1TAX2', 'NONE']),
    description: z.string(),
    itemType: z.string().min(1),
    quantity: z.number().int(),
    unitPrice: z.number().int(),
  })
  .passthrough()
const ImportTimeEntriesAndExpensesRequestV1: z.ZodType<ImportTimeEntriesAndExpensesRequestV1> = z
  .object({
    expenseFieldsForDetailedGroup: z
      .array(z.enum(['PROJECT', 'TASK', 'CATEGORY', 'NOTE', 'DATE', 'USER']).default('NOTE'))
      .optional()
      .default('NOTE'),
    expensesGroupBy: z.enum(['CATEGORY', 'PROJECT', 'USER']).optional().default('PROJECT'),
    expensesGroupType: z.enum(['GROUPED', 'DETAILED']).optional().default('DETAILED'),
    from: z.string(),
    importExpenses: z.boolean().default(false),
    projectFilter: ContainsArchivedFilterRequest,
    roundTimeEntryDuration: z.boolean().optional().default(false),
    timeEntryFieldsForDetailedGroup: z
      .array(z.enum(['PROJECT', 'TASK', 'TAGS', 'DESCRIPTION', 'DATE', 'USER']))
      .optional(),
    timeEntryGroupType: z.enum(['SINGLE_ITEM', 'GROUPED', 'DETAILED']),
    timeEntryPrimaryGroupBy: z.enum(['USER', 'PROJECT', 'DATE']).optional(),
    timeEntrySecondaryGroupBy: z.enum(['PROJECT', 'USER', 'TASK', 'DATE', 'DESCRIPTION', 'NONE']).optional(),
    to: z.string(),
  })
  .passthrough()
const InvoicePaymentDtoV1 = z
  .object({
    amount: z.number().int(),
    author: z.string(),
    date: z.string().datetime({ offset: true }),
    id: z.string(),
    note: z.string(),
  })
  .partial()
  .passthrough()
const CreateInvoicePaymentRequest = z
  .object({
    amount: z.number().int().gte(1),
    note: z.string().min(0).max(1000),
    paymentDate: z.string(),
  })
  .partial()
  .passthrough()
const ChangeInvoiceStatusRequestV1 = z
  .object({
    invoiceStatus: z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']),
  })
  .partial()
  .passthrough()
const UpsertUserCustomFieldRequest: z.ZodType<UpsertUserCustomFieldRequest> = z
  .object({
    customFieldId: z.string(),
    value: z.object({}).partial().passthrough().optional(),
  })
  .passthrough()
const LimitedUserRequest: z.ZodType<LimitedUserRequest> = z
  .object({
    costRate: z.number().int().gte(0).optional(),
    hourlyRate: z.number().int().gte(0).optional(),
    name: z.string().min(1),
    userCustomFields: z.array(UpsertUserCustomFieldRequest).optional(),
    userGroups: z.array(z.string().min(1)).optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    workCapacity: z.string().optional(),
    workingDays: z
      .array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']))
      .optional(),
  })
  .passthrough()
const AddLimitedUsersRequest: z.ZodType<AddLimitedUsersRequest> = z
  .object({ users: z.array(LimitedUserRequest).min(1).max(250) })
  .passthrough()
const UserCustomFieldValueFullDtoV1: z.ZodType<UserCustomFieldValueFullDtoV1> = z
  .object({
    customField: CustomFieldDtoV1,
    customFieldId: z.string(),
    name: z.string(),
    sourceType: z.enum(['WORKSPACE', 'USER']),
    type: z.enum(['TXT', 'NUMBER', 'DROPDOWN_SINGLE', 'DROPDOWN_MULTIPLE', 'CHECKBOX', 'LINK']),
    userId: z.string(),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const MemberProfileDtoV1: z.ZodType<MemberProfileDtoV1> = z
  .object({
    email: z.string(),
    hasPassword: z.boolean().default(false),
    hasPendingApprovalRequest: z.boolean().default(false),
    imageUrl: z.string(),
    name: z.string(),
    userCustomFieldValues: z.array(UserCustomFieldValueFullDtoV1),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    workCapacity: z.string(),
    workingDays: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    workspaceNumber: z.number().int(),
  })
  .partial()
  .passthrough()
const MemberProfileFullRequestV1: z.ZodType<MemberProfileFullRequestV1> = z
  .object({
    imageUrl: z.string(),
    name: z.string().min(1).max(100),
    removeProfileImage: z.boolean().default(false),
    userCustomFields: z.array(UpsertUserCustomFieldRequest),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    workCapacity: z.string(),
    workingDays: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
  })
  .partial()
  .passthrough()
const EstimateWithOptionsDto: z.ZodType<EstimateWithOptionsDto> = z
  .object({
    active: z.boolean(),
    estimate: z.number().int(),
    includeExpenses: z.boolean().default(false),
    resetOption: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    type: z.enum(['AUTO', 'MANUAL']),
  })
  .partial()
  .passthrough()
const EstimateDtoV1: z.ZodType<EstimateDtoV1> = z
  .object({ estimate: z.string(), type: z.enum(['AUTO', 'MANUAL']) })
  .partial()
  .passthrough()
const TimeEstimateDto: z.ZodType<TimeEstimateDto> = z
  .object({
    active: z.boolean(),
    estimate: z.string(),
    includeNonBillable: z.boolean(),
    resetOption: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    type: z.enum(['AUTO', 'MANUAL']),
  })
  .partial()
  .passthrough()
const ProjectDtoV1: z.ZodType<ProjectDtoV1> = z
  .object({
    archived: z.boolean().default(false),
    billable: z.boolean().default(false),
    budgetEstimate: EstimateWithOptionsDto,
    color: z.string(),
    costRate: RateDtoV1,
    duration: z.string(),
    estimate: EstimateDtoV1,
    hourlyRate: RateDtoV1,
    id: z.string(),
    memberships: z.array(MembershipDtoV1),
    name: z.string(),
    note: z.string(),
    public: z.boolean().default(false),
    template: z.boolean().default(false),
    timeEstimate: TimeEstimateDto,
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const EstimateRequest: z.ZodType<EstimateRequest> = z
  .object({ estimate: z.string(), type: z.enum(['AUTO', 'MANUAL']) })
  .partial()
  .passthrough()
const HourlyRateRequestV1: z.ZodType<HourlyRateRequestV1> = z
  .object({ amount: z.number().int().gte(0), since: z.string().optional() })
  .passthrough()
const HourlyRateRequest: z.ZodType<HourlyRateRequest> = z
  .object({ amount: z.number().int().gte(0), since: z.string().optional() })
  .passthrough()
const MembershipRequest: z.ZodType<MembershipRequest> = z
  .object({
    hourlyRate: HourlyRateRequest,
    membershipStatus: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
    membershipType: z.enum(['WORKSPACE', 'PROJECT', 'USERGROUP']),
    userId: z.string(),
  })
  .partial()
  .passthrough()
const CostRateRequest: z.ZodType<CostRateRequest> = z
  .object({
    amount: z.number().int().gte(0),
    since: z.string(),
    sinceAsInstant: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const TaskRequest: z.ZodType<TaskRequest> = z
  .object({
    assigneeId: z.string().optional(),
    assigneeIds: z.array(z.string()).optional(),
    billable: z.boolean().optional().default(false),
    budgetEstimate: z.number().int().gte(0).optional(),
    costRate: CostRateRequest.optional(),
    estimate: z.string().optional(),
    hourlyRate: HourlyRateRequest.optional(),
    id: z.string().optional(),
    name: z.string(),
    projectId: z.string().optional(),
    status: z.string().optional(),
    userGroupIds: z.array(z.string()).optional(),
  })
  .passthrough()
const ProjectRequest: z.ZodType<ProjectRequest> = z
  .object({
    billable: z.boolean().optional().default(false),
    clientId: z.string().optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    costRate: CostRateRequestV1.optional(),
    estimate: EstimateRequest.optional(),
    hourlyRate: HourlyRateRequestV1.optional(),
    isPublic: z.boolean().optional().default(false),
    memberships: z.array(MembershipRequest).optional(),
    name: z.string().min(2).max(250),
    note: z.string().max(16384).optional(),
    tasks: z.array(TaskRequest).optional(),
  })
  .passthrough()
const EstimateResetDto: z.ZodType<EstimateResetDto> = z
  .object({
    dayOfMonth: z.number().int(),
    dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    hour: z.number().int(),
    interval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    month: z.enum([
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ]),
  })
  .partial()
  .passthrough()
const ProjectDtoImplV1: z.ZodType<ProjectDtoImplV1> = z
  .object({
    archived: z.boolean().default(false),
    billable: z.boolean().default(false),
    budgetEstimate: EstimateWithOptionsDto,
    clientId: z.string(),
    clientName: z.string(),
    color: z.string(),
    costRate: RateDtoV1,
    duration: z.string(),
    estimate: EstimateDtoV1,
    estimateReset: EstimateResetDto,
    hourlyRate: RateDtoV1,
    id: z.string(),
    isPublic: z.boolean(),
    isTemplate: z.boolean(),
    memberships: z.array(MembershipDtoV1),
    name: z.string(),
    note: z.string(),
    public: z.boolean().default(false),
    template: z.boolean().default(false),
    timeEstimate: TimeEstimateDto,
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const CreateProjectFromTemplateV1 = z
  .object({
    clientId: z.string().optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    isPublic: z.boolean().optional().default(false),
    name: z.string().min(2).max(250),
    templateProjectId: z.string().min(1),
  })
  .passthrough()
const UpdateProjectRequest: z.ZodType<UpdateProjectRequest> = z
  .object({
    archived: z.boolean().default(false),
    billable: z.boolean().default(false),
    clientId: z.string(),
    color: z.string().regex(/^#(?:[0-9a-fA-F]{6}){1}$/),
    costRate: CostRateRequestV1,
    hourlyRate: HourlyRateRequestV1,
    isPublic: z.boolean().default(false),
    name: z.string().min(2).max(250),
    note: z.string().max(16384),
  })
  .partial()
  .passthrough()
const CustomFieldProjectDefaultValuesRequest = z
  .object({
    defaultValue: z.object({}).partial().passthrough(),
    status: z.enum(['INACTIVE', 'VISIBLE', 'INVISIBLE']),
  })
  .partial()
  .passthrough()
const EstimateWithOptionsRequest: z.ZodType<EstimateWithOptionsRequest> = z
  .object({
    active: z.boolean().default(false),
    estimate: z.number().int().gte(0),
    includeExpenses: z.boolean().default(false),
    resetOption: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    type: z.enum(['AUTO', 'MANUAL']),
  })
  .partial()
  .passthrough()
const EstimateResetRequest: z.ZodType<EstimateResetRequest> = z
  .object({
    active: z.boolean(),
    dayOfMonth: z.number().int().gte(1).lte(31),
    dayOfWeek: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    hour: z.number().int().gte(0).lte(23),
    interval: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    isActive: z.boolean(),
    month: z.enum([
      'JANUARY',
      'FEBRUARY',
      'MARCH',
      'APRIL',
      'MAY',
      'JUNE',
      'JULY',
      'AUGUST',
      'SEPTEMBER',
      'OCTOBER',
      'NOVEMBER',
      'DECEMBER',
    ]),
  })
  .partial()
  .passthrough()
const TimeEstimateRequest: z.ZodType<TimeEstimateRequest> = z
  .object({
    active: z.boolean().default(false),
    estimate: z.string(),
    includeNonBillable: z.boolean().default(false),
    resetOption: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
    type: z.enum(['AUTO', 'MANUAL']),
  })
  .partial()
  .passthrough()
const ProjectEstimateRequest: z.ZodType<ProjectEstimateRequest> = z
  .object({
    budgetEstimate: EstimateWithOptionsRequest,
    estimateReset: EstimateResetRequest,
    timeEstimate: TimeEstimateRequest,
  })
  .partial()
  .passthrough()
const UserIdWithRatesRequest: z.ZodType<UserIdWithRatesRequest> = z
  .object({
    costRate: CostRateRequestV1.optional(),
    hourlyRate: HourlyRateRequestV1.optional(),
    userId: z.string(),
  })
  .passthrough()
const UpdateProjectMembershipsRequest: z.ZodType<UpdateProjectMembershipsRequest> = z
  .object({
    memberships: z.array(UserIdWithRatesRequest),
    userGroups: UserGroupIdsSchema.optional(),
  })
  .passthrough()
const AddUsersToProjectRequestV1: z.ZodType<AddUsersToProjectRequestV1> = z
  .object({
    remove: z.boolean().default(false),
    userGroups: UserGroupIdsSchema,
    userIds: z.array(z.string()),
  })
  .partial()
  .passthrough()
const TaskStatus: z.ZodType<TaskStatus> = z.enum(['ACTIVE', 'DONE', 'ALL'])
const TaskDtoV1: z.ZodType<TaskDtoV1> = z
  .object({
    assigneeId: z.string(),
    assigneeIds: z.array(z.string()),
    billable: z.boolean().default(false),
    budgetEstimate: z.number().int(),
    costRate: RateDtoV1,
    duration: z.string(),
    estimate: z.string(),
    hourlyRate: RateDtoV1,
    id: z.string(),
    name: z.string(),
    projectId: z.string(),
    status: TaskStatus,
    userGroupIds: z.array(z.string()),
  })
  .partial()
  .passthrough()
const TaskRequestV1 = z
  .object({
    assigneeId: z.string().optional(),
    assigneeIds: z.array(z.string()).optional(),
    budgetEstimate: z.number().int().gte(0).optional(),
    estimate: z.string().optional(),
    id: z.string().optional(),
    name: z.string().min(1).max(1000),
    status: z.enum(['ACTIVE', 'DONE', 'ALL']).optional(),
    userGroupIds: z.array(z.string()).optional(),
  })
  .passthrough()
const UpdateTaskRequest = z
  .object({
    assigneeId: z.string().optional(),
    assigneeIds: z.array(z.string()).optional(),
    billable: z.boolean().optional().default(false),
    budgetEstimate: z.number().int().gte(0).optional(),
    estimate: z.string().optional(),
    name: z.string().min(1).max(1000),
    status: z.enum(['ACTIVE', 'DONE', 'ALL']).optional(),
    userGroupIds: z.array(z.string()).optional(),
  })
  .passthrough()
const PatchProjectTemplateRequest = z
  .object({ isTemplate: z.boolean().default(false) })
  .partial()
  .passthrough()
const AssignmentHydratedDtoV1: z.ZodType<AssignmentHydratedDtoV1> = z
  .object({
    billable: z.boolean().default(false),
    clientId: z.string(),
    clientName: z.string(),
    hoursPerDay: z.number(),
    id: z.string(),
    note: z.string(),
    period: DateRangeDto,
    projectArchived: z.boolean(),
    projectBillable: z.boolean(),
    projectColor: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    startTime: z.string(),
    taskId: z.string(),
    taskName: z.string(),
    userId: z.string(),
    userName: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ProjectTotalsRequestV1 = z
  .object({
    end: z.string().datetime({ offset: true }),
    page: z.number().int().optional().default(1),
    pageSize: z.number().int().lte(200).optional().default(50),
    search: z.string().optional(),
    start: z.string().datetime({ offset: true }),
    statusFilter: z.enum(['PUBLISHED', 'UNPUBLISHED', 'ALL']).optional(),
  })
  .passthrough()
const AssignmentPerDayDto: z.ZodType<AssignmentPerDayDto> = z
  .object({
    date: z.string().datetime({ offset: true }),
    hasAssignment: z.boolean(),
  })
  .partial()
  .passthrough()
const MilestoneDto: z.ZodType<MilestoneDto> = z
  .object({
    date: z.string().datetime({ offset: true }),
    id: z.string(),
    name: z.string(),
    projectId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const SchedulingProjectsTotalsDtoV1: z.ZodType<SchedulingProjectsTotalsDtoV1> = z
  .object({
    assignments: z.array(AssignmentPerDayDto),
    clientName: z.string(),
    milestones: z.array(MilestoneDto),
    projectArchived: z.boolean().default(false),
    projectBillable: z.boolean().default(false),
    projectColor: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    taskId: z.string(),
    taskName: z.string(),
    totalHours: z.number(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ContainsUsersFilterRequestV1: z.ZodType<ContainsUsersFilterRequestV1> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    sourceType: z.literal('USER_GROUP'),
    status: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
    statuses: z.array(z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL'])),
  })
  .partial()
  .passthrough()
const ContainsUserGroupFilterRequestV1: z.ZodType<ContainsUserGroupFilterRequestV1> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
  })
  .partial()
  .passthrough()
const PublishAssignmentsRequestV1: z.ZodType<PublishAssignmentsRequestV1> = z
  .object({
    end: z.string(),
    notifyUsers: z.boolean().optional().default(false),
    search: z.string().optional(),
    start: z.string(),
    userFilter: ContainsUsersFilterRequestV1.optional(),
    userGroupFilter: ContainsUserGroupFilterRequestV1.optional(),
    viewType: z.enum(['PROJECTS', 'TEAM', 'ALL']).optional(),
  })
  .passthrough()
const CreateRecurringAssignmentRequestV1: z.ZodType<CreateRecurringAssignmentRequestV1> = z
  .object({
    repeat: z.boolean().optional().default(false),
    weeks: z.number().int().gte(1).lte(99),
  })
  .passthrough()
const AssignmentCreateRequestV1: z.ZodType<AssignmentCreateRequestV1> = z
  .object({
    billable: z.boolean().optional().default(false),
    end: z.string(),
    hoursPerDay: z.number(),
    includeNonWorkingDays: z.boolean().optional().default(false),
    note: z.string().min(0).max(100).optional(),
    projectId: z.string().min(1),
    recurringAssignment: CreateRecurringAssignmentRequestV1.optional(),
    start: z.string(),
    startTime: z.string().optional(),
    taskId: z.string().optional(),
    userId: z.string().min(1),
  })
  .passthrough()
const SchedulingExcludeDay: z.ZodType<SchedulingExcludeDay> = z
  .object({
    date: z.string().datetime({ offset: true }),
    type: z.enum(['WEEKEND', 'HOLIDAY', 'TIME_OFF']),
  })
  .partial()
  .passthrough()
const RecurringAssignmentDto: z.ZodType<RecurringAssignmentDto> = z
  .object({
    repeat: z.boolean().default(false),
    seriesId: z.string(),
    weeks: z.number().int(),
  })
  .partial()
  .passthrough()
const AssignmentDtoV1: z.ZodType<AssignmentDtoV1> = z
  .object({
    billable: z.boolean().default(false),
    excludeDays: z.array(SchedulingExcludeDay),
    hoursPerDay: z.number(),
    id: z.string(),
    includeNonWorkingDays: z.boolean().default(false),
    note: z.string(),
    period: DateRangeDto,
    projectId: z.string(),
    published: z.boolean().default(false),
    recurring: RecurringAssignmentDto,
    startTime: z.string(),
    taskId: z.string(),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const AssignmentUpdateRequestV1 = z
  .object({
    billable: z.boolean().optional().default(false),
    end: z.string(),
    hoursPerDay: z.number().optional(),
    includeNonWorkingDays: z.boolean().optional().default(false),
    note: z.string().min(0).max(100).optional(),
    seriesUpdateOption: z.enum(['THIS_ONE', 'THIS_AND_FOLLOWING', 'ALL']).optional(),
    start: z.string(),
    startTime: z.string().optional(),
    taskId: z.string().optional(),
  })
  .passthrough()
const RecurringAssignmentRequestV1 = z
  .object({
    repeat: z.boolean().optional().default(false),
    weeks: z.number().int().gte(1).lte(99),
  })
  .passthrough()
const GetUserTotalsRequestV1: z.ZodType<GetUserTotalsRequestV1> = z
  .object({
    end: z.string().datetime({ offset: true }),
    page: z.number().int().optional().default(1),
    pageSize: z.number().int().lte(200).optional().default(50),
    search: z.string().optional(),
    start: z.string().datetime({ offset: true }),
    statusFilter: z.enum(['PUBLISHED', 'UNPUBLISHED', 'ALL']).optional(),
    userFilter: ContainsUsersFilterRequestV1.optional(),
    userGroupFilter: ContainsUserGroupFilterRequestV1.optional(),
  })
  .passthrough()
const TotalsPerDayDto: z.ZodType<TotalsPerDayDto> = z
  .object({
    date: z.string().datetime({ offset: true }),
    totalHours: z.number(),
  })
  .partial()
  .passthrough()
const SchedulingUsersTotalsDtoV1: z.ZodType<SchedulingUsersTotalsDtoV1> = z
  .object({
    capacityPerDay: z.number(),
    totalHoursPerDay: z.array(TotalsPerDayDto),
    userId: z.string(),
    userImage: z.string(),
    userName: z.string(),
    userStatus: z.string(),
    workingDays: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const CopyAssignmentRequestV1 = z
  .object({
    seriesUpdateOption: z.enum(['THIS_ONE', 'THIS_AND_FOLLOWING', 'ALL']).optional(),
    userId: z.string(),
  })
  .passthrough()
const TagDtoV1 = z
  .object({
    archived: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const TagRequest = z
  .object({ name: z.string().min(0).max(100) })
  .partial()
  .passthrough()
const UpdateTagRequest = z
  .object({
    archived: z.boolean().default(false),
    name: z.string().min(0).max(100),
  })
  .partial()
  .passthrough()
const CreateCustomAttributeRequest: z.ZodType<CreateCustomAttributeRequest> = z
  .object({
    name: z.string().min(1),
    namespace: z.string().min(1),
    value: z.string().min(1),
  })
  .passthrough()
const UpdateCustomFieldRequest: z.ZodType<UpdateCustomFieldRequest> = z
  .object({
    customFieldId: z.string(),
    sourceType: z.enum(['WORKSPACE', 'PROJECT', 'TIMEENTRY']).optional(),
    value: z.object({}).partial().passthrough().optional(),
  })
  .passthrough()
const CreateTimeEntryRequest: z.ZodType<CreateTimeEntryRequest> = z
  .object({
    billable: z.boolean().default(false),
    customAttributes: z.array(CreateCustomAttributeRequest).max(10),
    customFields: z.array(UpdateCustomFieldRequest).max(50),
    description: z.string().max(3000),
    end: z.string().datetime({ offset: true }),
    projectId: z.string(),
    start: z.string().datetime({ offset: true }),
    tagIds: z.array(z.string()),
    taskId: z.string(),
    type: z.enum(['REGULAR', 'BREAK']),
  })
  .partial()
  .passthrough()
const CustomFieldValueDtoV1: z.ZodType<CustomFieldValueDtoV1> = z
  .object({
    customFieldId: z.string(),
    name: z.string(),
    timeEntryId: z.string(),
    type: z.string(),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const TimeIntervalDtoV1: z.ZodType<TimeIntervalDtoV1> = z
  .object({
    duration: z.string(),
    end: z.string().datetime({ offset: true }),
    start: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const TimeEntryDtoImplV1: z.ZodType<TimeEntryDtoImplV1> = z
  .object({
    billable: z.boolean().default(false),
    customFieldValues: z.array(CustomFieldValueDtoV1),
    description: z.string(),
    id: z.string(),
    isLocked: z.boolean().default(false),
    kioskId: z.string(),
    projectId: z.string(),
    tagIds: z.array(z.string()),
    taskId: z.string(),
    timeInterval: TimeIntervalDtoV1,
    type: z.enum(['REGULAR', 'BREAK', 'HOLIDAY', 'TIME_OFF']),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const TimeEntryId: z.ZodType<TimeEntryId> = z
  .object({ dateOfCreationFromObjectId: z.string().datetime({ offset: true }) })
  .partial()
  .passthrough()
const UpdateInvoicedStatusRequest: z.ZodType<UpdateInvoicedStatusRequest> = z
  .object({
    invoiced: z.boolean().default(false),
    timeEntryIds: z.array(TimeEntryId).min(1),
  })
  .passthrough()
const TimeEntryWithRatesDtoV1: z.ZodType<TimeEntryWithRatesDtoV1> = z
  .object({
    billable: z.boolean().default(false),
    costRate: RateDtoV1,
    customFieldValues: z.array(CustomFieldValueDtoV1),
    description: z.string(),
    hourlyRate: RateDtoV1,
    id: z.string(),
    isLocked: z.boolean().default(false),
    kioskId: z.string(),
    projectId: z.string(),
    tagIds: z.array(z.string()),
    taskId: z.string(),
    timeInterval: TimeIntervalDtoV1,
    type: z.enum(['REGULAR', 'BREAK', 'HOLIDAY', 'TIME_OFF']),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const UpdateTimeEntryRequest: z.ZodType<UpdateTimeEntryRequest> = z
  .object({
    billable: z.boolean().optional().default(false),
    customFields: z.array(UpdateCustomFieldRequest).max(50).optional(),
    description: z.string().min(0).max(3000).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    projectId: z.string().optional(),
    start: z.string().datetime({ offset: true }),
    tagIds: z.array(z.string()).optional(),
    taskId: z.string().optional(),
    type: z.enum(['REGULAR', 'BREAK']).optional(),
  })
  .passthrough()
const UpdateBalanceRequestV1 = z
  .object({
    note: z.string().optional(),
    userIds: z.array(z.string()).min(1),
    value: z.number().gte(-10000).lte(10000),
  })
  .passthrough()
const PolicyApprovalDto: z.ZodType<PolicyApprovalDto> = z
  .object({
    requiresApproval: z.boolean().default(false),
    specificMembers: z.boolean().default(false),
    teamManagers: z.boolean().default(false),
    userIds: z.array(z.string()),
  })
  .partial()
  .passthrough()
const AutomaticAccrualDto: z.ZodType<AutomaticAccrualDto> = z
  .object({
    amount: z.number(),
    period: z.enum(['MONTH', 'YEAR']),
    timeUnit: z.enum(['DAYS', 'HOURS']),
  })
  .partial()
  .passthrough()
const NegativeBalanceDto: z.ZodType<NegativeBalanceDto> = z
  .object({
    amount: z.number(),
    period: z.string(),
    shouldReset: z.boolean(),
    timeUnit: z.string(),
  })
  .partial()
  .passthrough()
const PolicyDtoV1: z.ZodType<PolicyDtoV1> = z
  .object({
    allowHalfDay: z.boolean().default(false),
    allowNegativeBalance: z.boolean().default(false),
    approve: PolicyApprovalDto,
    archived: z.boolean().default(false),
    automaticAccrual: AutomaticAccrualDto,
    automaticTimeEntryCreation: AutomaticTimeEntryCreationDto,
    everyoneIncludingNew: z.boolean().default(false),
    id: z.string(),
    name: z.string(),
    negativeBalance: NegativeBalanceDto,
    projectId: z.string(),
    timeUnit: z.enum(['DAYS', 'HOURS']),
    userGroupIds: z.array(z.string()),
    userIds: z.array(z.string()),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const AutomaticAccrualRequest: z.ZodType<AutomaticAccrualRequest> = z
  .object({
    amount: z.number().gte(0),
    period: z.enum(['MONTH', 'YEAR']).optional(),
    timeUnit: z.enum(['DAYS', 'HOURS']).optional(),
  })
  .passthrough()
const NegativeBalanceRequest: z.ZodType<NegativeBalanceRequest> = z
  .object({
    amount: z.number().gte(0),
    period: z.enum(['MONTH', 'YEAR']).optional(),
    shouldReset: z.boolean().optional().default(false),
  })
  .passthrough()
const CreatePolicyRequestV1: z.ZodType<CreatePolicyRequestV1> = z
  .object({
    allowHalfDay: z.boolean().optional().default(false),
    allowNegativeBalance: z.boolean().optional().default(false),
    approve: PolicyApprovalDto,
    archived: z.boolean().optional().default(false),
    automaticAccrual: AutomaticAccrualRequest.optional(),
    automaticTimeEntryCreation: AutomaticTimeEntryCreationRequest.optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    everyoneIncludingNew: z.boolean().optional().default(false),
    hasExpiration: z.boolean().optional().default(false),
    icon: z
      .enum([
        'UMBRELLA',
        'SNOWFLAKE',
        'FAMILY',
        'PLANE',
        'STETHOSCOPE',
        'HEALTH_METRICS',
        'CHILDCARE',
        'LUGGAGE',
        'MONETIZATION',
        'CALENDAR',
      ])
      .optional(),
    name: z.string().min(2).max(100),
    negativeBalance: NegativeBalanceRequest.optional(),
    timeUnit: z.enum(['DAYS', 'HOURS']).optional(),
    userGroups: UserGroupIdsSchema.optional(),
    users: UserIdsSchema.optional(),
  })
  .passthrough()
const ChangePolicyStatusRequestV1 = z.object({ status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']) }).passthrough()
const UpdatePolicyRequestV1: z.ZodType<UpdatePolicyRequestV1> = z
  .object({
    allowHalfDay: z.boolean().default(false),
    allowNegativeBalance: z.boolean().default(false),
    approve: PolicyApprovalDto,
    archived: z.boolean().default(false),
    automaticAccrual: AutomaticAccrualRequest.optional(),
    automaticTimeEntryCreation: AutomaticTimeEntryCreationRequest.optional(),
    color: z
      .string()
      .regex(/^#(?:[0-9a-fA-F]{6}){1}$/)
      .optional(),
    everyoneIncludingNew: z.boolean().default(false),
    hasExpiration: z.boolean().default(false),
    icon: z
      .enum([
        'UMBRELLA',
        'SNOWFLAKE',
        'FAMILY',
        'PLANE',
        'STETHOSCOPE',
        'HEALTH_METRICS',
        'CHILDCARE',
        'LUGGAGE',
        'MONETIZATION',
        'CALENDAR',
      ])
      .optional(),
    name: z.string().min(2).max(100),
    negativeBalance: NegativeBalanceRequest.optional(),
    userGroups: UserGroupIdsSchema,
    users: UserIdsSchema,
  })
  .passthrough()
const PeriodV1Request: z.ZodType<PeriodV1Request> = z
  .object({
    days: z.number().int().gte(1).lte(999),
    end: z.string(),
    start: z.string(),
  })
  .partial()
  .passthrough()
const TimeOffRequestPeriodV1Request: z.ZodType<TimeOffRequestPeriodV1Request> = z
  .object({
    halfDayPeriod: z.enum(['FIRST_HALF', 'SECOND_HALF', 'NOT_DEFINED']).optional(),
    isHalfDay: z.boolean().optional().default(false),
    period: PeriodV1Request,
    timeOffHalfDayPeriod: z.enum(['FIRST_HALF', 'SECOND_HALF', 'NOT_DEFINED']).optional(),
  })
  .passthrough()
const CreateTimeOffRequestV1Request: z.ZodType<CreateTimeOffRequestV1Request> = z
  .object({
    note: z.string().optional(),
    timeOffPeriod: TimeOffRequestPeriodV1Request,
  })
  .passthrough()
const TimeOffRequestStatus: z.ZodType<TimeOffRequestStatus> = z
  .object({
    changedAt: z.string().datetime({ offset: true }),
    changedByUserId: z.string(),
    changedByUserName: z.string(),
    changedForUserName: z.string(),
    note: z.string(),
    statusType: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL']),
  })
  .partial()
  .passthrough()
const Period: z.ZodType<Period> = z
  .object({
    end: z.string().datetime({ offset: true }),
    start: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const TimeOffRequestPeriodDto: z.ZodType<TimeOffRequestPeriodDto> = z
  .object({
    halfDay: z.boolean(),
    halfDayHours: Period,
    halfDayPeriod: z.string(),
    period: Period,
  })
  .partial()
  .passthrough()
const TimeOffRequestFullV1Dto: z.ZodType<TimeOffRequestFullV1Dto> = z
  .object({
    balance: z.number(),
    balanceDiff: z.number(),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string(),
    note: z.string(),
    policyId: z.string(),
    policyName: z.string(),
    requesterUserId: z.string(),
    requesterUserName: z.string(),
    status: TimeOffRequestStatus,
    timeOffPeriod: TimeOffRequestPeriodDto,
    timeUnit: z.enum(['DAYS', 'HOURS']),
    userEmail: z.string(),
    userId: z.string(),
    userName: z.string(),
    userTimeZone: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const TimeOffRequestV1Dto: z.ZodType<TimeOffRequestV1Dto> = z
  .object({
    balanceDiff: z.number(),
    createdAt: z.string().datetime({ offset: true }),
    id: z.string(),
    note: z.string(),
    policyId: z.string(),
    status: TimeOffRequestStatus,
    timeOffPeriod: TimeOffRequestPeriodDto,
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const StatusTimeOffRequestV1Request = z
  .object({ note: z.string(), status: z.enum(['APPROVED', 'REJECTED']) })
  .partial()
  .passthrough()
const GetTimeOffRequestsV1Request = z
  .object({
    end: z.string().datetime({ offset: true }),
    page: z.number().int().lte(1000).default(1),
    pageSize: z.number().int().gte(1).lte(200).default(50),
    start: z.string().datetime({ offset: true }),
    statuses: z.array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL'])),
    userGroups: z.array(z.string()),
    users: z.array(z.string()),
  })
  .partial()
  .passthrough()
const TimeOffRequestsWithCountV1Dto: z.ZodType<TimeOffRequestsWithCountV1Dto> = z
  .object({
    count: z.number().int(),
    requests: z.array(TimeOffRequestFullV1Dto),
  })
  .partial()
  .passthrough()
const UserRedactedDtoV1: z.ZodType<UserRedactedDtoV1> = z
  .object({ id: z.string(), name: z.string() })
  .partial()
  .passthrough()
const UserGroupDtoV1: z.ZodType<UserGroupDtoV1> = z
  .object({
    id: z.string(),
    name: z.string(),
    teamManagers: z.array(UserRedactedDtoV1),
    userIds: z.array(z.string()),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const UserGroupRequest = z
  .object({ name: z.string().min(0).max(100) })
  .partial()
  .passthrough()
const UpdateUserGroupRequest = z
  .object({ name: z.string().min(0).max(100) })
  .partial()
  .passthrough()
const UserGroupUserRequest = z.object({ userId: z.string() }).passthrough()
const StopTimeEntryRequest = z.object({ end: z.string().datetime({ offset: true }) }).passthrough()
const UpdateTimeEntryBulkRequest: z.ZodType<UpdateTimeEntryBulkRequest> = z
  .object({
    billable: z.boolean().optional().default(false),
    customFields: z.array(UpdateCustomFieldRequest).max(50).optional(),
    description: z.string().min(0).max(3000).optional(),
    end: z.string().datetime({ offset: true }).optional(),
    id: z.string().min(1),
    projectId: z.string().optional(),
    start: z.string().datetime({ offset: true }).optional(),
    tagIds: z.array(z.string()).optional(),
    taskId: z.string().optional(),
    type: z.enum(['REGULAR', 'BREAK']).optional(),
  })
  .passthrough()
const TimeEntryDtoV1: z.ZodType<TimeEntryDtoV1> = z
  .object({
    billable: z.boolean().default(false),
    customFieldValues: z.array(CustomFieldValueDtoV1),
    description: z.string(),
    id: z.string(),
    isLocked: z.boolean().default(false),
    kioskId: z.string(),
    projectId: z.string(),
    tagIds: z.array(z.string()),
    taskId: z.string(),
    timeInterval: TimeIntervalDtoV1,
    type: z.enum(['REGULAR', 'BREAK', 'HOLIDAY', 'TIME_OFF']),
    userId: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const AddUserToWorkspaceRequest = z.object({ email: z.string().min(1) }).passthrough()
const GetUsersRequestV1 = z
  .object({
    accountStatuses: z.array(z.string()),
    email: z.string(),
    includeRoles: z.boolean().default(false),
    memberships: z.enum(['ALL', 'NONE', 'WORKSPACE', 'PROJECT', 'USERGROUP']).default('NONE'),
    name: z.string(),
    page: z.number().int().default(1),
    pageSize: z.number().int().gte(1).default(50),
    projectId: z.string(),
    roles: z.array(z.enum(['WORKSPACE_ADMIN', 'OWNER', 'TEAM_MANAGER', 'PROJECT_MANAGER'])),
    sortColumn: z.enum(['ID', 'EMAIL', 'NAME', 'NAME_LOWERCASE', 'ACCESS', 'HOURLYRATE', 'COSTRATE']),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']),
    status: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']),
    userGroups: z.array(z.string()),
  })
  .partial()
  .passthrough()
const UpdateUserStatusRequest = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).passthrough()
const UpsertUserCustomFieldRequestV1 = z
  .object({ value: z.object({}).partial().passthrough() })
  .partial()
  .passthrough()
const RoleRequestV1 = z
  .object({
    entityId: z.string().min(1),
    role: z.enum(['WORKSPACE_ADMIN', 'TEAM_MANAGER', 'PROJECT_MANAGER']),
    sourceType: z.literal('USER_GROUP').optional(),
  })
  .passthrough()
const AuthorizationSourceDtoV1: z.ZodType<AuthorizationSourceDtoV1> = z
  .object({ id: z.string(), type: z.literal('USER_GROUP') })
  .partial()
  .passthrough()
const RoleDtoV1: z.ZodType<RoleDtoV1> = z
  .object({
    id: z.string(),
    name: z.string(),
    source: AuthorizationSourceDtoV1,
  })
  .partial()
  .passthrough()
const RoleDetailsDtoV1: z.ZodType<RoleDetailsDtoV1> = z
  .object({ role: RoleDtoV1, userId: z.string(), workspaceId: z.string() })
  .partial()
  .passthrough()
const CreateWebhookRequestV1 = z
  .object({
    name: z.string().min(2).max(30).optional(),
    triggerSource: z.array(z.string()),
    triggerSourceType: z.enum([
      'PROJECT_ID',
      'USER_ID',
      'TAG_ID',
      'TASK_ID',
      'WORKSPACE_ID',
      'ASSIGNMENT_ID',
      'EXPENSE_ID',
    ]),
    url: z.string().min(1),
    webhookEvent: z.enum([
      'NEW_PROJECT',
      'NEW_TASK',
      'NEW_CLIENT',
      'NEW_TIMER_STARTED',
      'TIMER_STOPPED',
      'TIME_ENTRY_UPDATED',
      'TIME_ENTRY_DELETED',
      'TIME_ENTRY_SPLIT',
      'NEW_TIME_ENTRY',
      'TIME_ENTRY_RESTORED',
      'NEW_TAG',
      'USER_DELETED_FROM_WORKSPACE',
      'USER_JOINED_WORKSPACE',
      'USER_DEACTIVATED_ON_WORKSPACE',
      'USER_ACTIVATED_ON_WORKSPACE',
      'USER_EMAIL_CHANGED',
      'USER_UPDATED',
      'NEW_INVOICE',
      'INVOICE_UPDATED',
      'NEW_APPROVAL_REQUEST',
      'APPROVAL_REQUEST_STATUS_UPDATED',
      'TIME_OFF_REQUESTED',
      'TIME_OFF_REQUEST_UPDATED',
      'TIME_OFF_REQUEST_APPROVED',
      'TIME_OFF_REQUEST_REJECTED',
      'TIME_OFF_REQUEST_STARTED',
      'TIME_OFF_REQUEST_WITHDRAWN',
      'BALANCE_UPDATED',
      'TAG_UPDATED',
      'TAG_DELETED',
      'TASK_UPDATED',
      'CLIENT_UPDATED',
      'TASK_DELETED',
      'CLIENT_DELETED',
      'EXPENSE_RESTORED',
      'ASSIGNMENT_CREATED',
      'ASSIGNMENT_DELETED',
      'ASSIGNMENT_PUBLISHED',
      'ASSIGNMENT_UPDATED',
      'EXPENSE_CREATED',
      'EXPENSE_DELETED',
      'EXPENSE_UPDATED',
      'PROJECT_UPDATED',
      'PROJECT_DELETED',
      'USER_GROUP_CREATED',
      'USER_GROUP_UPDATED',
      'USER_GROUP_DELETED',
      'USERS_INVITED_TO_WORKSPACE',
      'LIMITED_USERS_ADDED_TO_WORKSPACE',
      'COST_RATE_UPDATED',
      'BILLABLE_RATE_UPDATED',
    ]),
  })
  .passthrough()
const UpdateWebhookRequestV1 = z
  .object({
    name: z.string().min(2).max(30).optional(),
    triggerSource: z.array(z.string()),
    triggerSourceType: z.enum([
      'PROJECT_ID',
      'USER_ID',
      'TAG_ID',
      'TASK_ID',
      'WORKSPACE_ID',
      'ASSIGNMENT_ID',
      'EXPENSE_ID',
    ]),
    url: z.string().min(1),
    webhookEvent: z.enum([
      'NEW_PROJECT',
      'NEW_TASK',
      'NEW_CLIENT',
      'NEW_TIMER_STARTED',
      'TIMER_STOPPED',
      'TIME_ENTRY_UPDATED',
      'TIME_ENTRY_DELETED',
      'TIME_ENTRY_SPLIT',
      'NEW_TIME_ENTRY',
      'TIME_ENTRY_RESTORED',
      'NEW_TAG',
      'USER_DELETED_FROM_WORKSPACE',
      'USER_JOINED_WORKSPACE',
      'USER_DEACTIVATED_ON_WORKSPACE',
      'USER_ACTIVATED_ON_WORKSPACE',
      'USER_EMAIL_CHANGED',
      'USER_UPDATED',
      'NEW_INVOICE',
      'INVOICE_UPDATED',
      'NEW_APPROVAL_REQUEST',
      'APPROVAL_REQUEST_STATUS_UPDATED',
      'TIME_OFF_REQUESTED',
      'TIME_OFF_REQUEST_UPDATED',
      'TIME_OFF_REQUEST_APPROVED',
      'TIME_OFF_REQUEST_REJECTED',
      'TIME_OFF_REQUEST_STARTED',
      'TIME_OFF_REQUEST_WITHDRAWN',
      'BALANCE_UPDATED',
      'TAG_UPDATED',
      'TAG_DELETED',
      'TASK_UPDATED',
      'CLIENT_UPDATED',
      'TASK_DELETED',
      'CLIENT_DELETED',
      'EXPENSE_RESTORED',
      'ASSIGNMENT_CREATED',
      'ASSIGNMENT_DELETED',
      'ASSIGNMENT_PUBLISHED',
      'ASSIGNMENT_UPDATED',
      'EXPENSE_CREATED',
      'EXPENSE_DELETED',
      'EXPENSE_UPDATED',
      'PROJECT_UPDATED',
      'PROJECT_DELETED',
      'USER_GROUP_CREATED',
      'USER_GROUP_UPDATED',
      'USER_GROUP_DELETED',
      'USERS_INVITED_TO_WORKSPACE',
      'LIMITED_USERS_ADDED_TO_WORKSPACE',
      'COST_RATE_UPDATED',
      'BILLABLE_RATE_UPDATED',
    ]),
  })
  .passthrough()
const WebhookLogSearchRequestV1 = z
  .object({
    from: z.string().datetime({ offset: true }),
    sortByNewest: z.boolean().default(false),
    status: z.enum(['ALL', 'SUCCEEDED', 'FAILED']),
    to: z.string().datetime({ offset: true }),
  })
  .partial()
  .passthrough()
const WebhookLogDtoV1 = z
  .object({
    id: z.string(),
    requestBody: z.string(),
    respondedAt: z.string(),
    responseBody: z.string(),
    statusCode: z.number().int(),
    webhookEventStatusId: z.string(),
    webhookId: z.string(),
  })
  .partial()
  .passthrough()
const WebhookEventStatusWithLatestLogDtoV1 = z
  .object({
    id: z.string(),
    requestBody: z.string(),
    respondedAt: z.string(),
    responseBody: z.string(),
    retryCount: z.number().int(),
    status: z.string(),
    statusCode: z.number().int(),
    webhookId: z.string(),
    webhookLogId: z.string(),
  })
  .partial()
  .passthrough()
const CompareBalanceFilter: z.ZodType<CompareBalanceFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareBreakFilter: z.ZodType<CompareBreakFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareCapacityFilter: z.ZodType<CompareCapacityFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareEndFilter: z.ZodType<CompareEndFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareOvertimeFilter: z.ZodType<CompareOvertimeFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareStartFilter: z.ZodType<CompareStartFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareUndertimeFilter: z.ZodType<CompareUndertimeFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const CompareWorkFilter: z.ZodType<CompareWorkFilter> = z
  .object({
    filtrationType: z.enum(['EXACTLY', 'LARGER_THAN', 'SMALLER_THAN']),
    value: z.string(),
  })
  .partial()
  .passthrough()
const AttendanceFilterV1: z.ZodType<AttendanceFilterV1> = z
  .object({
    balanceFilters: z.array(CompareBalanceFilter),
    breakFilters: z.array(CompareBreakFilter),
    capacityFilters: z.array(CompareCapacityFilter),
    endFilters: z.array(CompareEndFilter),
    groups: z.array(z.string()),
    hasTimeOff: z.boolean(),
    overtimeFilters: z.array(CompareOvertimeFilter),
    page: z.number().int().gte(1).default(1),
    pageSize: z.number().int().gte(1),
    sortColumn: z.enum([
      'GROUP',
      'USER',
      'DATE',
      'START',
      'END',
      'BREAK',
      'WORK',
      'CAPACITY',
      'OVERTIME',
      'UNDERTIME',
      'BALANCE',
      'TIME_OFF',
    ]),
    startFilters: z.array(CompareStartFilter),
    undertimeFilters: z.array(CompareUndertimeFilter),
    workFilters: z.array(CompareWorkFilter),
  })
  .partial()
  .passthrough()
const ContainsArchivedFilterV1: z.ZodType<ContainsArchivedFilterV1> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']),
  })
  .partial()
  .passthrough()
const CustomFieldFilterV1: z.ZodType<CustomFieldFilterV1> = z
  .object({
    id: z.string(),
    isEmpty: z.boolean(),
    numberCondition: z.enum(['EQUAL', 'GREATER_THAN', 'LESS_THAN']),
    type: z.enum(['TXT', 'NUMBER', 'DROPDOWN_SINGLE', 'DROPDOWN_MULTIPLE', 'CHECKBOX', 'LINK']),
    value: z.object({}).partial().passthrough(),
  })
  .partial()
  .passthrough()
const AuditFilterV1: z.ZodType<AuditFilterV1> = z
  .object({
    duration: z.number().int(),
    durationShorter: z.boolean(),
    withoutProject: z.boolean(),
    withoutTask: z.boolean(),
  })
  .partial()
  .passthrough()
const DetailedOptionsV1: z.ZodType<DetailedOptionsV1> = z
  .object({ totals: z.enum(['CALCULATE', 'EXCLUDE']) })
  .partial()
  .passthrough()
const DetailedFilterV1: z.ZodType<DetailedFilterV1> = z
  .object({
    auditFilter: AuditFilterV1,
    options: DetailedOptionsV1,
    page: z.number().int(),
    pageSize: z.number().int(),
    sortColumn: z.enum(['ID', 'DESCRIPTION', 'USER', 'DURATION', 'DATE', 'ZONED_DATE', 'NATURAL', 'USER_DATE']),
  })
  .partial()
  .passthrough()
const SummaryFilterV1: z.ZodType<SummaryFilterV1> = z
  .object({
    groups: z.array(z.string()),
    sortColumn: z.enum(['GROUP', 'DURATION', 'AMOUNT', 'EARNED', 'COST', 'PROFIT']),
    summaryChartType: z.enum(['BILLABILITY', 'PROJECT']),
  })
  .partial()
  .passthrough()
const ContainsTagFilterV1: z.ZodType<ContainsTagFilterV1> = z
  .object({
    containedInTimeentry: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']),
  })
  .partial()
  .passthrough()
const ContainsTaskFilterV1: z.ZodType<ContainsTaskFilterV1> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']),
  })
  .partial()
  .passthrough()
const ContainsUsersFilterV1: z.ZodType<ContainsUsersFilterV1> = z
  .object({
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN', 'CONTAINS_ONLY']),
    ids: z.array(z.string()),
    status: z.enum(['ALL', 'ACTIVE_WITH_PENDING', 'ACTIVE', 'PENDING', 'INACTIVE']),
  })
  .partial()
  .passthrough()
const WeeklyFilterV1: z.ZodType<WeeklyFilterV1> = z
  .object({ group: z.string(), subgroup: z.string() })
  .partial()
  .passthrough()
const AttendanceReportFilterV1: z.ZodType<AttendanceReportFilterV1> = z
  .object({
    amountShown: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']).optional(),
    amounts: z.array(z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT'])).optional(),
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    archived: z.boolean().optional(),
    attendanceFilter: AttendanceFilterV1,
    billable: z.boolean().optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    customFields: z.array(CustomFieldFilterV1).optional(),
    dateFormat: z.string().optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    description: z.string().optional(),
    detailedFilter: DetailedFilterV1.optional(),
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    rounding: z.boolean().optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    summaryFilter: SummaryFilterV1.optional(),
    tags: ContainsTagFilterV1.optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeFormat: z.string().optional(),
    timeZone: z.string().optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyFilter: WeeklyFilterV1.optional(),
    withoutDescription: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const DetailedReportFilterV1: z.ZodType<DetailedReportFilterV1> = z
  .object({
    amountShown: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']).optional(),
    amounts: z.array(z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT'])).optional(),
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    archived: z.boolean().optional(),
    attendanceFilter: AttendanceFilterV1.optional(),
    billable: z.boolean().optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    customFields: z.array(CustomFieldFilterV1).optional(),
    dateFormat: z.string().optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    description: z.string().optional(),
    detailedFilter: DetailedFilterV1,
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    rounding: z.boolean().optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    summaryFilter: SummaryFilterV1.optional(),
    tags: ContainsTagFilterV1.optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeFormat: z.string().optional(),
    timeZone: z.string().optional(),
    userCustomFields: z.array(CustomFieldFilterV1).optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyFilter: WeeklyFilterV1.optional(),
    withoutDescription: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const ExpenseReportFilterV1: z.ZodType<ExpenseReportFilterV1> = z
  .object({
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    billable: z.boolean().optional(),
    categories: ContainsArchivedFilterV1.optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    note: z.string().optional(),
    page: z.number().int().gte(1).optional(),
    pageSize: z.number().int().gte(1).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    sortColumn: z.enum(['ID', 'PROJECT', 'USER', 'CATEGORY', 'DATE', 'AMOUNT']).optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeZone: z.string().optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    withoutNote: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const invoicingInfo: z.ZodType<invoicingInfo> = z
  .object({ invoiceId: z.string(), manuallyInvoiced: z.boolean() })
  .partial()
  .passthrough()
const ExpenseReportDtoV1: z.ZodType<ExpenseReportDtoV1> = z
  .object({
    amount: z.number(),
    approvalRequestId: z.string(),
    billable: z.boolean(),
    categoryHasUnitPrice: z.boolean(),
    categoryId: z.string(),
    categoryName: z.string(),
    categoryUnit: z.string(),
    date: z.string(),
    exportFields: z.array(
      z.enum([
        'PROJECT',
        'CLIENT',
        'TASK',
        'DESCRIPTION',
        'USER',
        'TAGS',
        'START_DATE',
        'START_TIME',
        'END_TIME',
        'DURATION',
        'BILLABLE_AMOUNT',
        'COST_AMOUNT',
        'PROFIT',
        'EMAIL',
        'BILLABLE',
        'BILLABLE_H',
        'NON_BILLABLE_H',
        'END_DATE',
        'DECIMAL_DURATION',
        'BILLABLE_RATE',
        'COST_RATE',
        'APPROVAL',
        'APPROVAL_SUBMISSION_DATE',
        'APPROVAL_SUBMISSION_TIME',
        'APPROVAL_DATE',
        'APPROVAL_TIME',
        'BAR_CHART',
        'PIE_CHART_1',
        'PIE_CHART_2',
        'PIE_CHART_3',
        'RTL',
        'TOTAL',
        'SUBGROUP',
        'GROUP',
        'DATE',
        'TIME',
        'CATEGORY',
        'NOTE',
        'AMOUNT',
        'INVOICED',
        'INVOICE_ID',
        'CATEGORY_NO_OF_UNITS',
        'CATEGORY_UNIT',
        'KIOSK',
        'KIOSK_QR_CODE',
        'TYPE',
        'BREAK',
        'NOTES',
        'BILLABLE_TOTAL',
        'RECEIPTS',
        'EXPENSE_TOTAL',
        'DATE_OF_CREATION',
        'DATE_OF_APPROVAL',
        'NAME',
        'ROLE',
        'PROJECTS',
        'STATUS',
        'WEEK_START',
        'WORKING_DAYS',
        'TEAM_MANAGERS',
        'TEAM_MEMBERS',
        'DAILY_WORK_CAPACITY',
        'VISIBILITY',
        'BILLABILITY',
        'TASKS',
        'TRACKED_H',
        'ESTIMATED_H',
        'REMAINING_H',
        'OVERAGE_H',
        'TRACKED_BUDGET',
        'ESTIMATED_BUDGET',
        'REMAINING_BUDGET',
        'OVERAGE_BUDGET',
        'PROGRESS',
        'RECURRING_ESTIMATE',
        'EXPENSES',
        'BILLABLE_EXPENSES',
        'NON_BILLABLE_EXPENSES',
        'ADDITIONAL_FIELDS',
        'PROJECT_MEMBERS',
        'PROJECT_MANAGER',
        'APPROVED_BY',
        'ISSUE_DATE',
        'DUE_ON',
        'BALANCE',
      ]),
    ),
    fileId: z.string(),
    fileName: z.string(),
    id: z.string(),
    invoicingInfo: invoicingInfo,
    locked: z.boolean(),
    notes: z.string(),
    projectColor: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    quantity: z.number(),
    reportName: z.string(),
    time: z.string(),
    userEmail: z.string(),
    userId: z.string(),
    userName: z.string(),
    userStatus: z.string(),
    workspaceId: z.string(),
  })
  .partial()
  .passthrough()
const ExpenseTotalsDtoV1: z.ZodType<ExpenseTotalsDtoV1> = z
  .object({
    expensesCount: z.number().int(),
    totalAmount: z.number(),
    totalAmountBillable: z.number(),
  })
  .partial()
  .passthrough()
const ExpenseDetailedReportDtoV1: z.ZodType<ExpenseDetailedReportDtoV1> = z
  .object({ expenses: z.array(ExpenseReportDtoV1), totals: ExpenseTotalsDtoV1 })
  .partial()
  .passthrough()
const SummaryReportFilterV1: z.ZodType<SummaryReportFilterV1> = z
  .object({
    amountShown: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']).optional(),
    amounts: z.array(z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT'])).optional(),
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    archived: z.boolean().optional(),
    attendanceFilter: AttendanceFilterV1.optional(),
    billable: z.boolean().optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    customFields: z.array(CustomFieldFilterV1).optional(),
    dateFormat: z.string().optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    description: z.string().optional(),
    detailedFilter: DetailedFilterV1.optional(),
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    rounding: z.boolean().optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    summaryFilter: SummaryFilterV1,
    tags: ContainsTagFilterV1.optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeFormat: z.string().optional(),
    timeZone: z.string().optional(),
    userCustomFields: z.array(CustomFieldFilterV1).optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyFilter: WeeklyFilterV1.optional(),
    withoutDescription: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const WeeklyReportFilterV1: z.ZodType<WeeklyReportFilterV1> = z
  .object({
    amountShown: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']).optional(),
    amounts: z.array(z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT'])).optional(),
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    archived: z.boolean().optional(),
    attendanceFilter: AttendanceFilterV1.optional(),
    billable: z.boolean().optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    customFields: z.array(CustomFieldFilterV1).optional(),
    dateFormat: z.string().optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    description: z.string().optional(),
    detailedFilter: DetailedFilterV1.optional(),
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    rounding: z.boolean().optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    summaryFilter: SummaryFilterV1.optional(),
    tags: ContainsTagFilterV1.optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeFormat: z.string().optional(),
    timeZone: z.string().optional(),
    userCustomFields: z.array(CustomFieldFilterV1).optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyFilter: WeeklyFilterV1,
    withoutDescription: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const ReportFilterV1: z.ZodType<ReportFilterV1> = z
  .object({
    amountShown: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']).optional(),
    amounts: z.array(z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT'])).optional(),
    approvalState: z.enum(['APPROVED', 'UNAPPROVED', 'ALL']).optional(),
    archived: z.boolean().optional(),
    attendanceFilter: AttendanceFilterV1.optional(),
    billable: z.boolean().optional(),
    clients: ContainsArchivedFilterV1.optional(),
    currency: ContainsArchivedFilterV1.optional(),
    customFields: z.array(CustomFieldFilterV1).optional(),
    dateFormat: z.string().optional(),
    dateRangeEnd: z.string().min(1),
    dateRangeStart: z.string().min(1),
    dateRangeType: z
      .enum([
        'ABSOLUTE',
        'TODAY',
        'YESTERDAY',
        'THIS_WEEK',
        'LAST_WEEK',
        'PAST_TWO_WEEKS',
        'THIS_MONTH',
        'LAST_MONTH',
        'THIS_YEAR',
        'LAST_YEAR',
      ])
      .optional(),
    description: z.string().optional(),
    detailedFilter: DetailedFilterV1.optional(),
    exportType: z.enum(['JSON', 'JSON_V1', 'PDF', 'CSV', 'XLSX', 'ZIP']).optional(),
    invoicingState: z.enum(['INVOICED', 'UNINVOICED', 'ALL']).optional(),
    projects: ContainsArchivedFilterV1.optional(),
    rounding: z.boolean().optional(),
    sortOrder: z.enum(['ASCENDING', 'DESCENDING']).optional(),
    summaryFilter: SummaryFilterV1.optional(),
    tags: ContainsTagFilterV1.optional(),
    tasks: ContainsTaskFilterV1.optional(),
    timeFormat: z.string().optional(),
    timeZone: z.string().optional(),
    userCustomFields: z.array(CustomFieldFilterV1).optional(),
    userGroups: ContainsUsersFilterV1.optional(),
    userLocale: z.string().optional(),
    users: ContainsUsersFilterV1.optional(),
    weekStart: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']).optional(),
    weeklyFilter: WeeklyFilterV1.optional(),
    withoutDescription: z.boolean().optional(),
    zoomLevel: z.enum(['WEEK', 'MONTH', 'YEAR']).optional(),
  })
  .passthrough()
const SharedReportRequestV1: z.ZodType<SharedReportRequestV1> = z
  .object({
    filter: ReportFilterV1,
    fixedDate: z.boolean(),
    isPublic: z.boolean(),
    name: z.string(),
    type: z.enum([
      'DETAILED',
      'WEEKLY',
      'SUMMARY',
      'SCHEDULED',
      'EXPENSE_DETAILED',
      'EXPENSE_RECEIPT',
      'PTO_REQUESTS',
      'PTO_BALANCE',
      'ATTENDANCE',
      'INVOICE_EXPENSE',
      'INVOICE_TIME',
      'PROJECT',
      'TEAM_FULL',
      'TEAM_LIMITED',
      'TEAM_GROUPS',
      'INVOICES',
      'KIOSK_PIN_LIST',
      'KIOSK_ASSIGNEES',
      'USER_DATA_EXPORT',
    ]),
    visibleToUserGroups: z.array(z.string()),
    visibleToUsers: z.array(z.string()),
  })
  .partial()
  .passthrough()
const UpdateSharedReportRequestV1 = z
  .object({
    fixedDate: z.boolean().optional(),
    isPublic: z.boolean().optional(),
    name: z.string(),
    visibleToUserGroups: z.array(z.string()).optional(),
    visibleToUsers: z.array(z.string()).optional(),
  })
  .passthrough()
const authors: z.ZodType<authors> = z
  .object({
    authorIds: z.array(z.string().default('')).default(null),
    contains: z.enum(['CONTAINS', 'DOES_NOT_CONTAIN']).default(''),
  })
  .passthrough()
const AuditLogGetRequestV1: z.ZodType<AuditLogGetRequestV1> = z
  .object({
    actions: z
      .array(
        z
          .enum([
            'CREATE_TIME_PERSONAL_TIMER',
            'CREATE_TIME_PERSONAL_MANUAL',
            'CREATE_TIME_IMPORT',
            'CREATE_TIME_KIOSK',
            'CREATE_TIME_FOR_OTHER',
            'RESTORE_TIME',
            'RESTORE_TIME_FOR_OTHER',
            'UPDATE_TIME_PERSONAL',
            'UPDATE_TIME_FOR_OTHER',
            'DELETE_TIME_PERSONAL',
            'DELETE_TIME_FOR_OTHER',
            'CREATE_PROJECT',
            'CREATE_PROJECT_IMPORT',
            'CREATE_PROJECT_QUICKBOOKS',
            'UPDATE_PROJECT',
            'DELETE_PROJECT',
            'CREATE_TASK',
            'CREATE_TASK_IMPORT',
            'UPDATE_TASK',
            'DELETE_TASK',
            'CREATE_CLIENT',
            'CREATE_CLIENT_IMPORT',
            'CREATE_CLIENT_QUICKBOOKS',
            'UPDATE_CLIENT',
            'DELETE_CLIENT',
            'CREATE_TAG',
            'CREATE_TAG_IMPORT',
            'UPDATE_TAG',
            'DELETE_TAG',
            'CREATE_EXPENSE',
            'CREATE_EXPENSE_FOR_OTHER',
            'RESTORE_EXPENSE',
            'RESTORE_EXPENSE_FOR_OTHER',
            'UPDATE_EXPENSE',
            'UPDATE_EXPENSE_FOR_OTHER',
            'DELETE_EXPENSE',
            'DELETE_EXPENSE_FOR_OTHER',
          ])
          .default(''),
      )
      .min(1)
      .default(null),
    authors: authors.default(null),
    end: z.string().default(''),
    page: z.number().int().gte(0).optional().default(1),
    'page-size': z.number().int().gte(1).lte(50).optional().default(20),
    start: z.string().default(''),
  })
  .passthrough()
const AuditLogDtoV1: z.ZodType<AuditLogDtoV1> = z
  .object({
    action: z
      .enum([
        'CREATE_TIME_PERSONAL_TIMER',
        'CREATE_TIME_PERSONAL_MANUAL',
        'CREATE_TIME_IMPORT',
        'CREATE_TIME_KIOSK',
        'CREATE_TIME_FOR_OTHER',
        'RESTORE_TIME',
        'RESTORE_TIME_FOR_OTHER',
        'UPDATE_TIME_PERSONAL',
        'UPDATE_TIME_FOR_OTHER',
        'DELETE_TIME_PERSONAL',
        'DELETE_TIME_FOR_OTHER',
        'CREATE_PROJECT',
        'CREATE_PROJECT_IMPORT',
        'CREATE_PROJECT_QUICKBOOKS',
        'UPDATE_PROJECT',
        'DELETE_PROJECT',
        'CREATE_TASK',
        'CREATE_TASK_IMPORT',
        'UPDATE_TASK',
        'DELETE_TASK',
        'CREATE_CLIENT',
        'CREATE_CLIENT_IMPORT',
        'CREATE_CLIENT_QUICKBOOKS',
        'UPDATE_CLIENT',
        'DELETE_CLIENT',
        'CREATE_TAG',
        'CREATE_TAG_IMPORT',
        'UPDATE_TAG',
        'DELETE_TAG',
        'CREATE_EXPENSE',
        'CREATE_EXPENSE_FOR_OTHER',
        'RESTORE_EXPENSE',
        'RESTORE_EXPENSE_FOR_OTHER',
        'UPDATE_EXPENSE',
        'UPDATE_EXPENSE_FOR_OTHER',
        'DELETE_EXPENSE',
        'DELETE_EXPENSE_FOR_OTHER',
      ])
      .default(''),
    content: z.string().default(''),
    previousContent: z.string().default(''),
    timestamp: z.string().default(''),
    userEmail: z.string().default(''),
    userId: z.string().default(''),
    userName: z.string().default(''),
    workspaceId: z.string().default(''),
  })
  .partial()
  .passthrough()
const PageableV1ListAuditLogDtoV1: z.ZodType<PageableV1ListAuditLogDtoV1> = z
  .object({ response: z.array(AuditLogDtoV1) })
  .partial()
  .passthrough()

export const schemas = {
  UploadFileResponseV1,
  CustomFieldType,
  UserCustomFieldValueDtoV1,
  RateDtoV1,
  HourlyRateDtoV1,
  MembershipDtoV1,
  SummaryReportSettingsDtoV1,
  UserSettingsDtoV1,
  AccountStatus,
  UserDtoV1,
  CurrencyWithDefaultInfoDtoV1,
  FeaturePlan,
  Feature,
  WorkspaceSubdomainDtoV1,
  AutomaticLockDtoV1,
  EntityCreationPermission,
  EntityCreationPermissionsDtoV1,
  RoundDto,
  WorkspaceSettingsDtoV1,
  WorkspaceDtoV1,
  CreateWorkspaceRequestV1,
  WebhookEventTriggerSourceType,
  WebhookEventType,
  WebhookDtoV1,
  WebhooksDtoV1,
  ApprovalRequestCreatorDtoV1,
  DateRangeDto,
  ApprovalRequestOwnerDtoV1,
  ApprovalRequestStatusDtoV1,
  ApprovalRequestDtoV1,
  RateDto,
  CustomFieldValueDto,
  ProjectInfoDto,
  TagDto,
  TaskInfoDto,
  TimeIntervalDto,
  TimeEntryInfoDto,
  ExpenseCategoryDto,
  ExpenseHydratedDto,
  ApprovalDetailsDtoV1,
  CreateApprovalRequest,
  UpdateApprovalRequest,
  ClientWithCurrencyDtoV1,
  CreateClientRequestV1,
  ClientDtoV1,
  UpdateClientRequestV1,
  CostRateRequestV1,
  CustomFieldDefaultValuesDtoV1,
  CustomFieldDtoV1,
  CustomFieldRequestV1,
  UpdateCustomFieldRequestV1,
  LogBinDocumentDto,
  PageableCollectionLogBinDocumentDto,
  ExpenseDailyTotalsDtoV1,
  ExpenseHydratedDtoV1,
  ExpensesWithCountDtoV1,
  ExpenseWeeklyTotalsDtoV1,
  ExpensesAndTotalsDtoV1,
  CreateExpenseV1Request,
  ExpenseDtoV1,
  ExpenseCategoryDtoV1,
  ExpenseCategoriesWithCountDtoV1,
  ExpenseCategoryV1Request,
  ExpenseCategoryArchiveV1Request,
  UpdateExpenseV1Request,
  DatePeriod,
  HolidayDtoV1,
  DefaultEntitiesRequest,
  AutomaticTimeEntryCreationRequest,
  DatePeriodRequest,
  UserGroupIdsSchema,
  UserIdsSchema,
  CreateHolidayRequestV1,
  DefaultEntitiesDto,
  AutomaticTimeEntryCreationDto,
  EntityIdNameDto,
  HolidayDto,
  ContainsUserGroupFilterRequest,
  ContainsUsersFilterRequestForHoliday,
  UpdateHolidayRequestV1,
  RateWithCurrencyRequestV1,
  InvoiceDtoV1,
  InvoicesListDtoV1,
  CreateInvoiceRequest,
  CreateInvoiceDtoV1,
  ContainsArchivedFilterRequest,
  BaseFilterRequest,
  TimeRangeRequestDtoV1,
  InvoiceFilterRequestV1,
  VisibleZeroFieldsInvoice,
  InvoiceInfoV1,
  InvoiceInfoResponseDtoV1,
  InvoiceDefaultSettingsDto,
  InvoiceExportFields,
  LabelsCustomization,
  InvoiceSettingsDtoV1,
  InvoiceDefaultSettingsRequestV1,
  InvoiceExportFieldsRequest,
  LabelsCustomizationRequest,
  UpdateInvoiceSettingsRequestV1,
  CalculationType,
  ApplyTaxes,
  InvoiceItemDto,
  TaxType,
  InvoiceOverviewDtoV1,
  UpdateInvoiceRequestV1,
  CreateInvoiceItemRequestV1,
  ImportTimeEntriesAndExpensesRequestV1,
  InvoicePaymentDtoV1,
  CreateInvoicePaymentRequest,
  ChangeInvoiceStatusRequestV1,
  UpsertUserCustomFieldRequest,
  LimitedUserRequest,
  AddLimitedUsersRequest,
  UserCustomFieldValueFullDtoV1,
  MemberProfileDtoV1,
  MemberProfileFullRequestV1,
  EstimateWithOptionsDto,
  EstimateDtoV1,
  TimeEstimateDto,
  ProjectDtoV1,
  EstimateRequest,
  HourlyRateRequestV1,
  HourlyRateRequest,
  MembershipRequest,
  CostRateRequest,
  TaskRequest,
  ProjectRequest,
  EstimateResetDto,
  ProjectDtoImplV1,
  CreateProjectFromTemplateV1,
  UpdateProjectRequest,
  CustomFieldProjectDefaultValuesRequest,
  EstimateWithOptionsRequest,
  EstimateResetRequest,
  TimeEstimateRequest,
  ProjectEstimateRequest,
  UserIdWithRatesRequest,
  UpdateProjectMembershipsRequest,
  AddUsersToProjectRequestV1,
  TaskStatus,
  TaskDtoV1,
  TaskRequestV1,
  UpdateTaskRequest,
  PatchProjectTemplateRequest,
  AssignmentHydratedDtoV1,
  ProjectTotalsRequestV1,
  AssignmentPerDayDto,
  MilestoneDto,
  SchedulingProjectsTotalsDtoV1,
  ContainsUsersFilterRequestV1,
  ContainsUserGroupFilterRequestV1,
  PublishAssignmentsRequestV1,
  CreateRecurringAssignmentRequestV1,
  AssignmentCreateRequestV1,
  SchedulingExcludeDay,
  RecurringAssignmentDto,
  AssignmentDtoV1,
  AssignmentUpdateRequestV1,
  RecurringAssignmentRequestV1,
  GetUserTotalsRequestV1,
  TotalsPerDayDto,
  SchedulingUsersTotalsDtoV1,
  CopyAssignmentRequestV1,
  TagDtoV1,
  TagRequest,
  UpdateTagRequest,
  CreateCustomAttributeRequest,
  UpdateCustomFieldRequest,
  CreateTimeEntryRequest,
  CustomFieldValueDtoV1,
  TimeIntervalDtoV1,
  TimeEntryDtoImplV1,
  TimeEntryId,
  UpdateInvoicedStatusRequest,
  TimeEntryWithRatesDtoV1,
  UpdateTimeEntryRequest,
  UpdateBalanceRequestV1,
  PolicyApprovalDto,
  AutomaticAccrualDto,
  NegativeBalanceDto,
  PolicyDtoV1,
  AutomaticAccrualRequest,
  NegativeBalanceRequest,
  CreatePolicyRequestV1,
  ChangePolicyStatusRequestV1,
  UpdatePolicyRequestV1,
  PeriodV1Request,
  TimeOffRequestPeriodV1Request,
  CreateTimeOffRequestV1Request,
  TimeOffRequestStatus,
  Period,
  TimeOffRequestPeriodDto,
  TimeOffRequestFullV1Dto,
  TimeOffRequestV1Dto,
  StatusTimeOffRequestV1Request,
  GetTimeOffRequestsV1Request,
  TimeOffRequestsWithCountV1Dto,
  UserRedactedDtoV1,
  UserGroupDtoV1,
  UserGroupRequest,
  UpdateUserGroupRequest,
  UserGroupUserRequest,
  StopTimeEntryRequest,
  UpdateTimeEntryBulkRequest,
  TimeEntryDtoV1,
  AddUserToWorkspaceRequest,
  GetUsersRequestV1,
  UpdateUserStatusRequest,
  UpsertUserCustomFieldRequestV1,
  RoleRequestV1,
  AuthorizationSourceDtoV1,
  RoleDtoV1,
  RoleDetailsDtoV1,
  CreateWebhookRequestV1,
  UpdateWebhookRequestV1,
  WebhookLogSearchRequestV1,
  WebhookLogDtoV1,
  WebhookEventStatusWithLatestLogDtoV1,
  CompareBalanceFilter,
  CompareBreakFilter,
  CompareCapacityFilter,
  CompareEndFilter,
  CompareOvertimeFilter,
  CompareStartFilter,
  CompareUndertimeFilter,
  CompareWorkFilter,
  AttendanceFilterV1,
  ContainsArchivedFilterV1,
  CustomFieldFilterV1,
  AuditFilterV1,
  DetailedOptionsV1,
  DetailedFilterV1,
  SummaryFilterV1,
  ContainsTagFilterV1,
  ContainsTaskFilterV1,
  ContainsUsersFilterV1,
  WeeklyFilterV1,
  AttendanceReportFilterV1,
  DetailedReportFilterV1,
  ExpenseReportFilterV1,
  invoicingInfo,
  ExpenseReportDtoV1,
  ExpenseTotalsDtoV1,
  ExpenseDetailedReportDtoV1,
  SummaryReportFilterV1,
  WeeklyReportFilterV1,
  ReportFilterV1,
  SharedReportRequestV1,
  UpdateSharedReportRequestV1,
  authors,
  AuditLogGetRequestV1,
  AuditLogDtoV1,
  PageableV1ListAuditLogDtoV1,
}

const endpoints = makeApi([
  {
    method: 'post',
    path: '/v1/file/image',
    alias: 'uploadImage',
    requestFormat: 'form-data',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ file: z.instanceof(File) }).passthrough(),
      },
    ],
    response: UploadFileResponseV1,
  },
  {
    method: 'get',
    path: '/v1/shared-reports/:id',
    alias: 'generateSharedReportV1',
    description: `Response depends on report type and export type. Given example is for SUMMARY report and JSON exportType.

Shared report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'dateRangeStart',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'dateRangeEnd',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sortOrder',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sortColumn',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'exportType',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional(),
      },
      {
        name: 'pageSize',
        type: 'Query',
        schema: z.number().int().optional(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/user',
    alias: 'getLoggedUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'include-memberships',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
    ],
    response: UserDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces',
    alias: 'getWorkspacesOfUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'roles',
        type: 'Query',
        schema: z.enum(['WORKSPACE_ADMIN', 'OWNER', 'TEAM_MANAGER', 'PROJECT_MANAGER']).optional(),
      },
    ],
    response: z.array(WorkspaceDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces',
    alias: 'createWorkspace',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateWorkspaceRequestV1,
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId',
    alias: 'getWorkspaceOfUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/addons/:addonId/webhooks',
    alias: 'getAddonWebhooks',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'addonId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WebhooksDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/approval-requests',
    alias: 'getApprovalRequests',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['PENDING', 'APPROVED', 'WITHDRAWN_APPROVAL']).optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'USER_ID', 'START', 'UPDATED_AT']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
    ],
    response: z.array(ApprovalDetailsDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/approval-requests',
    alias: 'createApprrovalRequest',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateApprovalRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ApprovalRequestDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/approval-requests/:approvalRequestId',
    alias: 'updateApprovalStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateApprovalRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'approvalRequestId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ApprovalRequestDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/approval-requests/resubmit-entries-for-approval',
    alias: 'resubmitApprovalRequest',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateApprovalRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/approval-requests/users/:userId',
    alias: 'createApprovalForOther',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateApprovalRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ApprovalRequestDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/approval-requests/users/:userId/resubmit-entries-for-approval',
    alias: 'resubmitApprovalRequestForOther',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateApprovalRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/audit-log',
    alias: 'getAuditLogs',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AuditLogGetRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string().default(''),
      },
    ],
    response: PageableV1ListAuditLogDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/clients',
    alias: 'getClients',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.string().optional().default('NAME'),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'archived',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: z.array(ClientWithCurrencyDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/clients',
    alias: 'createClient',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateClientRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ClientWithCurrencyDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/clients/:id',
    alias: 'deleteClient',
    requestFormat: 'json',
    parameters: [
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ClientDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/clients/:id',
    alias: 'getClient',
    requestFormat: 'json',
    parameters: [
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ClientWithCurrencyDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/clients/:id',
    alias: 'updateClient',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateClientRequestV1,
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'archive-projects',
        type: 'Query',
        schema: z.boolean().optional(),
      },
      {
        name: 'mark-tasks-as-done',
        type: 'Query',
        schema: z.boolean().optional(),
      },
    ],
    response: ClientDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/cost-rate',
    alias: 'setWorkspaceCostRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CostRateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/custom-fields',
    alias: 'ofWorkspace',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['INACTIVE', 'VISIBLE', 'INVISIBLE']).optional(),
      },
      {
        name: 'entity-type',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: z.array(CustomFieldDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/custom-fields',
    alias: 'create',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CustomFieldRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/custom-fields/:customFieldId',
    alias: 'delete',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'customFieldId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/custom-fields/:customFieldId',
    alias: 'editCustomField',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateCustomFieldRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'customFieldId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: CustomFieldDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/entities/created',
    alias: 'getCreatedEntityInfo',
    description: `Retrieves records from the database collection that were created within a specified date range.
The date range is determined by two parameters: start and end.  `,
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'type',
        type: 'Query',
        schema: z.array(z.string()),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.string().optional().default('0'),
      },
      {
        name: 'limit',
        type: 'Query',
        schema: z.string().optional().default('50'),
      },
    ],
    response: z.string(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/entities/deleted',
    alias: 'getDeletedEntityInfo',
    description: `Retrieves a list of record(s) that were deleted within a specified date range.
The date range is determined by the two parameters start and end.

&gt; ### 💡 Note
&gt; Deleted entities will be updated and reflected in this endpoint approximately one minute after the deletion occurs. Also, entities that are created and deleted within the request date range will not appear in the /deleted endpoint. `,
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'type',
        type: 'Query',
        schema: z.array(z.string()),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.string().optional().default('0'),
      },
      {
        name: 'limit',
        type: 'Query',
        schema: z.string().optional().default('50'),
      },
    ],
    response: PageableCollectionLogBinDocumentDto,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/entities/updated',
    alias: 'getUpdatedEntityInfo',
    description: `Retrieves records that were updated within the specified date range.
The date range is determined by the two parameters: start and end.

&gt; ### 💡 Note
&gt; If an entity is both created and updated within the requested date range, it will be excluded from the /updated endpoint results.  `,
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'type',
        type: 'Query',
        schema: z.array(z.string()),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.string().optional().default('0'),
      },
      {
        name: 'limit',
        type: 'Query',
        schema: z.string().optional().default('50'),
      },
    ],
    response: z.string(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/expenses',
    alias: 'getExpenses',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'user-id',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: ExpensesAndTotalsDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/expenses',
    alias: 'createExpense',
    requestFormat: 'form-data',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateExpenseV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/expenses/:expenseId',
    alias: 'deleteExpense',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'expenseId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/expenses/:expenseId',
    alias: 'getExpense',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'expenseId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/expenses/:expenseId',
    alias: 'updateExpense',
    requestFormat: 'form-data',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateExpenseV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'expenseId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/expenses/:expenseId/files/:fileId',
    alias: 'downloadFile',
    requestFormat: 'json',
    parameters: [
      {
        name: 'fileId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'expenseId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/expenses/categories',
    alias: 'getCategories',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.literal('NAME').optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'archived',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: ExpenseCategoriesWithCountDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/expenses/categories',
    alias: 'createExpenseCategory',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ExpenseCategoryV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseCategoryDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/expenses/categories/:categoryId',
    alias: 'deleteCategory',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'categoryId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/expenses/categories/:categoryId',
    alias: 'updateCategory',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ExpenseCategoryV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'categoryId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseCategoryDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/expenses/categories/:categoryId/status',
    alias: 'updateExpenseCategoryStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ archived: z.boolean().default(false) })
          .partial()
          .passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'categoryId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseCategoryDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/holidays',
    alias: 'getHolidays',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assigned-to',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: z.array(HolidayDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/holidays',
    alias: 'createHoliday',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateHolidayRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: HolidayDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/holidays/:holidayId',
    alias: 'deleteHoliday',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'holidayId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: HolidayDto,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/holidays/:holidayId',
    alias: 'updateHoliday',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateHolidayRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'holidayId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: HolidayDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/holidays/in-period',
    alias: 'getHolidaysInPeriod',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assigned-to',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string(),
      },
    ],
    response: z.array(HolidayDtoV1),
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/hourly-rate',
    alias: 'setWorkspaceHourlyRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: RateWithCurrencyRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/invoices',
    alias: 'getInvoices',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'statuses',
        type: 'Query',
        schema: z.enum(['UNSENT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'VOID', 'OVERDUE']).optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'CLIENT', 'DUE_ON', 'ISSUE_DATE', 'AMOUNT', 'BALANCE']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
    ],
    response: InvoicesListDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices',
    alias: 'createInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateInvoiceRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: CreateInvoiceDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId',
    alias: 'deleteInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId',
    alias: 'getInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId',
    alias: 'updateInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateInvoiceRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/duplicate',
    alias: 'duplicateInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/export',
    alias: 'exportInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userLocale',
        type: 'Query',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/items',
    alias: 'addInvoiceItem',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateInvoiceItemRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/items/:order',
    alias: 'removeInvoiceItem',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'order',
        type: 'Path',
        schema: z.number().int().gte(1),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/items/import',
    alias: 'importTimeEntriesAndExpenses',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ImportTimeEntriesAndExpensesRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/payments',
    alias: 'getPaymentsForInvoice',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
    ],
    response: z.array(InvoicePaymentDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/payments',
    alias: 'createInvoicePayment',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateInvoicePaymentRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/payments/:paymentId',
    alias: 'deletePaymentById',
    requestFormat: 'json',
    parameters: [
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'paymentId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceOverviewDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/invoices/:invoiceId/status',
    alias: 'changeInvoiceStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ChangeInvoiceStatusRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'invoiceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/invoices/info',
    alias: 'getInvoicesInfo',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: InvoiceFilterRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceInfoResponseDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/invoices/settings',
    alias: 'getInvoiceSettings',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: InvoiceSettingsDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/invoices/settings',
    alias: 'updateInvoiceSettings',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateInvoiceSettingsRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/limited-users',
    alias: 'addLimitedUsersWithInfo',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AddLimitedUsersRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/member-profile/:userId',
    alias: 'getMemberProfile',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: MemberProfileDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/member-profile/:userId',
    alias: 'updateMemberProfileWithAdditionalData',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: MemberProfileFullRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: MemberProfileDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/projects',
    alias: 'getProjects',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'strict-name-search',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'archived',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'billable',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'clients',
        type: 'Query',
        schema: z.array(z.string()).optional(),
      },
      {
        name: 'contains-client',
        type: 'Query',
        schema: z.boolean().optional().default(true),
      },
      {
        name: 'client-status',
        type: 'Query',
        schema: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(),
      },
      {
        name: 'users',
        type: 'Query',
        schema: z.array(z.string()).optional(),
      },
      {
        name: 'contains-user',
        type: 'Query',
        schema: z.boolean().optional().default(true),
      },
      {
        name: 'user-status',
        type: 'Query',
        schema: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']).optional(),
      },
      {
        name: 'is-template',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'NAME', 'CLIENT_NAME', 'DURATION', 'BUDGET', 'PROGRESS']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'hydrated',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'access',
        type: 'Query',
        schema: z.enum(['PUBLIC', 'PRIVATE']).optional(),
      },
      {
        name: 'expense-limit',
        type: 'Query',
        schema: z.number().int().optional().default(20),
      },
      {
        name: 'expense-date',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'userGroups',
        type: 'Query',
        schema: z.array(z.string()).optional(),
      },
      {
        name: 'contains-group',
        type: 'Query',
        schema: z.boolean().optional().default(true),
      },
    ],
    response: z.array(ProjectDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/projects',
    alias: 'createNewProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ProjectRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/projects/:projectId',
    alias: 'deleteProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/projects/:projectId',
    alias: 'getProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'hydrated',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'custom-field-entity-type',
        type: 'Query',
        schema: z.string().optional().default('TIMEENTRY'),
      },
      {
        name: 'expense-limit',
        type: 'Query',
        schema: z.number().int().optional().default(20),
      },
      {
        name: 'expense-date',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: ProjectDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId',
    alias: 'updateProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateProjectRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/custom-fields',
    alias: 'getCustomFieldsOfProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['INACTIVE', 'VISIBLE', 'INVISIBLE']).optional(),
      },
      {
        name: 'entity-type',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: z.array(CustomFieldDtoV1),
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/custom-fields/:customFieldId',
    alias: 'removeDefaultValueOfProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'customFieldId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: CustomFieldDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/custom-fields/:customFieldId',
    alias: 'editProjectCustomFieldDefaultValue',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CustomFieldProjectDefaultValuesRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'customFieldId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: CustomFieldDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/estimate',
    alias: 'updateEstimate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ProjectEstimateRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/memberships',
    alias: 'updateMemberships',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateProjectMembershipsRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/memberships',
    alias: 'addUsersToProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AddUsersToProjectRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks',
    alias: 'getTasks',
    requestFormat: 'json',
    parameters: [
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'strict-name-search',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'is-active',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'NAME']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
    ],
    response: z.array(TaskDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks',
    alias: 'createTask',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: TaskRequestV1,
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'contains-assignee',
        type: 'Query',
        schema: z.boolean().optional().default(true),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks/:id/cost-rate',
    alias: 'setTaskCostRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CostRateRequestV1,
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks/:id/hourly-rate',
    alias: 'setTaskHourlyRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: HourlyRateRequestV1,
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId',
    alias: 'deleteTask',
    requestFormat: 'json',
    parameters: [
      {
        name: 'taskId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId',
    alias: 'getTask',
    requestFormat: 'json',
    parameters: [
      {
        name: 'taskId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId',
    alias: 'updateTask',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateTaskRequest,
      },
      {
        name: 'taskId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'contains-assignee',
        type: 'Query',
        schema: z.boolean().optional().default(true),
      },
      {
        name: 'membership-status',
        type: 'Query',
        schema: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']).optional(),
      },
    ],
    response: TaskDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/template',
    alias: 'updateIsProjectTemplate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ isTemplate: z.boolean().default(false) })
          .partial()
          .passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/users/:userId/cost-rate',
    alias: 'addUsersCostRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CostRateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/projects/:projectId/users/:userId/hourly-rate',
    alias: 'addUsersHourlyRate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CostRateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/projects/from-template',
    alias: 'createProjectFromTemplate',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateProjectFromTemplateV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ProjectDtoImplV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/reports/attendance',
    alias: 'generateAttendanceReport',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AttendanceReportFilterV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/reports/detailed',
    alias: 'generateDetailedReport',
    description: `Detailed report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: DetailedReportFilterV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/reports/expenses/detailed',
    alias: 'generateDetailedReportV1',
    description: `Expense report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ExpenseReportFilterV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: ExpenseDetailedReportDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/reports/summary',
    alias: 'generateSummaryReport',
    description: `Summary report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: SummaryReportFilterV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/reports/weekly',
    alias: 'generateWeeklyReport',
    description: `Weekly report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: WeeklyReportFilterV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/:assignmentId/copy',
    alias: 'copyAssignment',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CopyAssignmentRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assignmentId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(AssignmentDtoV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/all',
    alias: 'getAllAssignments',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional().default(''),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['PROJECT', 'USER', 'ID']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
    ],
    response: z.array(AssignmentHydratedDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/projects/totals',
    alias: 'getFilteredProjectTotals',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ProjectTotalsRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(SchedulingProjectsTotalsDtoV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/projects/totals/:projectId',
    alias: 'getProjectTotalsForSingleProject',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'projectId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string(),
      },
    ],
    response: SchedulingProjectsTotalsDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/publish',
    alias: 'publishAssignments',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: PublishAssignmentsRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/recurring',
    alias: 'createRecurring',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AssignmentCreateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(AssignmentDtoV1),
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/recurring/:assignmentId',
    alias: 'deleteRRecurringAssignment',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assignmentId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'seriesUpdateOption',
        type: 'Query',
        schema: z.enum(['THIS_ONE', 'THIS_AND_FOLLOWING', 'ALL']).optional(),
      },
    ],
    response: z.array(AssignmentDtoV1),
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/recurring/:assignmentId',
    alias: 'editRecurring',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: AssignmentUpdateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assignmentId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(AssignmentDtoV1),
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/series/:assignmentId',
    alias: 'editRecurringPeriod',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: RecurringAssignmentRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'assignmentId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(AssignmentDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/user-filter/totals',
    alias: 'getUserTotals',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: GetUserTotalsRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(SchedulingUsersTotalsDtoV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/scheduling/assignments/users/:userId/totals',
    alias: 'getUserTotalsForSingleUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string(),
      },
    ],
    response: SchedulingUsersTotalsDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/shared-reports',
    alias: 'getSharedReportsV1',
    description: `Gets all shared reports for current user on given workspace`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'pageSize',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'sharedReportsFilter',
        type: 'Query',
        schema: z.enum(['ALL', 'ALL_ADMIN', 'CREATED_BY_ME', 'SHARED_WITH_ME']).optional().default('ALL'),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/shared-reports',
    alias: 'saveSharedReportV1',
    description: `Saves shared report with name, options and report filter.

Shared report data on FREE subscription plan is limited to a maximum interval length of one month (31 days).`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: SharedReportRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/shared-reports/:id',
    alias: 'deleteSharedReportV1',
    requestFormat: 'json',
    parameters: [
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/shared-reports/:id',
    alias: 'updateSharedReportV1',
    description: `Updates shared report name and/or options`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateSharedReportRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/tags',
    alias: 'getTags',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'strict-name-search',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'excluded-ids',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'NAME']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'archived',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
    ],
    response: z.array(TagDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/tags',
    alias: 'createNewTag',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ name: z.string().min(0).max(100) })
          .partial()
          .passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TagDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/tags/:id',
    alias: 'deleteTag',
    requestFormat: 'json',
    parameters: [
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TagDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/tags/:id',
    alias: 'getTag',
    requestFormat: 'json',
    parameters: [
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TagDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/tags/:id',
    alias: 'updateTag',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateTagRequest,
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TagDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/time-entries',
    alias: 'createTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateTimeEntryRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeEntryDtoImplV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/time-entries/:id',
    alias: 'deleteTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-entries/:id',
    alias: 'getTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'hydrated',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
    ],
    response: TimeEntryWithRatesDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/time-entries/:id',
    alias: 'updateTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateTimeEntryRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeEntryDtoImplV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/time-entries/invoiced',
    alias: 'updateInvoicedStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateInvoicedStatusRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-entries/status/in-progress',
    alias: 'getInProgressTimeEntries',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).lte(1000).optional().default(10),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-off/balance/policy/:policyId',
    alias: 'getBalancesForPolicy',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().lte(1000).optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).lte(200).optional().default(50),
      },
      {
        name: 'sort',
        type: 'Query',
        schema: z.enum(['USER', 'POLICY', 'USED', 'BALANCE', 'TOTAL']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/time-off/balance/policy/:policyId',
    alias: 'updateBalance',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateBalanceRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-off/balance/user/:userId',
    alias: 'getBalancesForUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sort',
        type: 'Query',
        schema: z.enum(['USER', 'POLICY', 'USED', 'BALANCE', 'TOTAL']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-off/policies',
    alias: 'findPoliciesForWorkspace',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).lte(200).optional().default(50),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.string().optional().default('DEFAULT_SORT'),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.string().optional().default('ASCENDING'),
      },
    ],
    response: z.array(PolicyDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/time-off/policies',
    alias: 'createPolicy',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreatePolicyRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: PolicyDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:id',
    alias: 'deletePolicy',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:id',
    alias: 'getPolicy',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: PolicyDtoV1,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:id',
    alias: 'updatePolicyStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: ChangePolicyStatusRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: PolicyDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:id',
    alias: 'updatePolicy',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdatePolicyRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: PolicyDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:policyId/requests',
    alias: 'createTimeOffRequest',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateTimeOffRequestV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeOffRequestFullV1Dto,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:policyId/requests/:requestId',
    alias: 'deleteTimeOffRequest',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'requestId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeOffRequestV1Dto,
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:policyId/requests/:requestId',
    alias: 'changeTimeOffRequestStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: StatusTimeOffRequestV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'requestId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeOffRequestV1Dto,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/time-off/policies/:policyId/users/:userId/requests',
    alias: 'createTimeOffRequestForOther',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateTimeOffRequestV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'policyId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeOffRequestFullV1Dto,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/time-off/requests',
    alias: 'getTimeOffRequest',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: GetTimeOffRequestsV1Request,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeOffRequestsWithCountV1Dto,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/user-groups',
    alias: 'getUserGroups',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'project-id',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'NAME']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'includeTeamManagers',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
    ],
    response: z.array(UserGroupDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/user-groups',
    alias: 'createUserGroup',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ name: z.string().min(0).max(100) })
          .partial()
          .passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserGroupDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/user-groups/:id',
    alias: 'deleteUserGroup',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserGroupDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/user-groups/:id',
    alias: 'updateUserGroup',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ name: z.string().min(0).max(100) })
          .partial()
          .passthrough(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserGroupDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/user-groups/:userGroupId/users',
    alias: 'addUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ userId: z.string() }).passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userGroupId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserGroupDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/user-groups/:userGroupId/users/:userId',
    alias: 'deleteUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userGroupId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserGroupDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries',
    alias: 'deleteMany',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'time-entry-ids',
        type: 'Query',
        schema: z.array(z.string()),
      },
    ],
    response: z.array(TimeEntryDtoImplV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries',
    alias: 'getTimeEntries',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'description',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'start',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'end',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'project',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'task',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'tags',
        type: 'Query',
        schema: z.array(z.string()).optional(),
      },
      {
        name: 'project-required',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'task-required',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'hydrated',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'in-progress',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'get-week-before',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: z.array(TimeEntryWithRatesDtoV1),
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries',
    alias: 'stopRunningTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ end: z.string().datetime({ offset: true }) }).passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeEntryDtoImplV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries',
    alias: 'createForOthers',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateTimeEntryRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'from-entry',
        type: 'Query',
        schema: z.string().optional(),
      },
    ],
    response: TimeEntryDtoImplV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries',
    alias: 'replaceMany',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.array(UpdateTimeEntryBulkRequest).min(1),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'hydrated',
        type: 'Query',
        schema: z.boolean().optional().default(false),
      },
    ],
    response: z.array(TimeEntryDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/user/:userId/time-entries/:id/duplicate',
    alias: 'duplicateTimeEntry',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'id',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: TimeEntryDtoImplV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/users',
    alias: 'getUsersOfWorkspace',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'email',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'project-id',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'status',
        type: 'Query',
        schema: z.enum(['PENDING', 'ACTIVE', 'DECLINED', 'INACTIVE', 'ALL']).optional(),
      },
      {
        name: 'account-statuses',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'name',
        type: 'Query',
        schema: z.string().optional(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'EMAIL', 'NAME', 'NAME_LOWERCASE', 'ACCESS', 'HOURLYRATE', 'COSTRATE']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'memberships',
        type: 'Query',
        schema: z.enum(['ALL', 'NONE', 'WORKSPACE', 'PROJECT', 'USERGROUP']).optional(),
      },
      {
        name: 'include-roles',
        type: 'Query',
        schema: z.string().default('false'),
      },
    ],
    response: z.array(UserDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/users',
    alias: 'addUsers',
    description: `You can add users to a workspace via API only if that workspace has a paid subscription. If the workspace has a paid subscription, you can add as many users as you want but you are limited by the number of paid user seats on that workspace.`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({ email: z.string().min(1) }).passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'send-email',
        type: 'Query',
        schema: z.string().default('true'),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/users/:userId',
    alias: 'updateUserStatus',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateUserStatusRequest,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/users/:userId/cost-rate',
    alias: 'setCostRateForUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CostRateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/users/:userId/custom-field/:customFieldId/value',
    alias: 'upsertUserCustomFieldValue',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z
          .object({ value: z.object({}).partial().passthrough() })
          .partial()
          .passthrough(),
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'customFieldId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: UserCustomFieldValueDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/users/:userId/hourly-rate',
    alias: 'setHourlyRateForUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: HourlyRateRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WorkspaceDtoV1,
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/users/:userId/managers',
    alias: 'getManagersOfUser',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'sort-column',
        type: 'Query',
        schema: z.enum(['ID', 'EMAIL', 'NAME', 'NAME_LOWERCASE', 'ACCESS', 'HOURLYRATE', 'COSTRATE']).optional(),
      },
      {
        name: 'sort-order',
        type: 'Query',
        schema: z.enum(['ASCENDING', 'DESCENDING']).optional(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(1),
      },
      {
        name: 'page-size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
    ],
    response: z.array(UserDtoV1),
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/users/:userId/roles',
    alias: 'deleteUserRole',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: RoleRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/users/:userId/roles',
    alias: 'createUserRole',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: RoleRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'userId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(RoleDetailsDtoV1),
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/users/info',
    alias: 'filterUsersOfWorkspace',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: GetUsersRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.array(UserDtoV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/webhooks',
    alias: 'getWebhooks',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'type',
        type: 'Query',
        schema: z.enum(['USER_CREATED', 'SYSTEM', 'ADDON']).optional(),
      },
    ],
    response: WebhooksDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/webhooks',
    alias: 'createWebhook',
    description: `Creating a webhook generates a new token which can be used to verify that the webhook being sent was sent by Clockify, as it will always be present in the header.`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: CreateWebhookRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WebhookDtoV1,
  },
  {
    method: 'delete',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId',
    alias: 'deleteWebhook',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: z.void(),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId',
    alias: 'getWebhook',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WebhookDtoV1,
  },
  {
    method: 'put',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId',
    alias: 'updateWebhook',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: UpdateWebhookRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WebhookDtoV1,
  },
  {
    method: 'post',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId/logs',
    alias: 'getLogsForWebhook',
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: WebhookLogSearchRequestV1,
      },
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(0),
      },
      {
        name: 'size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
    ],
    response: z.array(WebhookLogDtoV1),
  },
  {
    method: 'get',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId/statuses',
    alias: 'getWebhookEventStatusesWithLatestLog',
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'page',
        type: 'Query',
        schema: z.number().int().optional().default(0),
      },
      {
        name: 'size',
        type: 'Query',
        schema: z.number().int().gte(1).optional().default(50),
      },
      {
        name: 'statuses',
        type: 'Query',
        schema: z.enum(['SUCCEEDED', 'RETRYING', 'FAILED']).optional(),
      },
    ],
    response: z.array(WebhookEventStatusWithLatestLogDtoV1),
  },
  {
    method: 'patch',
    path: '/v1/workspaces/:workspaceId/webhooks/:webhookId/token',
    alias: 'generateNewToken',
    description: `Generates a new webhook token and invalidates previous one`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'workspaceId',
        type: 'Path',
        schema: z.string(),
      },
      {
        name: 'webhookId',
        type: 'Path',
        schema: z.string(),
      },
    ],
    response: WebhookDtoV1,
  },
])

export const api = new Zodios(endpoints)

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options)
}
