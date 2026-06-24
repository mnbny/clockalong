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

const SummaryReportChartDto: z.ZodType<SummaryReportChartDto> = z
  .object({
    earned: z.number(),
    id: z.string(),
    totalAmount: z.number(),
    totalBillableTime: z.number(),
    totalTime: z.number(),
  })
  .partial()
  .passthrough()
const DailyTotalDto: z.ZodType<DailyTotalDto> = z
  .object({ amount: z.number(), date: z.string(), duration: z.number() })
  .partial()
  .passthrough()
const GroupOneDto: z.ZodType<GroupOneDto> = z.lazy(() =>
  z
    .object({
      amount: z.number(),
      children: z.array(GroupOneDto),
      clientName: z.string(),
      days: z.array(DailyTotalDto),
      duration: z.number(),
      id: z.string(),
      name: z.string(),
      nameLowerCase: z.string(),
    })
    .partial()
    .passthrough(),
)
const AmountDto: z.ZodType<AmountDto> = z
  .object({
    type: z.enum(['EARNED', 'COST', 'PROFIT', 'HIDE_AMOUNT', 'EXPORT']),
    value: z.number(),
  })
  .partial()
  .passthrough()
const TimeEntryReportTotals: z.ZodType<TimeEntryReportTotals> = z
  .object({
    amounts: z.array(AmountDto),
    entriesCount: z.number().int(),
    id: z.string(),
    totalBillableTime: z.number(),
    totalTime: z.number(),
  })
  .partial()
  .passthrough()
const TimeEntrySummaryReportDto: z.ZodType<TimeEntrySummaryReportDto> = z
  .object({
    chart: z.array(SummaryReportChartDto),
    groupOne: z.array(GroupOneDto),
    totals: z.array(TimeEntryReportTotals),
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
const AttendanceDto: z.ZodType<AttendanceDto> = z
  .object({
    break: z.number().int(),
    capacity: z.number().int(),
    date: z.string(),
    endTime: z.string(),
    hasRunningEntry: z.boolean(),
    imageUrl: z.string(),
    overtime: z.number().int(),
    remainingCapacity: z.number().int(),
    startTime: z.string(),
    timeOff: z.number().int(),
    totalDuration: z.number().int(),
    userId: z.string(),
    userName: z.string(),
  })
  .partial()
  .passthrough()
const AttendanceReportDtoV1: z.ZodType<AttendanceReportDtoV1> = z
  .object({ entities: z.array(AttendanceDto) })
  .partial()
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
const ReportTagDto: z.ZodType<ReportTagDto> = z.object({ id: z.string(), name: z.string() }).partial().passthrough()
const ReportTimeIntervalDto: z.ZodType<ReportTimeIntervalDto> = z
  .object({ duration: z.number().int(), end: z.string(), start: z.string() })
  .partial()
  .passthrough()
const TimeEntryDto: z.ZodType<TimeEntryDto> = z
  .object({
    approvalRequestId: z.string(),
    billable: z.boolean(),
    clientId: z.string(),
    clientName: z.string(),
    description: z.string(),
    get_id: z.string(),
    locked: z.boolean(),
    projectColor: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    tags: z.array(ReportTagDto),
    taskId: z.string(),
    taskName: z.string(),
    timeInterval: ReportTimeIntervalDto,
    userEmail: z.string(),
    userId: z.string(),
    userName: z.string(),
  })
  .partial()
  .passthrough()
const TimeEntryDetailedReportDto: z.ZodType<TimeEntryDetailedReportDto> = z
  .object({
    timeEntries: z.array(TimeEntryDto),
    totals: z.array(TimeEntryReportTotals),
  })
  .partial()
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
const UserDto: z.ZodType<UserDto> = z
  .object({
    dateFormat: z.string(),
    email: z.string(),
    id: z.string(),
    name: z.string(),
    timeFormat: z.string(),
    timeZone: z.string(),
    weekStart: z.string(),
  })
  .partial()
  .passthrough()
const TimeEntryWeeklyReportDto: z.ZodType<TimeEntryWeeklyReportDto> = z
  .object({
    decimalFormat: z.boolean(),
    groupOne: z.array(GroupOneDto),
    includeUsersWithoutTime: z.boolean(),
    totals: z.array(TimeEntryReportTotals),
    totalsByDay: z.array(DailyTotalDto),
    trackTimeDownToSeconds: z.boolean(),
    usersWithoutTime: z.array(UserDto),
  })
  .partial()
  .passthrough()
const EntityName: z.ZodType<EntityName> = z.object({ id: z.string(), name: z.string() }).partial().passthrough()
const SharedReportDtoV1: z.ZodType<SharedReportDtoV1> = z
  .object({
    fixedDate: z.boolean(),
    id: z.string(),
    isPublic: z.boolean(),
    link: z.string().url(),
    name: z.string(),
    reportAuthor: z.string(),
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
    visibleToUserGroups: z.array(EntityName),
    visibleToUsers: z.array(EntityName),
  })
  .partial()
  .passthrough()
const SharedReportsAndCountDtoV1: z.ZodType<SharedReportsAndCountDtoV1> = z
  .object({ count: z.number().int(), reports: z.array(SharedReportDtoV1) })
  .partial()
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
const SharedReportV1: z.ZodType<SharedReportV1> = z
  .object({
    filter: ReportFilterV1,
    fixedDate: z.boolean(),
    id: z.string(),
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
    userId: z.string(),
    visibleToUserGroups: z.array(z.string()),
    visibleToUsers: z.array(z.string()),
    workspaceId: z.string(),
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

export const schemas = {
  SummaryReportChartDto,
  DailyTotalDto,
  GroupOneDto,
  AmountDto,
  TimeEntryReportTotals,
  TimeEntrySummaryReportDto,
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
  AttendanceDto,
  AttendanceReportDtoV1,
  DetailedReportFilterV1,
  ReportTagDto,
  ReportTimeIntervalDto,
  TimeEntryDto,
  TimeEntryDetailedReportDto,
  ExpenseReportFilterV1,
  invoicingInfo,
  ExpenseReportDtoV1,
  ExpenseTotalsDtoV1,
  ExpenseDetailedReportDtoV1,
  SummaryReportFilterV1,
  WeeklyReportFilterV1,
  UserDto,
  TimeEntryWeeklyReportDto,
  EntityName,
  SharedReportDtoV1,
  SharedReportsAndCountDtoV1,
  ReportFilterV1,
  SharedReportRequestV1,
  SharedReportV1,
  UpdateSharedReportRequestV1,
}

const endpoints = makeApi([
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
    response: TimeEntrySummaryReportDto,
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
    response: AttendanceReportDtoV1,
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
    response: TimeEntryDetailedReportDto,
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
    response: TimeEntrySummaryReportDto,
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
    response: TimeEntryWeeklyReportDto,
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
    response: SharedReportsAndCountDtoV1,
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
    response: SharedReportV1,
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
    response: SharedReportV1,
  },
])

export const api = new Zodios(endpoints)

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options)
}
