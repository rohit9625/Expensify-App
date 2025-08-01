import {format} from 'date-fns';
import {fastMerge, Str} from 'expensify-common';
import cloneDeep from 'lodash/cloneDeep';
import {InteractionManager} from 'react-native';
import type {NullishDeep, OnyxCollection, OnyxEntry, OnyxInputValue, OnyxUpdate} from 'react-native-onyx';
import Onyx from 'react-native-onyx';
import type {PartialDeep, SetRequired, ValueOf} from 'type-fest';
import ReceiptGeneric from '@assets/images/receipt-generic.png';
import type {PaymentMethod} from '@components/KYCWall/types';
import type {SearchQueryJSON} from '@components/Search/types';
import * as API from '@libs/API';
import type {
    ApproveMoneyRequestParams,
    CategorizeTrackedExpenseParams as CategorizeTrackedExpenseApiParams,
    CompleteSplitBillParams,
    CreateDistanceRequestParams,
    CreatePerDiemRequestParams,
    CreateWorkspaceParams,
    DeleteMoneyRequestParams,
    DetachReceiptParams,
    MergeDuplicatesParams,
    PayInvoiceParams,
    PayMoneyRequestParams,
    ReopenReportParams,
    ReplaceReceiptParams,
    RequestMoneyParams,
    ResolveDuplicatesParams,
    RetractReportParams,
    SendInvoiceParams,
    SendMoneyParams,
    SetNameValuePairParams,
    ShareTrackedExpenseParams,
    SplitBillParams,
    SplitTransactionParams,
    SplitTransactionSplitsParam,
    StartSplitBillParams,
    SubmitReportParams,
    TrackExpenseParams,
    UnapproveExpenseReportParams,
    UpdateMoneyRequestParams,
} from '@libs/API/parameters';
import {WRITE_COMMANDS} from '@libs/API/types';
import {convertAmountToDisplayString, convertToDisplayString} from '@libs/CurrencyUtils';
import DateUtils from '@libs/DateUtils';
import DistanceRequestUtils from '@libs/DistanceRequestUtils';
import {getMicroSecondOnyxErrorObject, getMicroSecondOnyxErrorWithTranslationKey} from '@libs/ErrorUtils';
import {readFileAsync} from '@libs/fileDownload/FileUtils';
import GoogleTagManager from '@libs/GoogleTagManager';
import {
    calculateAmount as calculateIOUAmount,
    formatCurrentUserToAttendee,
    isMovingTransactionFromTrackExpense as isMovingTransactionFromTrackExpenseIOUUtils,
    navigateToStartMoneyRequestStep,
    updateIOUOwnerAndTotal,
} from '@libs/IOUUtils';
import isFileUploadable from '@libs/isFileUploadable';
import {formatPhoneNumber} from '@libs/LocalePhoneNumber';
import * as Localize from '@libs/Localize';
import Log from '@libs/Log';
import isReportOpenInRHP from '@libs/Navigation/helpers/isReportOpenInRHP';
import isSearchTopmostFullScreenRoute from '@libs/Navigation/helpers/isSearchTopmostFullScreenRoute';
import Navigation, {navigationRef} from '@libs/Navigation/Navigation';
import {buildNextStep} from '@libs/NextStepUtils';
import * as NumberUtils from '@libs/NumberUtils';
import {getManagerMcTestParticipant, getPersonalDetailsForAccountIDs} from '@libs/OptionsListUtils';
import Parser from '@libs/Parser';
import {getCustomUnitID} from '@libs/PerDiemRequestUtils';
import Performance from '@libs/Performance';
import Permissions from '@libs/Permissions';
import {getAccountIDsByLogins} from '@libs/PersonalDetailsUtils';
import {addSMSDomainIfPhoneNumber} from '@libs/PhoneNumber';
import {
    getCorrectedAutoReportingFrequency,
    getDistanceRateCustomUnit,
    getMemberAccountIDsForWorkspace,
    getPerDiemCustomUnit,
    getPerDiemRateCustomUnitRate,
    getPersonalPolicy,
    getPolicy,
    getSubmitToAccountID,
    hasDependentTags,
    isControlPolicy,
    isPaidGroupPolicy,
    isPolicyAdmin,
    isSubmitAndClose,
} from '@libs/PolicyUtils';
import {
    getAllReportActions,
    getIOUActionForReportID,
    getIOUReportIDFromReportActionPreview,
    getLastVisibleAction,
    getLastVisibleMessage,
    getOneTransactionThreadReportID,
    getOriginalMessage,
    getReportAction,
    getReportActionHtml,
    getReportActionMessage,
    getReportActionText,
    getTrackExpenseActionableWhisper,
    isActionableTrackExpense,
    isCreatedAction,
    isDeletedAction,
    isMoneyRequestAction,
    isReportPreviewAction,
} from '@libs/ReportActionsUtils';
import type {OptimisticChatReport, OptimisticCreatedReportAction, OptimisticIOUReportAction, OptionData, TransactionDetails} from '@libs/ReportUtils';
import {
    buildOptimisticActionableTrackExpenseWhisper,
    buildOptimisticAddCommentReportAction,
    buildOptimisticApprovedReportAction,
    buildOptimisticCancelPaymentReportAction,
    buildOptimisticChatReport,
    buildOptimisticCreatedReportAction,
    buildOptimisticDetachReceipt,
    buildOptimisticDismissedViolationReportAction,
    buildOptimisticExpenseReport,
    buildOptimisticHoldReportAction,
    buildOptimisticHoldReportActionComment,
    buildOptimisticInvoiceReport,
    buildOptimisticIOUReport,
    buildOptimisticIOUReportAction,
    buildOptimisticModifiedExpenseReportAction,
    buildOptimisticMoneyRequestEntities,
    buildOptimisticMovedTransactionAction,
    buildOptimisticReopenedReportAction,
    buildOptimisticReportPreview,
    buildOptimisticResolvedDuplicatesReportAction,
    buildOptimisticRetractedReportAction,
    buildOptimisticSubmittedReportAction,
    buildOptimisticUnapprovedReportAction,
    buildOptimisticUnHoldReportAction,
    canBeAutoReimbursed,
    canUserPerformWriteAction as canUserPerformWriteActionReportUtils,
    findSelfDMReportID,
    getAllHeldTransactions as getAllHeldTransactionsReportUtils,
    getAllPolicyReports,
    getApprovalChain,
    getChatByParticipants,
    getDisplayedReportID,
    getInvoiceChatByParticipants,
    getMoneyRequestSpendBreakdown,
    getNextApproverAccountID,
    getOptimisticDataForParentReportAction,
    getOutstandingChildRequest,
    getParsedComment,
    getPersonalDetailsForAccountID,
    getReportNotificationPreference,
    getReportOrDraftReport,
    getReportRecipientAccountIDs,
    getReportTransactions,
    getTransactionDetails,
    hasHeldExpenses as hasHeldExpensesReportUtils,
    hasNonReimbursableTransactions as hasNonReimbursableTransactionsReportUtils,
    hasReportBeenReopened,
    isArchivedReport,
    isClosedReport as isClosedReportUtil,
    isDraftReport,
    isExpenseReport,
    isIndividualInvoiceRoom,
    isInvoiceReport as isInvoiceReportReportUtils,
    isInvoiceRoom,
    isMoneyRequestReport as isMoneyRequestReportReportUtils,
    isOneOnOneChat,
    isOneTransactionThread,
    isOpenExpenseReport as isOpenExpenseReportReportUtils,
    isOpenInvoiceReport as isOpenInvoiceReportReportUtils,
    isOptimisticPersonalDetail,
    isPayAtEndExpenseReport as isPayAtEndExpenseReportReportUtils,
    isPayer as isPayerReportUtils,
    isPolicyExpenseChat as isPolicyExpenseChatReportUtil,
    isReportApproved,
    isReportManager,
    isSelectedManagerMcTest,
    isSelfDM,
    isSettled,
    isTestTransactionReport,
    isTrackExpenseReport,
    prepareOnboardingOnyxData,
    shouldCreateNewMoneyRequestReport as shouldCreateNewMoneyRequestReportReportUtils,
    updateReportPreview,
} from '@libs/ReportUtils';
import {buildSearchQueryJSON, getCurrentSearchQueryJSON, getTodoSearchQuery} from '@libs/SearchQueryUtils';
import {getSession} from '@libs/SessionUtils';
import playSound, {SOUNDS} from '@libs/Sound';
import {shouldRestrictUserBillableActions} from '@libs/SubscriptionUtils';
import {
    allHavePendingRTERViolation,
    buildOptimisticTransaction,
    getAmount,
    getCategoryTaxCodeAndAmount,
    getCurrency,
    getDistanceInMeters,
    getMerchant,
    getUpdatedTransaction,
    hasAnyTransactionWithoutRTERViolation,
    hasDuplicateTransactions,
    isCustomUnitRateIDForP2P,
    isDistanceRequest as isDistanceRequestTransactionUtils,
    isDuplicate,
    isFetchingWaypointsFromServer,
    isOnHold,
    isPendingCardOrScanningTransaction,
    isPerDiemRequest as isPerDiemRequestTransactionUtils,
    isScanning,
    isScanRequest as isScanRequestTransactionUtils,
    removeTransactionFromDuplicateTransactionViolation,
} from '@libs/TransactionUtils';
import ViolationsUtils from '@libs/Violations/ViolationsUtils';
import type {IOUAction, IOUActionParams, IOUType} from '@src/CONST';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {Route} from '@src/ROUTES';
import type * as OnyxTypes from '@src/types/onyx';
import type {Accountant, Attendee, Participant, Split} from '@src/types/onyx/IOU';
import type {ErrorFields, Errors} from '@src/types/onyx/OnyxCommon';
import type {PaymentMethodType} from '@src/types/onyx/OriginalMessage';
import type {QuickActionName} from '@src/types/onyx/QuickAction';
import type {InvoiceReceiver, InvoiceReceiverType} from '@src/types/onyx/Report';
import type ReportAction from '@src/types/onyx/ReportAction';
import type {OnyxData} from '@src/types/onyx/Request';
import type {SearchPolicy, SearchReport, SearchTransaction} from '@src/types/onyx/SearchResults';
import type {Comment, Receipt, ReceiptSource, Routes, SplitShares, TransactionChanges, TransactionCustomUnit, WaypointCollection} from '@src/types/onyx/Transaction';
import {isEmptyObject} from '@src/types/utils/EmptyObject';
import {clearByKey as clearPdfByOnyxKey} from './CachedPDFPaths';
import {buildOptimisticPolicyRecentlyUsedCategories, getPolicyCategoriesData} from './Policy/Category';
import {buildAddMembersToWorkspaceOnyxData, buildUpdateWorkspaceMembersRoleOnyxData} from './Policy/Member';
import {buildOptimisticPolicyRecentlyUsedDestinations} from './Policy/PerDiem';
import {buildOptimisticRecentlyUsedCurrencies, buildPolicyData, generatePolicyID} from './Policy/Policy';
import {buildOptimisticPolicyRecentlyUsedTags, getPolicyTagsData} from './Policy/Tag';
import type {GuidedSetupData} from './Report';
import {buildInviteToRoomOnyxData, completeOnboarding, getCurrentUserAccountID, notifyNewAction} from './Report';
import {clearAllRelatedReportActionErrors} from './ReportActions';
import {getRecentWaypoints, sanitizeRecentWaypoints} from './Transaction';
import {removeDraftSplitTransaction, removeDraftTransaction, removeDraftTransactions} from './TransactionEdit';
import {getOnboardingMessages} from './Welcome/OnboardingFlow';

type IOURequestType = ValueOf<typeof CONST.IOU.REQUEST_TYPE>;

type OneOnOneIOUReport = OnyxTypes.Report | undefined | null;

type BaseTransactionParams = {
    amount: number;
    currency: string;
    created: string;
    merchant: string;
    comment: string;
    category?: string;
    tag?: string;
    taxCode?: string;
    taxAmount?: number;
    billable?: boolean;
    customUnitRateID?: string;
};

type InitMoneyRequestParams = {
    reportID: string;
    policy?: OnyxEntry<OnyxTypes.Policy>;
    isFromGlobalCreate?: boolean;
    currentIouRequestType?: IOURequestType | undefined;
    newIouRequestType: IOURequestType | undefined;
    report: OnyxEntry<OnyxTypes.Report>;
    parentReport: OnyxEntry<OnyxTypes.Report>;
};

type MoneyRequestInformation = {
    payerAccountID: number;
    payerEmail: string;
    iouReport: OnyxTypes.Report;
    chatReport: OnyxTypes.Report;
    transaction: OnyxTypes.Transaction;
    iouAction: OptimisticIOUReportAction;
    createdChatReportActionID?: string;
    createdIOUReportActionID?: string;
    reportPreviewAction: OnyxTypes.ReportAction;
    transactionThreadReportID: string;
    createdReportActionIDForThread: string | undefined;
    onyxData: OnyxData;
    billable?: boolean;
};

type TrackExpenseInformation = {
    createdWorkspaceParams?: CreateWorkspaceParams;
    iouReport?: OnyxTypes.Report;
    chatReport: OnyxTypes.Report;
    transaction: OnyxTypes.Transaction;
    iouAction: OptimisticIOUReportAction;
    createdChatReportActionID?: string;
    createdIOUReportActionID?: string;
    reportPreviewAction?: OnyxTypes.ReportAction;
    transactionThreadReportID: string;
    createdReportActionIDForThread: string | undefined;
    actionableWhisperReportActionIDParam?: string;
    onyxData: OnyxData;
};

type TrackedExpenseTransactionParams = Omit<BaseTransactionParams, 'taxCode' | 'taxAmount'> & {
    waypoints?: string;
    transactionID: string | undefined;
    receipt?: Receipt;
    taxCode: string;
    taxAmount: number;
    attendees?: Attendee[];
};

type TrackedExpensePolicyParams = {
    policyID: string | undefined;
    isDraftPolicy?: boolean;
};
type TrackedExpenseReportInformation = {
    moneyRequestPreviewReportActionID: string | undefined;
    moneyRequestReportID: string | undefined;
    moneyRequestCreatedReportActionID: string | undefined;
    actionableWhisperReportActionID: string | undefined;
    linkedTrackedExpenseReportAction: OnyxTypes.ReportAction;
    linkedTrackedExpenseReportID: string;
    transactionThreadReportID: string | undefined;
    reportPreviewReportActionID: string | undefined;
    chatReportID: string | undefined;
};
type TrackedExpenseParams = {
    onyxData?: OnyxData;
    reportInformation: TrackedExpenseReportInformation;
    transactionParams: TrackedExpenseTransactionParams;
    policyParams: TrackedExpensePolicyParams;
    createdWorkspaceParams?: CreateWorkspaceParams;
    accountantParams?: TrackExpenseAccountantParams;
};

type SendInvoiceInformation = {
    senderWorkspaceID: string | undefined;
    receiver: Partial<OnyxTypes.PersonalDetails>;
    invoiceRoom: OnyxTypes.Report;
    createdChatReportActionID: string;
    invoiceReportID: string;
    reportPreviewReportActionID: string;
    transactionID: string;
    transactionThreadReportID: string;
    createdIOUReportActionID: string;
    createdReportActionIDForThread: string | undefined;
    reportActionID: string;
    onyxData: OnyxData;
};

type SplitData = {
    chatReportID: string;
    transactionID: string;
    reportActionID: string;
    policyID?: string;
    createdReportActionID?: string;
    chatType?: string;
};

type SplitsAndOnyxData = {
    splitData: SplitData;
    splits: Split[];
    onyxData: OnyxData;
};

type UpdateMoneyRequestData = {
    params: UpdateMoneyRequestParams;
    onyxData: OnyxData;
};

type PayMoneyRequestData = {
    params: PayMoneyRequestParams & Partial<PayInvoiceParams>;
    optimisticData: OnyxUpdate[];
    successData: OnyxUpdate[];
    failureData: OnyxUpdate[];
};

type SendMoneyParamsData = {
    params: SendMoneyParams;
    optimisticData: OnyxUpdate[];
    successData: OnyxUpdate[];
    failureData: OnyxUpdate[];
};

type GPSPoint = {
    lat: number;
    long: number;
};

type RequestMoneyTransactionParams = Omit<BaseTransactionParams, 'comment'> & {
    attendees?: Attendee[];
    actionableWhisperReportActionID?: string;
    linkedTrackedExpenseReportAction?: OnyxTypes.ReportAction;
    linkedTrackedExpenseReportID?: string;
    receipt?: Receipt;
    waypoints?: WaypointCollection;
    comment?: string;
    originalTransactionID?: string;
    isTestDrive?: boolean;
    source?: string;
};

type PerDiemExpenseTransactionParams = Omit<BaseTransactionParams, 'amount' | 'merchant' | 'customUnitRateID' | 'taxAmount' | 'taxCode' | 'comment'> & {
    attendees?: Attendee[];
    customUnit: TransactionCustomUnit;
    comment?: string;
};

type BasePolicyParams = {
    policy?: OnyxEntry<OnyxTypes.Policy>;
    policyTagList?: OnyxEntry<OnyxTypes.PolicyTagLists>;
    policyCategories?: OnyxEntry<OnyxTypes.PolicyCategories>;
};

type RequestMoneyParticipantParams = {
    payeeEmail: string | undefined;
    payeeAccountID: number;
    participant: Participant;
};

type PerDiemExpenseInformation = {
    report: OnyxEntry<OnyxTypes.Report>;
    participantParams: RequestMoneyParticipantParams;
    policyParams?: BasePolicyParams;
    transactionParams: PerDiemExpenseTransactionParams;
};

type PerDiemExpenseInformationParams = {
    parentChatReport: OnyxEntry<OnyxTypes.Report>;
    transactionParams: PerDiemExpenseTransactionParams;
    participantParams: RequestMoneyParticipantParams;
    policyParams?: BasePolicyParams;
    moneyRequestReportID?: string;
};

type RequestMoneyInformation = {
    report: OnyxEntry<OnyxTypes.Report>;
    participantParams: RequestMoneyParticipantParams;
    policyParams?: BasePolicyParams;
    gpsPoints?: GPSPoint;
    action?: IOUAction;
    reimbursible?: boolean;
    transactionParams: RequestMoneyTransactionParams;
    isRetry?: boolean;
    shouldPlaySound?: boolean;
    shouldHandleNavigation?: boolean;
    backToReport?: string;
    optimisticChatReportID?: string;
    optimisticCreatedReportActionID?: string;
    optimisticIOUReportID?: string;
    optimisticReportPreviewActionID?: string;
};

type MoneyRequestInformationParams = {
    parentChatReport: OnyxEntry<OnyxTypes.Report>;
    transactionParams: RequestMoneyTransactionParams;
    participantParams: RequestMoneyParticipantParams;
    policyParams?: BasePolicyParams;
    moneyRequestReportID?: string;
    existingTransactionID?: string;
    existingTransaction?: OnyxEntry<OnyxTypes.Transaction>;
    retryParams?: StartSplitBilActionParams | CreateTrackExpenseParams | RequestMoneyInformation | ReplaceReceipt;
    isSplitExpense?: boolean;
    testDriveCommentReportActionID?: string;
    optimisticChatReportID?: string;
    optimisticCreatedReportActionID?: string;
    optimisticIOUReportID?: string;
    optimisticReportPreviewActionID?: string;
};

type MoneyRequestOptimisticParams = {
    chat: {
        report: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report>;
        createdAction: OptimisticCreatedReportAction;
        reportPreviewAction: ReportAction;
    };
    iou: {
        report: OnyxTypes.Report;
        createdAction: OptimisticCreatedReportAction;
        action: OptimisticIOUReportAction;
    };
    transactionParams: {
        transaction: OnyxTypes.Transaction;
        transactionThreadReport: OptimisticChatReport | null;
        transactionThreadCreatedReportAction: OptimisticCreatedReportAction | null;
    };
    policyRecentlyUsed: {
        categories?: string[];
        tags?: OnyxTypes.RecentlyUsedTags;
        currencies?: string[];
        destinations?: string[];
    };
    personalDetailListAction?: OnyxTypes.PersonalDetailsList;
    nextStep?: OnyxTypes.ReportNextStep | null;
    testDriveCommentReportActionID?: string;
};

type BuildOnyxDataForMoneyRequestParams = {
    isNewChatReport: boolean;
    shouldCreateNewMoneyRequestReport: boolean;
    isOneOnOneSplit?: boolean;
    existingTransactionThreadReportID?: string;
    policyParams?: BasePolicyParams;
    optimisticParams: MoneyRequestOptimisticParams;
    retryParams?: StartSplitBilActionParams | CreateTrackExpenseParams | RequestMoneyInformation | ReplaceReceipt;
    participant?: Participant;
};

type DistanceRequestTransactionParams = BaseTransactionParams & {
    attendees?: Attendee[];
    validWaypoints: WaypointCollection;
    splitShares?: SplitShares;
};

type CreateDistanceRequestInformation = {
    report: OnyxEntry<OnyxTypes.Report>;
    participants: Participant[];
    currentUserLogin?: string;
    currentUserAccountID?: number;
    iouType?: ValueOf<typeof CONST.IOU.TYPE>;
    existingTransaction?: OnyxEntry<OnyxTypes.Transaction>;
    transactionParams: DistanceRequestTransactionParams;
    policyParams?: BasePolicyParams;
    backToReport?: string;
};

type CreateSplitsTransactionParams = Omit<BaseTransactionParams, 'customUnitRateID'> & {
    splitShares: SplitShares;
    iouRequestType?: IOURequestType;
    attendees?: Attendee[];
};

type CreateSplitsAndOnyxDataParams = {
    participants: Participant[];
    currentUserLogin: string;
    currentUserAccountID: number;
    existingSplitChatReportID?: string;
    transactionParams: CreateSplitsTransactionParams;
};

type TrackExpenseTransactionParams = {
    amount: number;
    currency: string;
    created: string | undefined;
    merchant?: string;
    comment?: string;
    receipt?: Receipt;
    category?: string;
    tag?: string;
    taxCode?: string;
    taxAmount?: number;
    billable?: boolean;
    validWaypoints?: WaypointCollection;
    gpsPoints?: GPSPoint;
    actionableWhisperReportActionID?: string;
    linkedTrackedExpenseReportAction?: OnyxTypes.ReportAction;
    linkedTrackedExpenseReportID?: string;
    customUnitRateID?: string;
    attendees?: Attendee[];
};

type TrackExpenseAccountantParams = {
    accountant?: Accountant;
};

type CreateTrackExpenseParams = {
    report: OnyxTypes.Report;
    isDraftPolicy: boolean;
    action?: IOUAction;
    participantParams: RequestMoneyParticipantParams;
    policyParams?: BasePolicyParams;
    transactionParams: TrackExpenseTransactionParams;
    accountantParams?: TrackExpenseAccountantParams;
    isRetry?: boolean;
    shouldPlaySound?: boolean;
    shouldHandleNavigation?: boolean;
};

type BuildOnyxDataForInvoiceParams = {
    chat: {
        report: OnyxEntry<OnyxTypes.Report>;
        createdAction: OptimisticCreatedReportAction;
        reportPreviewAction: ReportAction;
        isNewReport: boolean;
    };
    iou: {
        createdAction: OptimisticCreatedReportAction;
        action: OptimisticIOUReportAction;
        report: OnyxTypes.Report;
    };
    transactionParams: {
        transaction: OnyxTypes.Transaction;
        threadReport: OptimisticChatReport;
        threadCreatedReportAction: OptimisticCreatedReportAction | null;
    };
    policyParams: BasePolicyParams;
    optimisticData: {
        recentlyUsedCurrencies?: string[];
        policyRecentlyUsedCategories: string[];
        policyRecentlyUsedTags: OnyxTypes.RecentlyUsedTags;
        personalDetailListAction: OnyxTypes.PersonalDetailsList;
    };
    companyName?: string;
    companyWebsite?: string;
    participant?: Participant;
};

type GetTrackExpenseInformationTransactionParams = {
    comment: string;
    amount: number;
    currency: string;
    created: string;
    merchant: string;
    receipt: OnyxEntry<Receipt>;
    category?: string;
    tag?: string;
    taxCode?: string;
    taxAmount?: number;
    billable?: boolean;
    linkedTrackedExpenseReportAction?: OnyxTypes.ReportAction;
    attendees?: Attendee[];
};

type GetTrackExpenseInformationParticipantParams = {
    payeeEmail?: string;
    payeeAccountID?: number;
    participant: Participant;
};

type GetTrackExpenseInformationParams = {
    parentChatReport: OnyxEntry<OnyxTypes.Report>;
    moneyRequestReportID?: string;
    existingTransactionID?: string;
    participantParams: GetTrackExpenseInformationParticipantParams;
    policyParams: BasePolicyParams;
    transactionParams: GetTrackExpenseInformationTransactionParams;
    retryParams?: StartSplitBilActionParams | CreateTrackExpenseParams | RequestMoneyInformation | ReplaceReceipt;
};

let allPersonalDetails: OnyxTypes.PersonalDetailsList = {};
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (value) => {
        allPersonalDetails = value ?? {};
    },
});

type StartSplitBilActionParams = {
    participants: Participant[];
    currentUserLogin: string;
    currentUserAccountID: number;
    comment: string;
    receipt: Receipt;
    existingSplitChatReportID?: string;
    billable?: boolean;
    category: string | undefined;
    tag: string | undefined;
    currency: string;
    taxCode: string;
    taxAmount: number;
    shouldPlaySound?: boolean;
};

type ReplaceReceipt = {
    transactionID: string;
    file?: File;
    source: string;
};

type GetSearchOnyxUpdateParams = {
    transaction: OnyxTypes.Transaction;
    participant?: Participant;
    iouReport?: OnyxEntry<OnyxTypes.Report>;
    policy?: OnyxEntry<OnyxTypes.Policy>;
    isFromOneTransactionReport?: boolean;
    isInvoice?: boolean;
    transactionThreadReportID: string | undefined;
};

let allBetas: OnyxEntry<OnyxTypes.Beta[]>;
Onyx.connect({
    key: ONYXKEYS.BETAS,
    callback: (value) => (allBetas = value),
});

let allTransactions: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION,
    waitForCollectionCallback: true,
    callback: (value) => {
        if (!value) {
            allTransactions = {};
            return;
        }

        allTransactions = value;
    },
});

let allTransactionDrafts: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (value) => {
        allTransactionDrafts = value ?? {};
    },
});

let allTransactionViolations: NonNullable<OnyxCollection<OnyxTypes.TransactionViolations>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS,
    waitForCollectionCallback: true,
    callback: (value) => {
        if (!value) {
            allTransactionViolations = {};
            return;
        }

        allTransactionViolations = value;
    },
});

let allDraftSplitTransactions: NonNullable<OnyxCollection<OnyxTypes.Transaction>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (value) => {
        allDraftSplitTransactions = value ?? {};
    },
});

let allNextSteps: NonNullable<OnyxCollection<OnyxTypes.ReportNextStep>> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.NEXT_STEP,
    waitForCollectionCallback: true,
    callback: (value) => {
        allNextSteps = value ?? {};
    },
});

let allPolicyCategories: OnyxCollection<OnyxTypes.PolicyCategories> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.POLICY_CATEGORIES,
    waitForCollectionCallback: true,
    callback: (val) => (allPolicyCategories = val),
});

const allPolicies: OnyxCollection<OnyxTypes.Policy> = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.POLICY,
    callback: (val, key) => {
        if (!key) {
            return;
        }
        if (val === null || val === undefined) {
            // If we are deleting a policy, we have to check every report linked to that policy
            // and unset the draft indicator (pencil icon) alongside removing any draft comments. Clearing these values will keep the newly archived chats from being displayed in the LHN.
            // More info: https://github.com/Expensify/App/issues/14260
            const policyID = key.replace(ONYXKEYS.COLLECTION.POLICY, '');
            const policyReports = getAllPolicyReports(policyID);
            const cleanUpMergeQueries: Record<`${typeof ONYXKEYS.COLLECTION.REPORT}${string}`, NullishDeep<Report>> = {};
            const cleanUpSetQueries: Record<`${typeof ONYXKEYS.COLLECTION.REPORT_DRAFT_COMMENT}${string}` | `${typeof ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${string}`, null> = {};
            policyReports.forEach((policyReport) => {
                if (!policyReport) {
                    return;
                }
                const {reportID} = policyReport;
                cleanUpSetQueries[`${ONYXKEYS.COLLECTION.REPORT_DRAFT_COMMENT}${reportID}`] = null;
                cleanUpSetQueries[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${reportID}`] = null;
            });
            Onyx.mergeCollection(ONYXKEYS.COLLECTION.REPORT, cleanUpMergeQueries);
            Onyx.multiSet(cleanUpSetQueries);
            delete allPolicies[key];
            return;
        }

        allPolicies[key] = val;
    },
});

let allReports: OnyxCollection<OnyxTypes.Report>;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.REPORT,
    waitForCollectionCallback: true,
    callback: (value) => {
        allReports = value;
    },
});

let allReportNameValuePairs: OnyxCollection<OnyxTypes.ReportNameValuePairs>;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS,
    waitForCollectionCallback: true,
    callback: (value) => {
        allReportNameValuePairs = value;
    },
});

let userAccountID = -1;
let currentUserEmail = '';
Onyx.connect({
    key: ONYXKEYS.SESSION,
    callback: (value) => {
        currentUserEmail = value?.email ?? '';
        userAccountID = value?.accountID ?? CONST.DEFAULT_NUMBER_ID;
    },
});

let currentUserPersonalDetails: OnyxEntry<OnyxTypes.PersonalDetails>;
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (value) => {
        currentUserPersonalDetails = value?.[userAccountID] ?? undefined;
    },
});

let currentDate: OnyxEntry<string> = '';
Onyx.connect({
    key: ONYXKEYS.CURRENT_DATE,
    callback: (value) => {
        currentDate = value;
    },
});

let quickAction: OnyxEntry<OnyxTypes.QuickAction> = {};
Onyx.connect({
    key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
    callback: (value) => {
        quickAction = value;
    },
});

let allReportActions: OnyxCollection<OnyxTypes.ReportActions>;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.REPORT_ACTIONS,
    waitForCollectionCallback: true,
    callback: (actions) => {
        if (!actions) {
            return;
        }
        allReportActions = actions;
    },
});

let activePolicyID: OnyxEntry<string>;
Onyx.connect({
    key: ONYXKEYS.NVP_ACTIVE_POLICY_ID,
    callback: (value) => (activePolicyID = value),
});

let introSelected: OnyxEntry<OnyxTypes.IntroSelected>;
Onyx.connect({
    key: ONYXKEYS.NVP_INTRO_SELECTED,
    callback: (value) => (introSelected = value),
});

let personalDetailsList: OnyxEntry<OnyxTypes.PersonalDetailsList>;
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (value) => (personalDetailsList = value),
});

/**
 * @private
 * After finishing the action in RHP from the Inbox tab, besides dismissing the modal, we should open the report.
 * If the action is done from the report RHP, then we just want to dismiss the money request flow screens.
 * It is a helper function used only in this file.
 */
function dismissModalAndOpenReportInInboxTab(reportID?: string) {
    const rootState = navigationRef.getRootState();
    if (isReportOpenInRHP(rootState)) {
        const rhpKey = rootState.routes.at(-1)?.state?.key;
        if (rhpKey) {
            Navigation.pop(rhpKey);
            return;
        }
    }
    if (isSearchTopmostFullScreenRoute() || !reportID) {
        Navigation.dismissModal();
        return;
    }
    Navigation.dismissModalWithReport({reportID});
}

/**
 * Find the report preview action from given chat report and iou report
 */
function getReportPreviewAction(chatReportID: string | undefined, iouReportID: string | undefined): OnyxInputValue<ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.REPORT_PREVIEW>> {
    const reportActions = allReportActions?.[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`] ?? {};

    // Find the report preview action from the chat report
    return (
        Object.values(reportActions).find(
            (reportAction): reportAction is ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.REPORT_PREVIEW> =>
                reportAction && isReportPreviewAction(reportAction) && getOriginalMessage(reportAction)?.linkedReportID === iouReportID,
        ) ?? null
    );
}

/**
 * Initialize expense info
 * @param reportID to attach the transaction to
 * @param policy
 * @param isFromGlobalCreate
 * @param iouRequestType one of manual/scan/distance
 * @param report the report to attach the transaction to
 * @param parentReport the parent report to attach the transaction to
 */
function initMoneyRequest({reportID, policy, isFromGlobalCreate, currentIouRequestType, newIouRequestType, report, parentReport}: InitMoneyRequestParams) {
    // Generate a brand new transactionID
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const personalPolicy = getPolicy(getPersonalPolicy()?.id);
    const newTransactionID = CONST.IOU.OPTIMISTIC_TRANSACTION_ID;
    const currency = policy?.outputCurrency ?? personalPolicy?.outputCurrency ?? CONST.CURRENCY.USD;

    // Disabling this line since currentDate can be an empty string
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const created = currentDate || format(new Date(), 'yyyy-MM-dd');

    // We remove draft transactions created during multi scanning if there are some
    removeDraftTransactions(true);

    // in case we have to re-init money request, but the IOU request type is the same with the old draft transaction,
    // we should keep most of the existing data by using the ONYX MERGE operation
    if (currentIouRequestType === newIouRequestType) {
        // so, we just need to update the reportID, isFromGlobalCreate, created, currency
        Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${newTransactionID}`, {
            reportID,
            isFromGlobalCreate,
            created,
            currency,
            transactionID: newTransactionID,
        });
        return;
    }

    const comment: Comment = {
        attendees: formatCurrentUserToAttendee(currentUserPersonalDetails, reportID),
    };
    let requestCategory: string | null = null;

    // Add initial empty waypoints when starting a distance expense
    if (newIouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE || newIouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE_MAP) {
        comment.waypoints = {
            waypoint0: {keyForList: 'start_waypoint'},
            waypoint1: {keyForList: 'stop_waypoint'},
        };
        if (!isFromGlobalCreate) {
            const customUnitRateID = DistanceRequestUtils.getCustomUnitRateID(reportID);
            comment.customUnit = {customUnitRateID};
        }
    }

    if (newIouRequestType === CONST.IOU.REQUEST_TYPE.PER_DIEM) {
        comment.customUnit = {
            attributes: {
                dates: {
                    start: DateUtils.getStartOfToday(),
                    end: DateUtils.getStartOfToday(),
                },
            },
        };
        if (!isFromGlobalCreate) {
            const {customUnitID, category} = getCustomUnitID(report, parentReport);
            comment.customUnit = {...comment.customUnit, customUnitID};
            requestCategory = category ?? null;
        }
    }

    const newTransaction = {
        amount: 0,
        comment,
        created,
        currency,
        category: requestCategory,
        iouRequestType: newIouRequestType,
        reportID,
        transactionID: newTransactionID,
        isFromGlobalCreate,
        merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
        splitPayerAccountIDs: currentUserPersonalDetails ? [currentUserPersonalDetails.accountID] : undefined,
    };

    // Store the transaction in Onyx and mark it as not saved so it can be cleaned up later
    // Use set() here so that there is no way that data will be leaked between objects when it gets reset
    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${newTransactionID}`, newTransaction);

    return newTransaction;
}

function createDraftTransaction(transaction: OnyxTypes.Transaction) {
    if (!transaction) {
        return;
    }

    const newTransaction = {
        ...transaction,
    };

    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction.transactionID}`, newTransaction);
}

function clearMoneyRequest(transactionID: string, skipConfirmation = false) {
    removeDraftTransactions();
    Onyx.set(`${ONYXKEYS.COLLECTION.SKIP_CONFIRMATION}${transactionID}`, skipConfirmation);
}

function startMoneyRequest(iouType: ValueOf<typeof CONST.IOU.TYPE>, reportID: string, requestType?: IOURequestType, skipConfirmation = false, backToReport?: string) {
    Performance.markStart(CONST.TIMING.OPEN_CREATE_EXPENSE);
    clearMoneyRequest(CONST.IOU.OPTIMISTIC_TRANSACTION_ID, skipConfirmation);
    switch (requestType) {
        case CONST.IOU.REQUEST_TYPE.MANUAL:
            Navigation.navigate(ROUTES.MONEY_REQUEST_CREATE_TAB_MANUAL.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
            return;
        case CONST.IOU.REQUEST_TYPE.SCAN:
            Navigation.navigate(ROUTES.MONEY_REQUEST_CREATE_TAB_SCAN.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
            return;
        case CONST.IOU.REQUEST_TYPE.DISTANCE:
            Navigation.navigate(ROUTES.MONEY_REQUEST_CREATE_TAB_DISTANCE.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
            return;
        default:
            Navigation.navigate(ROUTES.MONEY_REQUEST_CREATE.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
    }
}

function startDistanceRequest(iouType: ValueOf<typeof CONST.IOU.TYPE>, reportID: string, requestType?: IOURequestType, skipConfirmation = false, backToReport?: string) {
    clearMoneyRequest(CONST.IOU.OPTIMISTIC_TRANSACTION_ID, skipConfirmation);
    switch (requestType) {
        case CONST.IOU.REQUEST_TYPE.DISTANCE_MAP:
            Navigation.navigate(ROUTES.DISTANCE_REQUEST_CREATE_TAB_MAP.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
            return;
        case CONST.IOU.REQUEST_TYPE.DISTANCE_MANUAL:
            Navigation.navigate(ROUTES.DISTANCE_REQUEST_CREATE_TAB_MANUAL.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
            return;
        default:
            Navigation.navigate(ROUTES.DISTANCE_REQUEST_CREATE.getRoute(CONST.IOU.ACTION.CREATE, iouType, CONST.IOU.OPTIMISTIC_TRANSACTION_ID, reportID, backToReport));
    }
}

function setMoneyRequestAmount(transactionID: string, amount: number, currency: string, shouldShowOriginalAmount = false) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {amount, currency, shouldShowOriginalAmount});
}

function setMoneyRequestCreated(transactionID: string, created: string, isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {created});
}

function setMoneyRequestDateAttribute(transactionID: string, start: string, end: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {comment: {customUnit: {attributes: {dates: {start, end}}}}});
}

function setMoneyRequestCurrency(transactionID: string, currency: string, isEditing = false) {
    const fieldToUpdate = isEditing ? 'modifiedCurrency' : 'currency';
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {[fieldToUpdate]: currency});
}

function setMoneyRequestDescription(transactionID: string, comment: string, isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {comment: {comment: comment.trim()}});
}

function setMoneyRequestMerchant(transactionID: string, merchant: string, isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {merchant});
}

function setMoneyRequestAttendees(transactionID: string, attendees: Attendee[], isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {comment: {attendees}});
}

function setMoneyRequestAccountant(transactionID: string, accountant: Accountant, isDraft: boolean) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {accountant});
}

function setMoneyRequestPendingFields(transactionID: string, pendingFields: OnyxTypes.Transaction['pendingFields']) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {pendingFields});
}

function setMoneyRequestCategory(transactionID: string, category: string, policyID?: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {category});
    if (!policyID) {
        setMoneyRequestTaxRate(transactionID, '');
        setMoneyRequestTaxAmount(transactionID, null);
        return;
    }
    const transaction = allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`];
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const {categoryTaxCode, categoryTaxAmount} = getCategoryTaxCodeAndAmount(category, transaction, getPolicy(policyID));
    if (categoryTaxCode && categoryTaxAmount !== undefined) {
        setMoneyRequestTaxRate(transactionID, categoryTaxCode);
        setMoneyRequestTaxAmount(transactionID, categoryTaxAmount);
    }
}

function setMoneyRequestTag(transactionID: string, tag: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {tag});
}

function setMoneyRequestBillable(transactionID: string, billable: boolean) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {billable});
}

function setMoneyRequestParticipants(transactionID: string, participants: Participant[] = [], isTestTransaction = false) {
    // We should change the reportID and isFromGlobalCreate of the test transaction since this flow can start inside an existing report
    return Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {
        participants,
        isFromGlobalCreate: isTestTransaction ? true : undefined,
        reportID: isTestTransaction ? participants?.at(0)?.reportID : undefined,
    });
}

function setSplitPayer(transactionID: string, payerAccountID: number) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {splitPayerAccountIDs: [payerAccountID]});
}

function setMoneyRequestReceipt(transactionID: string, source: string, filename: string, isDraft: boolean, type?: string, isTestReceipt = false, isTestDriveReceipt = false) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        // isTestReceipt = false and isTestDriveReceipt = false are being converted to null because we don't really need to store it in Onyx in those cases
        receipt: {source, type: type ?? '', isTestReceipt: isTestReceipt ? true : null, isTestDriveReceipt: isTestDriveReceipt ? true : null},
        filename,
    });
}

/**
 * Set custom unit rateID for the transaction draft
 */
function setCustomUnitRateID(transactionID: string, customUnitRateID: string | undefined) {
    const isFakeP2PRate = customUnitRateID === CONST.CUSTOM_UNITS.FAKE_P2P_ID;
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {
        comment: {
            customUnit: {
                customUnitRateID,
                ...(!isFakeP2PRate && {defaultP2PRate: null}),
            },
        },
    });
}

/**
 * Revert custom unit of the draft transaction to the original transaction's value
 */
function resetDraftTransactionsCustomUnit(transactionID: string | undefined) {
    if (!transactionID) {
        return;
    }

    const originalTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    if (!originalTransaction) {
        return;
    }

    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {
        comment: {
            customUnit: originalTransaction.comment?.customUnit ?? {},
        },
    });
}

/**
 * Set custom unit ID for the transaction draft
 */
function setCustomUnitID(transactionID: string, customUnitID: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {comment: {customUnit: {customUnitID}}});
}

function removeSubrate(transaction: OnyxEntry<OnyxTypes.Transaction>, currentIndex: string) {
    // Index comes from the route params and is a string
    const index = Number(currentIndex);
    if (index === -1) {
        return;
    }
    const existingSubrates = transaction?.comment?.customUnit?.subRates ?? [];

    const newSubrates = [...existingSubrates];
    newSubrates.splice(index, 1);

    // Onyx.merge won't remove the null nested object values, this is a workaround
    // to remove nested keys while also preserving other object keys
    // Doing a deep clone of the transaction to avoid mutating the original object and running into a cache issue when using Onyx.set
    const newTransaction: OnyxTypes.Transaction = {
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        ...(transaction as OnyxTypes.Transaction),
        comment: {
            ...transaction?.comment,
            customUnit: {
                ...transaction?.comment?.customUnit,
                subRates: newSubrates,
                quantity: null,
            },
        },
    };

    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction?.transactionID}`, newTransaction);
}

function updateSubrate(transaction: OnyxEntry<OnyxTypes.Transaction>, currentIndex: string, quantity: number, id: string, name: string, rate: number) {
    // Index comes from the route params and is a string
    const index = Number(currentIndex);
    if (index === -1) {
        return;
    }
    const existingSubrates = transaction?.comment?.customUnit?.subRates ?? [];

    if (index >= existingSubrates.length) {
        return;
    }

    const newSubrates = [...existingSubrates];
    newSubrates.splice(index, 1, {quantity, id, name, rate});

    // Onyx.merge won't remove the null nested object values, this is a workaround
    // to remove nested keys while also preserving other object keys
    // Doing a deep clone of the transaction to avoid mutating the original object and running into a cache issue when using Onyx.set
    const newTransaction: OnyxTypes.Transaction = {
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        ...(transaction as OnyxTypes.Transaction),
        comment: {
            ...transaction?.comment,
            customUnit: {
                ...transaction?.comment?.customUnit,
                subRates: newSubrates,
                quantity: null,
            },
        },
    };

    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction?.transactionID}`, newTransaction);
}

function clearSubrates(transactionID: string) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {comment: {customUnit: {subRates: []}}});
}

function addSubrate(transaction: OnyxEntry<OnyxTypes.Transaction>, currentIndex: string, quantity: number, id: string, name: string, rate: number) {
    // Index comes from the route params and is a string
    const index = Number(currentIndex);
    if (index === -1) {
        return;
    }
    const existingSubrates = transaction?.comment?.customUnit?.subRates ?? [];

    if (index !== existingSubrates.length) {
        return;
    }

    const newSubrates = [...existingSubrates];
    newSubrates.push({quantity, id, name, rate});

    // Onyx.merge won't remove the null nested object values, this is a workaround
    // to remove nested keys while also preserving other object keys
    // Doing a deep clone of the transaction to avoid mutating the original object and running into a cache issue when using Onyx.set
    const newTransaction: OnyxTypes.Transaction = {
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        ...(transaction as OnyxTypes.Transaction),
        comment: {
            ...transaction?.comment,
            customUnit: {
                ...transaction?.comment?.customUnit,
                subRates: newSubrates,
                quantity: null,
            },
        },
    };

    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction?.transactionID}`, newTransaction);
}

/**
 * Set the distance rate of a transaction.
 * Used when creating a new transaction or moving an existing one from Self DM
 */
function setMoneyRequestDistanceRate(transactionID: string, customUnitRateID: string, policy: OnyxEntry<OnyxTypes.Policy>, isDraft: boolean) {
    if (policy) {
        Onyx.merge(ONYXKEYS.NVP_LAST_SELECTED_DISTANCE_RATES, {[policy.id]: customUnitRateID});
    }

    const distanceRate = DistanceRequestUtils.getRateByCustomUnitRateID({policy, customUnitRateID});
    const transaction = isDraft ? allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`] : allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    let newDistance;
    if (distanceRate?.unit && distanceRate?.unit !== transaction?.comment?.customUnit?.distanceUnit) {
        newDistance = DistanceRequestUtils.convertDistanceUnit(getDistanceInMeters(transaction, transaction?.comment?.customUnit?.distanceUnit), distanceRate.unit);
    }
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        comment: {
            customUnit: {
                customUnitRateID,
                ...(!!policy && {defaultP2PRate: null}),
                ...(distanceRate && {distanceUnit: distanceRate.unit}),
                ...(newDistance && {quantity: newDistance}),
            },
        },
    });
}

/** Helper function to get the receipt error for expenses, or the generic error if there's no receipt */
function getReceiptError(
    receipt: OnyxEntry<Receipt>,
    filename?: string,
    isScanRequest = true,
    errorKey?: number,
    action?: IOUActionParams,
    retryParams?: StartSplitBilActionParams | CreateTrackExpenseParams | RequestMoneyInformation | ReplaceReceipt,
): Errors | ErrorFields {
    const formattedRetryParams = typeof retryParams === 'string' ? retryParams : JSON.stringify(retryParams);

    return isEmptyObject(receipt) || !isScanRequest
        ? getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage', errorKey)
        : getMicroSecondOnyxErrorObject(
              {
                  error: CONST.IOU.RECEIPT_ERROR,
                  source: receipt.source?.toString() ?? '',
                  filename: filename ?? '',
                  action: action ?? '',
                  retryParams: formattedRetryParams,
              },
              errorKey,
          );
}

/** Helper function to get optimistic fields violations onyx data */
function getFieldViolationsOnyxData(iouReport: OnyxTypes.Report): SetRequired<OnyxData, 'optimisticData' | 'failureData'> {
    const missingFields: OnyxTypes.ReportFieldsViolations = {};
    const excludedFields = Object.values(CONST.REPORT_VIOLATIONS_EXCLUDED_FIELDS) as string[];

    Object.values(iouReport.fieldList ?? {}).forEach((field) => {
        if (excludedFields.includes(field.fieldID) || !!field.value || !!field.defaultValue) {
            return;
        }
        // in case of missing field violation the empty object is indicator.
        missingFields[field.fieldID] = {};
    });

    return {
        optimisticData: [
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_VIOLATIONS}${iouReport.reportID}`,
                value: {
                    fieldRequired: missingFields,
                },
            },
        ],
        failureData: [
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_VIOLATIONS}${iouReport.reportID}`,
                value: null,
            },
        ],
    };
}

type BuildOnyxDataForTestDriveIOUParams = {
    transaction: OnyxTypes.Transaction;
    iouOptimisticParams: MoneyRequestOptimisticParams['iou'];
    chatOptimisticParams: MoneyRequestOptimisticParams['chat'];
    testDriveCommentReportActionID?: string;
};

function buildOnyxDataForTestDriveIOU(testDriveIOUParams: BuildOnyxDataForTestDriveIOUParams): OnyxData {
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    const optimisticIOUReportAction = buildOptimisticIOUReportAction({
        type: CONST.IOU.REPORT_ACTION_TYPE.PAY,
        amount: testDriveIOUParams.transaction.amount,
        currency: testDriveIOUParams.transaction.currency,
        comment: testDriveIOUParams.transaction.comment?.comment ?? '',
        participants: testDriveIOUParams.transaction.participants ?? [],
        paymentType: CONST.IOU.PAYMENT_TYPE.ELSEWHERE,
        iouReportID: testDriveIOUParams.iouOptimisticParams.report.reportID,
        transactionID: testDriveIOUParams.transaction.transactionID,
        reportActionID: testDriveIOUParams.iouOptimisticParams.action.reportActionID,
    });

    const text = Localize.translateLocal('testDrive.employeeInviteMessage', {name: personalDetailsList?.[userAccountID]?.firstName ?? ''});
    const textComment = buildOptimisticAddCommentReportAction(text, undefined, userAccountID, undefined, undefined, undefined, testDriveIOUParams.testDriveCommentReportActionID);
    textComment.reportAction.created = DateUtils.subtractMillisecondsFromDateTime(testDriveIOUParams.iouOptimisticParams.createdAction.created, 1);

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${testDriveIOUParams.chatOptimisticParams.report?.reportID}`,
            value: {
                [textComment.reportAction.reportActionID]: textComment.reportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${testDriveIOUParams.iouOptimisticParams.report.reportID}`,
            value: {
                ...{lastActionType: CONST.REPORT.ACTIONS.TYPE.MARKED_REIMBURSED, statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED},
                hasOutstandingChildRequest: false,
                lastActorAccountID: currentUserPersonalDetails?.accountID,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${testDriveIOUParams.iouOptimisticParams.report.reportID}`,
            value: {
                [testDriveIOUParams.iouOptimisticParams.action.reportActionID]: optimisticIOUReportAction,
            },
        },
    );

    return {
        optimisticData,
        successData,
        failureData,
    };
}

/** Builds the Onyx data for an expense */
function buildOnyxDataForMoneyRequest(moneyRequestParams: BuildOnyxDataForMoneyRequestParams): [OnyxUpdate[], OnyxUpdate[], OnyxUpdate[]] {
    const {
        isNewChatReport,
        shouldCreateNewMoneyRequestReport,
        isOneOnOneSplit = false,
        existingTransactionThreadReportID,
        policyParams = {},
        optimisticParams,
        retryParams,
        participant,
    } = moneyRequestParams;
    const {policy, policyCategories, policyTagList} = policyParams;
    const {
        chat,
        iou,
        transactionParams: {transaction, transactionThreadReport, transactionThreadCreatedReportAction},
        policyRecentlyUsed,
        personalDetailListAction,
        nextStep,
        testDriveCommentReportActionID,
    } = optimisticParams;

    const isScanRequest = isScanRequestTransactionUtils(transaction);
    const isPerDiemRequest = isPerDiemRequestTransactionUtils(transaction);
    const isASAPSubmitBetaEnabled = Permissions.isBetaEnabled(CONST.BETAS.ASAP_SUBMIT, allBetas);
    const outstandingChildRequest = getOutstandingChildRequest(iou.report);
    const clearedPendingFields = Object.fromEntries(Object.keys(transaction.pendingFields ?? {}).map((key) => [key, null]));
    const isMoneyRequestToManagerMcTest = isTestTransactionReport(iou.report);

    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];
    let newQuickAction: ValueOf<typeof CONST.QUICK_ACTIONS>;
    if (isScanRequest) {
        newQuickAction = CONST.QUICK_ACTIONS.REQUEST_SCAN;
    } else if (isPerDiemRequest) {
        newQuickAction = CONST.QUICK_ACTIONS.PER_DIEM;
    } else {
        newQuickAction = CONST.QUICK_ACTIONS.REQUEST_MANUAL;
    }

    if (isDistanceRequestTransactionUtils(transaction)) {
        newQuickAction = CONST.QUICK_ACTIONS.REQUEST_DISTANCE;
    }
    const existingTransactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${existingTransactionThreadReportID}`] ?? null;

    if (chat.report) {
        optimisticData.push({
            // Use SET for new reports because it doesn't exist yet, is faster and we need the data to be available when we navigate to the chat page
            onyxMethod: isNewChatReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report.reportID}`,
            value: {
                ...chat.report,
                lastReadTime: DateUtils.getDBTime(),
                ...(shouldCreateNewMoneyRequestReport ? {lastVisibleActionCreated: chat.reportPreviewAction.created} : {}),
                // do not update iouReportID if auto submit beta is enabled and it is a scan request
                ...(isASAPSubmitBetaEnabled && isScanRequest ? {} : {iouReportID: iou.report.reportID}),
                ...outstandingChildRequest,
                ...(isNewChatReport ? {pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD}} : {}),
            },
        });
    }

    optimisticData.push(
        {
            onyxMethod: shouldCreateNewMoneyRequestReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report.reportID}`,
            value: {
                ...iou.report,
                lastVisibleActionCreated: iou.action.created,
                pendingFields: {
                    ...(shouldCreateNewMoneyRequestReport ? {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : {preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: transaction,
        },
        isNewChatReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
                  value: {
                      [chat.createdAction.reportActionID]: chat.createdAction,
                      [chat.reportPreviewAction.reportActionID]: chat.reportPreviewAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
                  value: {
                      [chat.reportPreviewAction.reportActionID]: chat.reportPreviewAction,
                  },
              },
        shouldCreateNewMoneyRequestReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`,
                  value: {
                      [iou.createdAction.reportActionID]: iou.createdAction as OnyxTypes.ReportAction,
                      [iou.action.reportActionID]: iou.action as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`,
                  value: {
                      [iou.action.reportActionID]: iou.action as OnyxTypes.ReportAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                ...transactionThreadReport,
                pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionThreadReport?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
    );

    if (isNewChatReport) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chat.report?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        });
    }

    if (shouldCreateNewMoneyRequestReport) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iou.report?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        });
    }

    if (!isEmptyObject(transactionThreadCreatedReportAction)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction.reportActionID]: transactionThreadCreatedReportAction,
            },
        });
    }

    if (policyRecentlyUsed.categories?.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iou.report.policyID}`,
            value: policyRecentlyUsed.categories,
        });
    }

    if (policyRecentlyUsed.currencies?.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.RECENTLY_USED_CURRENCIES,
            value: policyRecentlyUsed.currencies,
        });
    }

    if (!isEmptyObject(policyRecentlyUsed.tags)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iou.report.policyID}`,
            value: policyRecentlyUsed.tags,
        });
    }

    if (policyRecentlyUsed.destinations?.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_DESTINATIONS}${iou.report.policyID}`,
            value: policyRecentlyUsed.destinations,
        });
    }

    if (transaction.receipt?.isTestDriveReceipt) {
        const {
            optimisticData: testDriveOptimisticData = [],
            successData: testDriveSuccessData = [],
            failureData: testDriveFailureData = [],
        } = buildOnyxDataForTestDriveIOU({
            transaction,
            iouOptimisticParams: iou,
            chatOptimisticParams: chat,
            testDriveCommentReportActionID,
        });
        optimisticData.push(...testDriveOptimisticData);
        successData.push(...testDriveSuccessData);
        failureData.push(...testDriveFailureData);
    }

    if (isMoneyRequestToManagerMcTest) {
        const date = new Date();
        const isTestReceipt = transaction.receipt?.isTestReceipt ?? false;
        const managerMcTestParticipant = getManagerMcTestParticipant() ?? {};
        const optimisticIOUReportAction = buildOptimisticIOUReportAction({
            type: isScanRequest && !isTestReceipt ? CONST.IOU.REPORT_ACTION_TYPE.CREATE : CONST.IOU.REPORT_ACTION_TYPE.PAY,
            amount: iou.report?.total ?? 0,
            currency: iou.report?.currency ?? '',
            comment: '',
            participants: [managerMcTestParticipant],
            paymentType: isScanRequest && !isTestReceipt ? undefined : CONST.IOU.PAYMENT_TYPE.ELSEWHERE,
            iouReportID: iou.report.reportID,
            transactionID: transaction.transactionID,
            reportActionID: iou.action.reportActionID,
        });

        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.NVP_DISMISSED_PRODUCT_TRAINING}`,
                value: {[CONST.PRODUCT_TRAINING_TOOLTIP_NAMES.SCAN_TEST_TOOLTIP]: DateUtils.getDBTime(date.valueOf())},
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report.reportID}`,
                value: {
                    ...iou.report,
                    ...(!isScanRequest || isTestReceipt ? {lastActionType: CONST.REPORT.ACTIONS.TYPE.MARKED_REIMBURSED, statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED} : undefined),
                    hasOutstandingChildRequest: false,
                    lastActorAccountID: currentUserPersonalDetails?.accountID,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`,
                value: {
                    [iou.action.reportActionID]: {
                        ...(optimisticIOUReportAction as OnyxTypes.ReportAction),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
                value: {
                    ...transaction,
                },
            },
        );
    }

    const redundantParticipants: Record<number, null> = {};
    if (!isEmptyObject(personalDetailListAction)) {
        const successPersonalDetailListAction: Record<number, null> = {};

        // BE will send different participants. We clear the optimistic ones to avoid duplicated entries
        Object.keys(personalDetailListAction).forEach((accountIDKey) => {
            const accountID = Number(accountIDKey);
            successPersonalDetailListAction[accountID] = null;
            redundantParticipants[accountID] = null;
        });

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: personalDetailListAction,
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: successPersonalDetailListAction,
        });
    }

    if (!isEmptyObject(nextStep)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iou.report.reportID}`,
            value: nextStep,
        });
    }

    if (isNewChatReport) {
        successData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report?.reportID}`,
                value: {
                    participants: redundantParticipants,
                    pendingFields: null,
                    errorFields: null,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chat.report?.reportID}`,
                value: {
                    isOptimisticReport: false,
                },
            },
        );
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report.reportID}`,
            value: {
                participants: redundantParticipants,
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iou.report.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                participants: redundantParticipants,
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionThreadReport?.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                pendingAction: null,
                pendingFields: clearedPendingFields,
                // The routes contains the distance in meters. Clearing the routes ensures we use the distance
                // in the correct unit stored under the transaction customUnit once the request is created.
                // The route is also not saved in the backend, so we can't rely on it.
                routes: null,
            },
        },

        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
            value: {
                ...(isNewChatReport
                    ? {
                          [chat.createdAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [chat.reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`,
            value: {
                ...(shouldCreateNewMoneyRequestReport
                    ? {
                          [iou.createdAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [iou.action.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        },
    );

    if (!isEmptyObject(transactionThreadCreatedReportAction)) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        });
    }

    const errorKey = DateUtils.getMicroseconds();

    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report?.reportID}`,
            value: {
                iouReportID: chat.report?.iouReportID,
                lastReadTime: chat.report?.lastReadTime,
                lastVisibleActionCreated: chat.report?.lastVisibleActionCreated,
                pendingFields: null,
                hasOutstandingChildRequest: chat.report?.hasOutstandingChildRequest,
                ...(isNewChatReport
                    ? {
                          errorFields: {
                              createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                          },
                      }
                    : {}),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report.reportID}`,
            value: {
                pendingFields: null,
                errorFields: {
                    ...(shouldCreateNewMoneyRequestReport ? {createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage')} : {}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                pendingFields: null,
                errorFields: existingTransactionThreadReport
                    ? null
                    : {
                          createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                      },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                errors: getReceiptError(
                    transaction.receipt,
                    // Disabling this line since transaction.filename can be an empty string
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    transaction.filename || transaction.receipt?.filename,
                    isScanRequest,
                    errorKey,
                    CONST.IOU.ACTION_PARAMS.MONEY_REQUEST,
                    retryParams,
                ),
                pendingFields: clearedPendingFields,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`,
            value: {
                ...(shouldCreateNewMoneyRequestReport
                    ? {
                          [iou.createdAction.reportActionID]: {
                              errors: getReceiptError(
                                  transaction.receipt,
                                  // Disabling this line since transaction.filename can be an empty string
                                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                  transaction.filename || transaction.receipt?.filename,
                                  isScanRequest,
                                  errorKey,
                                  CONST.IOU.ACTION_PARAMS.MONEY_REQUEST,
                                  retryParams,
                              ),
                          },
                          [iou.action.reportActionID]: {
                              errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                          },
                      }
                    : {
                          [iou.action.reportActionID]: {
                              errors: getReceiptError(
                                  transaction.receipt,
                                  // Disabling this line since transaction.filename can be an empty string
                                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                  transaction.filename || transaction.receipt?.filename,
                                  isScanRequest,
                                  errorKey,
                                  CONST.IOU.ACTION_PARAMS.MONEY_REQUEST,
                                  retryParams,
                              ),
                          },
                      }),
            },
        },
    );

    if (!isOneOnOneSplit) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: {
                action: newQuickAction,
                chatReportID: chat.report?.reportID,
                isFirstQuickAction: isEmptyObject(quickAction),
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: quickAction ?? null,
        });
    }

    if (!isEmptyObject(transactionThreadCreatedReportAction)) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                },
            },
        });
    }

    const reportActions = fastMerge(allReportActions?.[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report.reportID}`] ?? {}, {[iou.action.reportActionID]: iou.action}, true);
    const isFromOneTransactionReport = !!getOneTransactionThreadReportID(iou.report, chat.report ?? undefined, reportActions, undefined, undefined);
    const searchUpdate = getSearchOnyxUpdate({
        transaction,
        participant,
        iouReport: iou.report,
        policy,
        transactionThreadReportID: transactionThreadReport?.reportID,
        isFromOneTransactionReport,
    });

    if (searchUpdate) {
        if (searchUpdate.optimisticData) {
            optimisticData.push(...searchUpdate.optimisticData);
        }
        if (searchUpdate.successData) {
            successData.push(...searchUpdate.successData);
        }
    }

    // We don't need to compute violations unless we're on a paid policy
    if (!policy || !isPaidGroupPolicy(policy)) {
        return [optimisticData, successData, failureData];
    }

    const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(
        transaction,
        [],
        policy,
        policyTagList ?? {},
        policyCategories ?? {},
        hasDependentTags(policy, policyTagList ?? {}),
        false,
    );

    if (violationsOnyxData) {
        const shouldFixViolations = Array.isArray(violationsOnyxData.value) && violationsOnyxData.value.length > 0;

        optimisticData.push(violationsOnyxData, {
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iou.report.reportID}`,
            onyxMethod: Onyx.METHOD.SET,
            value: buildNextStep(iou.report, iou.report.statusNum ?? CONST.REPORT.STATE_NUM.OPEN, shouldFixViolations),
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
            value: [],
        });
    }

    return [optimisticData, successData, failureData];
}

/** Builds the Onyx data for an invoice */
function buildOnyxDataForInvoice(invoiceParams: BuildOnyxDataForInvoiceParams): [OnyxUpdate[], OnyxUpdate[], OnyxUpdate[]] {
    const {chat, iou, transactionParams, policyParams, optimisticData: optimisticDataParams, companyName, companyWebsite, participant} = invoiceParams;
    const transaction = transactionParams.transaction;

    const clearedPendingFields = Object.fromEntries(Object.keys(transactionParams.transaction.pendingFields ?? {}).map((key) => [key, null]));
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report?.reportID}`,
            value: {
                ...iou.report,
                lastMessageText: getReportActionText(iou.action),
                lastMessageHtml: getReportActionHtml(iou.action),
                pendingFields: {
                    createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iou.report?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionParams.transaction.transactionID}`,
            value: transactionParams.transaction,
        },
        chat.isNewReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
                  value: {
                      [chat.createdAction.reportActionID]: chat.createdAction,
                      [chat.reportPreviewAction.reportActionID]: chat.reportPreviewAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
                  value: {
                      [chat.reportPreviewAction.reportActionID]: chat.reportPreviewAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report?.reportID}`,
            value: {
                [iou.createdAction.reportActionID]: iou.createdAction as OnyxTypes.ReportAction,
                [iou.action.reportActionID]: iou.action as OnyxTypes.ReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionParams.threadReport.reportID}`,
            value: transactionParams.threadReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionParams.threadReport?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
    ];

    if (transactionParams.threadCreatedReportAction?.reportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionParams.threadReport.reportID}`,
            value: {
                [transactionParams.threadCreatedReportAction.reportActionID]: transactionParams.threadCreatedReportAction,
            },
        });
    }

    const successData: OnyxUpdate[] = [];

    if (chat.report) {
        optimisticData.push({
            // Use SET for new reports because it doesn't exist yet, is faster and we need the data to be available when we navigate to the chat page
            onyxMethod: chat.isNewReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report.reportID}`,
            value: {
                ...chat.report,
                lastReadTime: DateUtils.getDBTime(),
                iouReportID: iou.report?.reportID,
                ...(chat.isNewReport ? {pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD}} : {}),
            },
        });

        if (chat.isNewReport) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chat.report?.reportID}`,
                value: {
                    isOptimisticReport: true,
                },
            });
        }
    }

    if (optimisticDataParams.policyRecentlyUsedCategories.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iou.report?.policyID}`,
            value: optimisticDataParams.policyRecentlyUsedCategories,
        });
    }

    if (optimisticDataParams.recentlyUsedCurrencies?.length) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.RECENTLY_USED_CURRENCIES,
            value: optimisticDataParams.recentlyUsedCurrencies,
        });
    }

    if (!isEmptyObject(optimisticDataParams.policyRecentlyUsedTags)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iou.report?.policyID}`,
            value: optimisticDataParams.policyRecentlyUsedTags,
        });
    }

    const redundantParticipants: Record<number, null> = {};
    if (!isEmptyObject(optimisticDataParams.personalDetailListAction)) {
        const successPersonalDetailListAction: Record<number, null> = {};

        // BE will send different participants. We clear the optimistic ones to avoid duplicated entries
        Object.keys(optimisticDataParams.personalDetailListAction).forEach((accountIDKey) => {
            const accountID = Number(accountIDKey);
            successPersonalDetailListAction[accountID] = null;
            redundantParticipants[accountID] = null;
        });

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: optimisticDataParams.personalDetailListAction,
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: successPersonalDetailListAction,
        });
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report?.reportID}`,
            value: {
                participants: redundantParticipants,
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iou.report?.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionParams.threadReport.reportID}`,
            value: {
                participants: redundantParticipants,
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionParams.threadReport.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionParams.transaction.transactionID}`,
            value: {
                pendingAction: null,
                pendingFields: clearedPendingFields,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chat.report?.reportID}`,
            value: {
                ...(chat.isNewReport
                    ? {
                          [chat.createdAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [chat.reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report?.reportID}`,
            value: {
                [iou.createdAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
                [iou.action.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        },
    );

    if (transactionParams.threadCreatedReportAction?.reportActionID) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionParams.threadReport.reportID}`,
            value: {
                [transactionParams.threadCreatedReportAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        });
    }

    if (chat.isNewReport) {
        successData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report?.reportID}`,
                value: {
                    participants: redundantParticipants,
                    pendingFields: null,
                    errorFields: null,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chat.report?.reportID}`,
                value: {
                    isOptimisticReport: false,
                },
            },
        );
    }

    const errorKey = DateUtils.getMicroseconds();

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chat.report?.reportID}`,
            value: {
                iouReportID: chat.report?.iouReportID,
                lastReadTime: chat.report?.lastReadTime,
                pendingFields: null,
                hasOutstandingChildRequest: chat.report?.hasOutstandingChildRequest,
                ...(chat.isNewReport
                    ? {
                          errorFields: {
                              createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                          },
                      }
                    : {}),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iou.report?.reportID}`,
            value: {
                pendingFields: null,
                errorFields: {
                    createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionParams.threadReport.reportID}`,
            value: {
                errorFields: {
                    createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionParams.transaction.transactionID}`,
            value: {
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateInvoiceFailureMessage'),
                pendingFields: clearedPendingFields,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iou.report?.reportID}`,
            value: {
                [iou.createdAction.reportActionID]: {
                    // Disabling this line since transactionParams.transaction.filename can be an empty string
                    errors: getReceiptError(
                        transactionParams.transaction.receipt,
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        transactionParams.transaction?.filename || transactionParams.transaction.receipt?.filename,
                        false,
                        errorKey,
                    ),
                },
                [iou.action.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateInvoiceFailureMessage'),
                },
            },
        },
    ];

    if (transactionParams.threadCreatedReportAction?.reportActionID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionParams.threadReport.reportID}`,
            value: {
                [transactionParams.threadCreatedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateInvoiceFailureMessage', errorKey),
                },
            },
        });
    }

    if (companyName && companyWebsite) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY}${policyParams.policy?.id}`,
            value: {
                invoice: {
                    companyName,
                    companyWebsite,
                    pendingFields: {
                        companyName: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                        companyWebsite: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                    },
                },
            },
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY}${policyParams.policy?.id}`,
            value: {
                invoice: {
                    pendingFields: {
                        companyName: null,
                        companyWebsite: null,
                    },
                },
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY}${policyParams.policy?.id}`,
            value: {
                invoice: {
                    companyName: null,
                    companyWebsite: null,
                    pendingFields: {
                        companyName: null,
                        companyWebsite: null,
                    },
                },
            },
        });
    }

    const searchUpdate = getSearchOnyxUpdate({
        transaction,
        participant,
        isInvoice: true,
        transactionThreadReportID: transactionParams.threadReport.reportID,
    });

    if (searchUpdate) {
        if (searchUpdate.optimisticData) {
            optimisticData.push(...searchUpdate.optimisticData);
        }
        if (searchUpdate.successData) {
            successData.push(...searchUpdate.successData);
        }
    }

    // We don't need to compute violations unless we're on a paid policy
    if (!policyParams.policy || !isPaidGroupPolicy(policyParams.policy)) {
        return [optimisticData, successData, failureData];
    }

    return [optimisticData, successData, failureData];
}

type BuildOnyxDataForTrackExpenseParams = {
    chat: {report: OnyxInputValue<OnyxTypes.Report>; previewAction: OnyxInputValue<ReportAction>};
    iou: {report: OnyxInputValue<OnyxTypes.Report>; createdAction: OptimisticCreatedReportAction; action: OptimisticIOUReportAction};
    transactionParams: {transaction: OnyxTypes.Transaction; threadReport: OptimisticChatReport | null; threadCreatedReportAction: OptimisticCreatedReportAction | null};
    policyParams: {policy?: OnyxInputValue<OnyxTypes.Policy>; tagList?: OnyxInputValue<OnyxTypes.PolicyTagLists>; categories?: OnyxInputValue<OnyxTypes.PolicyCategories>};
    shouldCreateNewMoneyRequestReport: boolean;
    existingTransactionThreadReportID?: string;
    actionableTrackExpenseWhisper?: OnyxInputValue<OnyxTypes.ReportAction>;
    retryParams?: StartSplitBilActionParams | CreateTrackExpenseParams | RequestMoneyInformation | ReplaceReceipt;
    participant?: Participant;
};

/** Builds the Onyx data for track expense */
function buildOnyxDataForTrackExpense({
    chat,
    iou,
    transactionParams,
    policyParams = {},
    shouldCreateNewMoneyRequestReport,
    existingTransactionThreadReportID,
    actionableTrackExpenseWhisper,
    retryParams,
    participant,
}: BuildOnyxDataForTrackExpenseParams): [OnyxUpdate[], OnyxUpdate[], OnyxUpdate[]] {
    const {report: chatReport, previewAction: reportPreviewAction} = chat;
    const {report: iouReport, createdAction: iouCreatedAction, action: iouAction} = iou;
    const {transaction, threadReport: transactionThreadReport, threadCreatedReportAction: transactionThreadCreatedReportAction} = transactionParams;
    const {policy, tagList: policyTagList, categories: policyCategories} = policyParams;

    const isScanRequest = isScanRequestTransactionUtils(transaction);
    const isASAPSubmitBetaEnabled = Permissions.isBetaEnabled(CONST.BETAS.ASAP_SUBMIT, allBetas);
    const isDistanceRequest = isDistanceRequestTransactionUtils(transaction);
    const clearedPendingFields = Object.fromEntries(Object.keys(transaction.pendingFields ?? {}).map((key) => [key, null]));

    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    const isSelfDMReport = isSelfDM(chatReport);
    let newQuickAction: QuickActionName = isSelfDMReport ? CONST.QUICK_ACTIONS.TRACK_MANUAL : CONST.QUICK_ACTIONS.REQUEST_MANUAL;
    if (isScanRequest) {
        newQuickAction = isSelfDMReport ? CONST.QUICK_ACTIONS.TRACK_SCAN : CONST.QUICK_ACTIONS.REQUEST_SCAN;
    } else if (isDistanceRequest) {
        newQuickAction = isSelfDMReport ? CONST.QUICK_ACTIONS.TRACK_DISTANCE : CONST.QUICK_ACTIONS.REQUEST_DISTANCE;
    }
    const existingTransactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${existingTransactionThreadReportID}`] ?? null;

    if (chatReport) {
        optimisticData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                value: {
                    ...chatReport,
                    lastMessageText: getReportActionText(iouAction),
                    lastMessageHtml: getReportActionHtml(iouAction),
                    lastReadTime: DateUtils.getDBTime(),
                    // do not update iouReportID if auto submit beta is enabled and it is a scan request
                    iouReportID: isASAPSubmitBetaEnabled && isScanRequest ? null : iouReport?.reportID,
                    lastVisibleActionCreated: shouldCreateNewMoneyRequestReport ? reportPreviewAction?.created : chatReport.lastVisibleActionCreated,
                },
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
                value: {
                    action: newQuickAction,
                    chatReportID: chatReport.reportID,
                    isFirstQuickAction: isEmptyObject(quickAction),
                },
            },
        );

        if (actionableTrackExpenseWhisper && !iouReport) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                value: {
                    [actionableTrackExpenseWhisper.reportActionID]: actionableTrackExpenseWhisper,
                },
            });
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                value: {
                    lastVisibleActionCreated: actionableTrackExpenseWhisper.created,
                    lastMessageText: CONST.ACTIONABLE_TRACK_EXPENSE_WHISPER_MESSAGE,
                },
            });
            successData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                value: {
                    [actionableTrackExpenseWhisper.reportActionID]: {pendingAction: null, errors: null},
                },
            });
            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                value: {[actionableTrackExpenseWhisper.reportActionID]: null},
            });
        }
    }

    if (iouReport) {
        optimisticData.push(
            {
                onyxMethod: shouldCreateNewMoneyRequestReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
                value: {
                    ...iouReport,
                    lastMessageText: getReportActionText(iouAction),
                    lastMessageHtml: getReportActionHtml(iouAction),
                    pendingFields: {
                        ...(shouldCreateNewMoneyRequestReport ? {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : {preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}),
                    },
                },
            },
            shouldCreateNewMoneyRequestReport
                ? {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                      value: {
                          [iouCreatedAction.reportActionID]: iouCreatedAction as OnyxTypes.ReportAction,
                          [iouAction.reportActionID]: iouAction as OnyxTypes.ReportAction,
                      },
                  }
                : {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                      value: {
                          [iouAction.reportActionID]: iouAction as OnyxTypes.ReportAction,
                      },
                  },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                value: {
                    ...(reportPreviewAction && {[reportPreviewAction.reportActionID]: reportPreviewAction}),
                },
            },
        );
        if (shouldCreateNewMoneyRequestReport) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iouReport.reportID}`,
                value: {
                    isOptimisticReport: true,
                },
            });
        }
    } else {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [iouAction.reportActionID]: iouAction as OnyxTypes.ReportAction,
            },
        });
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: transaction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                ...transactionThreadReport,
                pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionThreadReport?.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
    );

    if (!isEmptyObject(transactionThreadCreatedReportAction)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction.reportActionID]: transactionThreadCreatedReportAction,
            },
        });
    }

    if (iouReport) {
        successData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                value: {
                    pendingFields: null,
                    errorFields: null,
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
                value: {
                    ...(shouldCreateNewMoneyRequestReport
                        ? {
                              [iouCreatedAction.reportActionID]: {
                                  pendingAction: null,
                                  errors: null,
                              },
                          }
                        : {}),
                    [iouAction.reportActionID]: {
                        pendingAction: null,
                        errors: null,
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
                value: {
                    ...(reportPreviewAction && {[reportPreviewAction.reportActionID]: {pendingAction: null}}),
                },
            },
        );
        if (shouldCreateNewMoneyRequestReport) {
            successData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${iouReport.reportID}`,
                value: {
                    isOptimisticReport: false,
                },
            });
        }
    } else {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [iouAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
                ...(reportPreviewAction && {[reportPreviewAction.reportActionID]: {pendingAction: null}}),
            },
        });
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${transactionThreadReport?.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                pendingAction: null,
                pendingFields: clearedPendingFields,
                routes: null,
            },
        },
    );

    if (!isEmptyObject(transactionThreadCreatedReportAction)) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        });
    }

    failureData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
        value: quickAction ?? null,
    });

    if (iouReport) {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
                value: {
                    pendingFields: null,
                    errorFields: {
                        ...(shouldCreateNewMoneyRequestReport ? {createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage')} : {}),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                value: {
                    ...(shouldCreateNewMoneyRequestReport
                        ? {
                              [iouCreatedAction.reportActionID]: {
                                  errors: getReceiptError(
                                      transaction.receipt,
                                      // Disabling this line since transaction.filename can be an empty string
                                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                      transaction.filename || transaction.receipt?.filename,
                                      isScanRequest,
                                      undefined,
                                      CONST.IOU.ACTION_PARAMS.TRACK_EXPENSE,
                                      retryParams,
                                  ),
                              },
                              [iouAction.reportActionID]: {
                                  errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                              },
                          }
                        : {
                              [iouAction.reportActionID]: {
                                  errors: getReceiptError(
                                      transaction.receipt,
                                      // Disabling this line since transaction.filename can be an empty string
                                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                                      transaction.filename || transaction.receipt?.filename,
                                      isScanRequest,
                                      undefined,
                                      CONST.IOU.ACTION_PARAMS.TRACK_EXPENSE,
                                      retryParams,
                                  ),
                              },
                          }),
                },
            },
        );
    } else {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [iouAction.reportActionID]: {
                    errors: getReceiptError(
                        transaction.receipt,
                        // Disabling this line since transaction.filename can be an empty string
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        transaction.filename || transaction.receipt?.filename,
                        isScanRequest,
                        undefined,
                        CONST.IOU.ACTION_PARAMS.TRACK_EXPENSE,
                        retryParams,
                    ),
                },
            },
        });
    }

    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                lastReadTime: chatReport?.lastReadTime,
                lastMessageText: chatReport?.lastMessageText,
                lastMessageHtml: chatReport?.lastMessageHtml,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.reportID}`,
            value: {
                pendingFields: null,
                errorFields: existingTransactionThreadReport
                    ? null
                    : {
                          createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                      },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                errors: getReceiptError(
                    transaction.receipt,
                    // Disabling this line since transaction.filename can be an empty string
                    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                    transaction.filename || transaction.receipt?.filename,
                    isScanRequest,
                    undefined,
                    CONST.IOU.ACTION_PARAMS.TRACK_EXPENSE,
                    retryParams,
                ),
                pendingFields: clearedPendingFields,
            },
        },
    );

    if (transactionThreadCreatedReportAction?.reportActionID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReport?.reportID}`,
            value: {
                [transactionThreadCreatedReportAction?.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                },
            },
        });
    }

    const searchUpdate = getSearchOnyxUpdate({
        transaction,
        participant,
        transactionThreadReportID: transactionThreadReport?.reportID,
    });

    if (searchUpdate) {
        if (searchUpdate.optimisticData) {
            optimisticData.push(...searchUpdate.optimisticData);
        }
        if (searchUpdate.successData) {
            successData.push(...searchUpdate.successData);
        }
    }

    // We don't need to compute violations unless we're on a paid policy
    if (!policy || !isPaidGroupPolicy(policy)) {
        return [optimisticData, successData, failureData];
    }

    const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(
        transaction,
        [],
        policy,
        policyTagList ?? {},
        policyCategories ?? {},
        hasDependentTags(policy, policyTagList ?? {}),
        false,
    );

    if (violationsOnyxData) {
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
            value: [],
        });
    }

    // Show field violations only for control policies
    if (isControlPolicy(policy) && iouReport) {
        const {optimisticData: fieldViolationsOptimisticData, failureData: fieldViolationsFailureData} = getFieldViolationsOnyxData(iouReport);
        optimisticData.push(...fieldViolationsOptimisticData);
        failureData.push(...fieldViolationsFailureData);
    }

    return [optimisticData, successData, failureData];
}

function getDeleteTrackExpenseInformation(
    chatReportID: string,
    transactionID: string | undefined,
    reportAction: OnyxTypes.ReportAction,
    shouldDeleteTransactionFromOnyx = true,
    isMovingTransactionFromTrackExpense = false,
    actionableWhisperReportActionID = '',
    resolution = '',
    shouldRemoveIOUTransaction = true,
) {
    // STEP 1: Get all collections we're updating
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`] ?? null;
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`];
    const transactionThreadID = reportAction.childReportID;
    let transactionThread = null;
    if (transactionThreadID) {
        transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`] ?? null;
    }

    // STEP 2: Decide if we need to:
    // 1. Delete the transactionThread - delete if there are no visible comments in the thread and we're not moving the transaction
    // 2. Update the moneyRequestPreview to show [Deleted expense] - update if the transactionThread exists AND it isn't being deleted and we're not moving the transaction
    const shouldDeleteTransactionThread = !isMovingTransactionFromTrackExpense && (transactionThreadID ? (reportAction?.childVisibleActionCount ?? 0) === 0 : false);

    const shouldShowDeletedRequestMessage = !isMovingTransactionFromTrackExpense && !!transactionThreadID && !shouldDeleteTransactionThread;

    // STEP 3: Update the IOU reportAction.
    const updatedReportAction = {
        [reportAction.reportActionID]: {
            pendingAction: shouldShowDeletedRequestMessage ? CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE : CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            previousMessage: reportAction.message,
            message: [
                {
                    type: 'COMMENT',
                    html: '',
                    text: '',
                    isEdited: true,
                    isDeletedParentAction: shouldShowDeletedRequestMessage,
                },
            ],
            originalMessage: {
                IOUTransactionID: shouldRemoveIOUTransaction ? null : transactionID,
            },
            errors: undefined,
        },
        ...(actionableWhisperReportActionID && {[actionableWhisperReportActionID]: {originalMessage: {resolution}}}),
    } as OnyxTypes.ReportActions;
    let canUserPerformWriteAction = true;
    if (chatReport) {
        canUserPerformWriteAction = !!canUserPerformWriteActionReportUtils(chatReport);
    }
    const lastVisibleAction = getLastVisibleAction(chatReportID, canUserPerformWriteAction, updatedReportAction);
    const {lastMessageText = '', lastMessageHtml = ''} = getLastVisibleMessage(chatReportID, canUserPerformWriteAction, updatedReportAction);

    // STEP 4: Build Onyx data
    const optimisticData: OnyxUpdate[] = [];

    if (shouldDeleteTransactionFromOnyx && shouldRemoveIOUTransaction) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: null,
        });
    }
    if (!shouldRemoveIOUTransaction) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            },
        });
    }

    optimisticData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
        value: null,
    });

    if (shouldDeleteTransactionThread) {
        optimisticData.push(
            // Use merge instead of set to avoid deleting the report too quickly, which could cause a brief "not found" page to appear.
            // The remaining parts of the report object will be removed after the API call is successful.
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                value: {
                    reportID: null,
                    stateNum: CONST.REPORT.STATE_NUM.APPROVED,
                    statusNum: CONST.REPORT.STATUS_NUM.CLOSED,
                    participants: {
                        [userAccountID]: {
                            notificationPreference: CONST.REPORT.NOTIFICATION_PREFERENCE.HIDDEN,
                        },
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadID}`,
                value: null,
            },
        );
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: updatedReportAction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                lastMessageText,
                lastVisibleActionCreated: lastVisibleAction?.created,
                lastMessageHtml: !lastMessageHtml ? lastMessageText : lastMessageHtml,
            },
        },
    );

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        },
    ];

    // Ensure that any remaining data is removed upon successful completion, even if the server sends a report removal response.
    // This is done to prevent the removal update from lingering in the applyHTTPSOnyxUpdates function.
    if (shouldDeleteTransactionThread && transactionThread) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
            value: null,
        });
    }

    const failureData: OnyxUpdate[] = [];

    if (shouldDeleteTransactionFromOnyx && shouldRemoveIOUTransaction) {
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: transaction ?? null,
        });
    }
    if (!shouldRemoveIOUTransaction) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: null,
            },
        });
    }

    failureData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
        value: transactionViolations ?? null,
    });

    if (shouldDeleteTransactionThread) {
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
            value: transactionThread,
        });
    }

    if (actionableWhisperReportActionID) {
        const actionableWhisperReportAction = getReportAction(chatReportID, actionableWhisperReportActionID);
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [actionableWhisperReportActionID]: {
                    originalMessage: {
                        resolution: isActionableTrackExpense(actionableWhisperReportAction) ? (getOriginalMessage(actionableWhisperReportAction)?.resolution ?? null) : null,
                    },
                },
            },
        });
    }
    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    pendingAction: null,
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericDeleteFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: chatReport,
        },
    );

    const parameters: DeleteMoneyRequestParams = {
        transactionID,
        reportActionID: reportAction.reportActionID,
    };

    return {parameters, optimisticData, successData, failureData, shouldDeleteTransactionThread, chatReport};
}

/**
 * Get the invoice receiver type based on the receiver participant.
 * @param receiverParticipant The participant who will receive the invoice or the invoice receiver object directly.
 * @returns The invoice receiver type.
 */
function getReceiverType(receiverParticipant: Participant | InvoiceReceiver | undefined): InvoiceReceiverType {
    if (!receiverParticipant) {
        Log.warn('getReceiverType called with no receiverParticipant');
        return CONST.REPORT.INVOICE_RECEIVER_TYPE.INDIVIDUAL;
    }
    if ('type' in receiverParticipant && receiverParticipant.type) {
        return receiverParticipant.type;
    }
    if ('policyID' in receiverParticipant && receiverParticipant.policyID) {
        return CONST.REPORT.INVOICE_RECEIVER_TYPE.BUSINESS;
    }
    return CONST.REPORT.INVOICE_RECEIVER_TYPE.INDIVIDUAL;
}

/** Gathers all the data needed to create an invoice. */
function getSendInvoiceInformation(
    transaction: OnyxEntry<OnyxTypes.Transaction>,
    currentUserAccountID: number,
    invoiceChatReport?: OnyxEntry<OnyxTypes.Report>,
    receipt?: Receipt,
    policy?: OnyxEntry<OnyxTypes.Policy>,
    policyTagList?: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories?: OnyxEntry<OnyxTypes.PolicyCategories>,
    companyName?: string,
    companyWebsite?: string,
): SendInvoiceInformation {
    const {amount = 0, currency = '', created = '', merchant = '', category = '', tag = '', taxCode = '', taxAmount = 0, billable, comment, participants} = transaction ?? {};
    const trimmedComment = (comment?.comment ?? '').trim();
    const senderWorkspaceID = participants?.find((participant) => participant?.isSender)?.policyID;
    const receiverParticipant: Participant | InvoiceReceiver | undefined = participants?.find((participant) => participant?.accountID) ?? invoiceChatReport?.invoiceReceiver;
    const receiverAccountID = receiverParticipant && 'accountID' in receiverParticipant && receiverParticipant.accountID ? receiverParticipant.accountID : CONST.DEFAULT_NUMBER_ID;
    let receiver = getPersonalDetailsForAccountID(receiverAccountID);
    let optimisticPersonalDetailListAction = {};
    const receiverType = getReceiverType(receiverParticipant);

    // STEP 1: Get existing chat report OR build a new optimistic one
    let isNewChatReport = false;
    let chatReport = !isEmptyObject(invoiceChatReport) && invoiceChatReport?.reportID ? invoiceChatReport : null;

    if (!chatReport) {
        chatReport = getInvoiceChatByParticipants(receiverAccountID, receiverType, senderWorkspaceID) ?? null;
    }

    if (!chatReport) {
        isNewChatReport = true;
        chatReport = buildOptimisticChatReport({
            participantList: [receiverAccountID, currentUserAccountID],
            chatType: CONST.REPORT.CHAT_TYPE.INVOICE,
            policyID: senderWorkspaceID,
        });
    }

    // STEP 2: Create a new optimistic invoice report.
    const optimisticInvoiceReport = buildOptimisticInvoiceReport(
        chatReport.reportID,
        senderWorkspaceID,
        receiverAccountID,
        receiver.displayName ?? (receiverParticipant as Participant)?.login ?? '',
        amount,
        currency,
    );

    // STEP 3: Build optimistic receipt and transaction
    const receiptObject: Receipt = {};
    let filename;
    if (receipt?.source) {
        receiptObject.source = receipt.source;
        receiptObject.state = receipt.state ?? CONST.IOU.RECEIPT_STATE.SCAN_READY;
        filename = receipt.name;
    }
    const optimisticTransaction = buildOptimisticTransaction({
        transactionParams: {
            amount: amount * -1,
            currency,
            reportID: optimisticInvoiceReport.reportID,
            comment: trimmedComment,
            created,
            merchant,
            receipt: receiptObject,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            filename,
        },
    });

    const optimisticPolicyRecentlyUsedCategories = buildOptimisticPolicyRecentlyUsedCategories(optimisticInvoiceReport.policyID, category);
    const optimisticPolicyRecentlyUsedTags = buildOptimisticPolicyRecentlyUsedTags(optimisticInvoiceReport.policyID, tag);
    const optimisticRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(currency);

    // STEP 4: Add optimistic personal details for participant
    const shouldCreateOptimisticPersonalDetails = isNewChatReport && !allPersonalDetails[receiverAccountID];
    if (shouldCreateOptimisticPersonalDetails) {
        const receiverLogin = receiverParticipant && 'login' in receiverParticipant && receiverParticipant.login ? receiverParticipant.login : '';
        receiver = {
            accountID: receiverAccountID,
            displayName: formatPhoneNumber(receiverLogin),
            login: receiverLogin,
            isOptimisticPersonalDetail: true,
        };

        optimisticPersonalDetailListAction = {[receiverAccountID]: receiver};
    }

    // STEP 5: Build optimistic reportActions.
    const reportPreviewAction = buildOptimisticReportPreview(chatReport, optimisticInvoiceReport, trimmedComment, optimisticTransaction);
    optimisticInvoiceReport.parentReportActionID = reportPreviewAction.reportActionID;
    chatReport.lastVisibleActionCreated = reportPreviewAction.created;
    const [optimisticCreatedActionForChat, optimisticCreatedActionForIOUReport, iouAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
        buildOptimisticMoneyRequestEntities({
            iouReport: optimisticInvoiceReport,
            type: CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            amount,
            currency,
            comment: trimmedComment,
            payeeEmail: receiver.login ?? '',
            participants: [receiver],
            transactionID: optimisticTransaction.transactionID,
        });

    // STEP 6: Build Onyx Data
    const [optimisticData, successData, failureData] = buildOnyxDataForInvoice({
        chat: {report: chatReport, createdAction: optimisticCreatedActionForChat, reportPreviewAction, isNewReport: isNewChatReport},
        iou: {createdAction: optimisticCreatedActionForIOUReport, action: iouAction, report: optimisticInvoiceReport},
        transactionParams: {
            transaction: optimisticTransaction,
            threadReport: optimisticTransactionThread,
            threadCreatedReportAction: optimisticCreatedActionForTransactionThread,
        },
        policyParams: {policy, policyTagList, policyCategories},
        optimisticData: {
            personalDetailListAction: optimisticPersonalDetailListAction,
            recentlyUsedCurrencies: optimisticRecentlyUsedCurrencies,
            policyRecentlyUsedCategories: optimisticPolicyRecentlyUsedCategories,
            policyRecentlyUsedTags: optimisticPolicyRecentlyUsedTags,
        },
        participant: receiver,
        companyName,
        companyWebsite,
    });

    return {
        createdIOUReportActionID: optimisticCreatedActionForIOUReport.reportActionID,
        createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        reportActionID: iouAction.reportActionID,
        senderWorkspaceID,
        receiver,
        invoiceRoom: chatReport,
        createdChatReportActionID: optimisticCreatedActionForChat.reportActionID,
        invoiceReportID: optimisticInvoiceReport.reportID,
        reportPreviewReportActionID: reportPreviewAction.reportActionID,
        transactionID: optimisticTransaction.transactionID,
        transactionThreadReportID: optimisticTransactionThread.reportID,
        onyxData: {
            optimisticData,
            successData,
            failureData,
        },
    };
}

/**
 * Gathers all the data needed to submit an expense. It attempts to find existing reports, iouReports, and receipts. If it doesn't find them, then
 * it creates optimistic versions of them and uses those instead
 */
function getMoneyRequestInformation(moneyRequestInformation: MoneyRequestInformationParams): MoneyRequestInformation {
    const {
        parentChatReport,
        transactionParams,
        participantParams,
        policyParams = {},
        existingTransaction,
        existingTransactionID,
        moneyRequestReportID = '',
        retryParams,
        isSplitExpense,
        testDriveCommentReportActionID,
        optimisticChatReportID,
        optimisticCreatedReportActionID,
        optimisticIOUReportID,
        optimisticReportPreviewActionID,
    } = moneyRequestInformation;
    const {payeeAccountID = userAccountID, payeeEmail = currentUserEmail, participant} = participantParams;
    const {policy, policyCategories, policyTagList} = policyParams;
    const {
        attendees,
        amount,
        comment = '',
        currency,
        source = '',
        created,
        merchant,
        receipt,
        category,
        tag,
        taxCode,
        taxAmount,
        billable,
        linkedTrackedExpenseReportAction,
    } = transactionParams;

    const payerEmail = addSMSDomainIfPhoneNumber(participant.login ?? '');
    const payerAccountID = Number(participant.accountID);
    const isPolicyExpenseChat = participant.isPolicyExpenseChat;

    // STEP 1: Get existing chat report OR build a new optimistic one
    let isNewChatReport = false;
    let chatReport = !isEmptyObject(parentChatReport) && parentChatReport?.reportID ? parentChatReport : null;

    // If this is a policyExpenseChat, the chatReport must exist and we can get it from Onyx.
    // report is null if the flow is initiated from the global create menu. However, participant always stores the reportID if it exists, which is the case for policyExpenseChats
    if (!chatReport && isPolicyExpenseChat) {
        chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.reportID}`] ?? null;
    }

    if (!chatReport) {
        chatReport = getChatByParticipants([payerAccountID, payeeAccountID]) ?? null;
    }

    // If we still don't have a report, it likely doesn't exist and we need to build an optimistic one
    if (!chatReport) {
        isNewChatReport = true;
        chatReport = buildOptimisticChatReport({
            participantList: [payerAccountID, payeeAccountID],
            optimisticReportID: optimisticChatReportID,
        });
    }

    // STEP 2: Get the Expense/IOU report. If the moneyRequestReportID has been provided, we want to add the transaction to this specific report.
    // If no such reportID has been provided, let's use the chatReport.iouReportID property. In case that is not present, build a new optimistic Expense/IOU report.
    let iouReport: OnyxInputValue<OnyxTypes.Report> = null;
    if (moneyRequestReportID) {
        iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${moneyRequestReportID}`] ?? null;
    } else {
        iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReport.iouReportID}`] ?? null;
    }

    const isScanRequest = isScanRequestTransactionUtils({amount, receipt});
    const shouldCreateNewMoneyRequestReport = shouldCreateNewMoneyRequestReportReportUtils(iouReport, chatReport, isScanRequest);

    if (!iouReport || shouldCreateNewMoneyRequestReport) {
        iouReport = isPolicyExpenseChat
            ? buildOptimisticExpenseReport(chatReport.reportID, chatReport.policyID, payeeAccountID, amount, currency, undefined, undefined, optimisticIOUReportID)
            : buildOptimisticIOUReport(payeeAccountID, payerAccountID, amount, chatReport.reportID, currency, undefined, undefined, optimisticIOUReportID);
    } else if (isPolicyExpenseChat) {
        // Splitting doesn’t affect the amount, so no adjustment is needed
        // The amount remains constant after the split
        if (!isSplitExpense) {
            iouReport = {...iouReport};
            // Because of the Expense reports are stored as negative values, we subtract the total from the amount
            if (iouReport?.currency === currency) {
                if (!Number.isNaN(iouReport.total) && iouReport.total !== undefined) {
                    iouReport.total -= amount;
                }

                if (typeof iouReport.unheldTotal === 'number') {
                    iouReport.unheldTotal -= amount;
                }
            }
        }
    } else {
        iouReport = updateIOUOwnerAndTotal(iouReport, payeeAccountID, amount, currency);
    }

    // STEP 3: Build an optimistic transaction with the receipt
    const isDistanceRequest =
        existingTransaction && (existingTransaction.iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE || existingTransaction.iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE_MAP);
    let optimisticTransaction = buildOptimisticTransaction({
        existingTransactionID,
        existingTransaction,
        originalTransactionID: transactionParams.originalTransactionID,
        policy,
        transactionParams: {
            amount: isExpenseReport(iouReport) ? -amount : amount,
            currency,
            reportID: iouReport.reportID,
            comment,
            attendees,
            created,
            merchant,
            receipt,
            category,
            tag,
            taxCode,
            source,
            taxAmount: isExpenseReport(iouReport) ? -(taxAmount ?? 0) : taxAmount,
            billable,
            pendingFields: isDistanceRequest ? {waypoints: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : undefined,
        },
        isDemoTransactionParam: isSelectedManagerMcTest(participant.login) || transactionParams.receipt?.isTestDriveReceipt,
    });

    const optimisticPolicyRecentlyUsedCategories = buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, category);
    const optimisticPolicyRecentlyUsedTags = buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, tag);
    const optimisticPolicyRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(currency);

    // If there is an existing transaction (which is the case for distance requests), then the data from the existing transaction
    // needs to be manually merged into the optimistic transaction. This is because buildOnyxDataForMoneyRequest() uses `Onyx.set()` for the transaction
    // data. This is a big can of worms to change it to `Onyx.merge()` as explored in https://expensify.slack.com/archives/C05DWUDHVK7/p1692139468252109.
    // I want to clean this up at some point, but it's possible this will live in the code for a while so I've created https://github.com/Expensify/App/issues/25417
    // to remind me to do this.
    if (isDistanceRequest) {
        optimisticTransaction = fastMerge(existingTransaction, optimisticTransaction, false);
    }

    // STEP 4: Build optimistic reportActions. We need:
    // 1. CREATED action for the chatReport
    // 2. CREATED action for the iouReport
    // 3. IOU action for the iouReport
    // 4. The transaction thread, which requires the iouAction, and CREATED action for the transaction thread
    // 5. REPORT_PREVIEW action for the chatReport
    // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
    const [optimisticCreatedActionForChat, optimisticCreatedActionForIOUReport, iouAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
        buildOptimisticMoneyRequestEntities({
            iouReport,
            type: CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            amount,
            currency,
            comment,
            payeeEmail,
            participants: [participant],
            transactionID: optimisticTransaction.transactionID,
            paymentType: isSelectedManagerMcTest(participant.login) || transactionParams.receipt?.isTestDriveReceipt ? CONST.IOU.PAYMENT_TYPE.ELSEWHERE : undefined,
            existingTransactionThreadReportID: linkedTrackedExpenseReportAction?.childReportID,
            optimisticCreatedReportActionID,
            linkedTrackedExpenseReportAction,
        });

    let reportPreviewAction = shouldCreateNewMoneyRequestReport ? null : getReportPreviewAction(chatReport.reportID, iouReport.reportID);

    if (reportPreviewAction) {
        reportPreviewAction = updateReportPreview(iouReport, reportPreviewAction, false, comment, optimisticTransaction);
    } else {
        reportPreviewAction = buildOptimisticReportPreview(chatReport, iouReport, comment, optimisticTransaction, undefined, optimisticReportPreviewActionID);
        chatReport.lastVisibleActionCreated = reportPreviewAction.created;

        // Generated ReportPreview action is a parent report action of the iou report.
        // We are setting the iou report's parentReportActionID to display subtitle correctly in IOU page when offline.
        iouReport.parentReportActionID = reportPreviewAction.reportActionID;
    }

    const shouldCreateOptimisticPersonalDetails = isNewChatReport && !allPersonalDetails[payerAccountID];
    // Add optimistic personal details for participant
    const optimisticPersonalDetailListAction = shouldCreateOptimisticPersonalDetails
        ? {
              [payerAccountID]: {
                  accountID: payerAccountID,
                  // Disabling this line since participant.displayName can be an empty string
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  displayName: formatPhoneNumber(participant.displayName || payerEmail),
                  login: participant.login,
                  isOptimisticPersonalDetail: true,
              },
          }
        : {};

    const predictedNextStatus = policy?.reimbursementChoice === CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_NO ? CONST.REPORT.STATUS_NUM.CLOSED : CONST.REPORT.STATUS_NUM.OPEN;
    const optimisticNextStep = buildNextStep(iouReport, predictedNextStatus);

    // STEP 5: Build Onyx Data
    const [optimisticData, successData, failureData] = buildOnyxDataForMoneyRequest({
        participant,
        isNewChatReport,
        shouldCreateNewMoneyRequestReport,
        policyParams: {
            policy,
            policyCategories,
            policyTagList,
        },
        optimisticParams: {
            chat: {
                report: chatReport,
                createdAction: optimisticCreatedActionForChat,
                reportPreviewAction,
            },
            iou: {
                report: iouReport,
                createdAction: optimisticCreatedActionForIOUReport,
                action: iouAction,
            },
            transactionParams: {
                transaction: optimisticTransaction,
                transactionThreadReport: optimisticTransactionThread,
                transactionThreadCreatedReportAction: optimisticCreatedActionForTransactionThread,
            },
            policyRecentlyUsed: {
                categories: optimisticPolicyRecentlyUsedCategories,
                tags: optimisticPolicyRecentlyUsedTags,
                currencies: optimisticPolicyRecentlyUsedCurrencies,
            },
            personalDetailListAction: optimisticPersonalDetailListAction,
            nextStep: optimisticNextStep,
            testDriveCommentReportActionID,
        },
        retryParams,
    });

    return {
        payerAccountID,
        payerEmail,
        iouReport,
        chatReport,
        transaction: optimisticTransaction,
        iouAction,
        createdChatReportActionID: isNewChatReport ? optimisticCreatedActionForChat.reportActionID : undefined,
        createdIOUReportActionID: shouldCreateNewMoneyRequestReport ? optimisticCreatedActionForIOUReport.reportActionID : undefined,
        reportPreviewAction,
        transactionThreadReportID: optimisticTransactionThread?.reportID,
        createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        onyxData: {
            optimisticData,
            successData,
            failureData,
        },
    };
}

function computePerDiemExpenseAmount(customUnit: TransactionCustomUnit) {
    const subRates = customUnit.subRates ?? [];
    return subRates.reduce((total, subRate) => total + subRate.quantity * subRate.rate, 0);
}

function computePerDiemExpenseMerchant(customUnit: TransactionCustomUnit, policy: OnyxEntry<OnyxTypes.Policy>) {
    if (!customUnit.customUnitRateID) {
        return '';
    }
    const policyCustomUnit = getPerDiemCustomUnit(policy);
    const rate = policyCustomUnit?.rates?.[customUnit.customUnitRateID];
    const locationName = rate?.name ?? '';
    const startDate = customUnit.attributes?.dates.start;
    const endDate = customUnit.attributes?.dates.end;
    if (!startDate || !endDate) {
        return locationName;
    }
    const formattedTime = DateUtils.getFormattedDateRangeForPerDiem(new Date(startDate), new Date(endDate));
    return `${locationName}, ${formattedTime}`;
}

function computeDefaultPerDiemExpenseComment(customUnit: TransactionCustomUnit, currency: string) {
    const subRates = customUnit.subRates ?? [];
    const subRateComments = subRates.map((subRate) => {
        const rate = subRate.rate ?? 0;
        const rateComment = subRate.name ?? '';
        const quantity = subRate.quantity ?? 0;
        return `${quantity}x ${rateComment} @ ${convertAmountToDisplayString(rate, currency)}`;
    });
    return subRateComments.join(', ');
}

/**
 * Gathers all the data needed to submit a per diem expense. It attempts to find existing reports, iouReports, and receipts. If it doesn't find them, then
 * it creates optimistic versions of them and uses those instead
 */
function getPerDiemExpenseInformation(perDiemExpenseInformation: PerDiemExpenseInformationParams): MoneyRequestInformation {
    const {parentChatReport, transactionParams, participantParams, policyParams = {}, moneyRequestReportID = ''} = perDiemExpenseInformation;
    const {payeeAccountID = userAccountID, payeeEmail = currentUserEmail, participant} = participantParams;
    const {policy, policyCategories, policyTagList} = policyParams;
    const {comment = '', currency, created, category, tag, customUnit, billable, attendees} = transactionParams;

    const amount = computePerDiemExpenseAmount(customUnit);
    const merchant = computePerDiemExpenseMerchant(customUnit, policy);
    const defaultComment = computeDefaultPerDiemExpenseComment(customUnit, currency);
    const finalComment = comment || defaultComment;

    const payerEmail = addSMSDomainIfPhoneNumber(participant.login ?? '');
    const payerAccountID = Number(participant.accountID);
    const isPolicyExpenseChat = participant.isPolicyExpenseChat;

    // STEP 1: Get existing chat report OR build a new optimistic one
    let isNewChatReport = false;
    let chatReport = !isEmptyObject(parentChatReport) && parentChatReport?.reportID ? parentChatReport : null;

    // If this is a policyExpenseChat, the chatReport must exist and we can get it from Onyx.
    // report is null if the flow is initiated from the global create menu. However, participant always stores the reportID if it exists, which is the case for policyExpenseChats
    if (!chatReport && isPolicyExpenseChat) {
        chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.reportID}`] ?? null;
    }

    if (!chatReport) {
        chatReport = getChatByParticipants([payerAccountID, payeeAccountID]) ?? null;
    }

    // If we still don't have a report, it likely doesn't exist and we need to build an optimistic one
    if (!chatReport) {
        isNewChatReport = true;
        chatReport = buildOptimisticChatReport({
            participantList: [payerAccountID, payeeAccountID],
        });
    }

    // STEP 2: Get the Expense/IOU report. If the moneyRequestReportID has been provided, we want to add the transaction to this specific report.
    // If no such reportID has been provided, let's use the chatReport.iouReportID property. In case that is not present, build a new optimistic Expense/IOU report.
    let iouReport: OnyxInputValue<OnyxTypes.Report> = null;
    if (moneyRequestReportID) {
        iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${moneyRequestReportID}`] ?? null;
    } else {
        iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReport.iouReportID}`] ?? null;
    }

    const shouldCreateNewMoneyRequestReport = shouldCreateNewMoneyRequestReportReportUtils(iouReport, chatReport, false);

    if (!iouReport || shouldCreateNewMoneyRequestReport) {
        iouReport = isPolicyExpenseChat
            ? buildOptimisticExpenseReport(chatReport.reportID, chatReport.policyID, payeeAccountID, amount, currency)
            : buildOptimisticIOUReport(payeeAccountID, payerAccountID, amount, chatReport.reportID, currency);
    } else if (isPolicyExpenseChat) {
        iouReport = {...iouReport};
        // Because of the Expense reports are stored as negative values, we subtract the total from the amount
        if (iouReport?.currency === currency) {
            if (!Number.isNaN(iouReport.total) && iouReport.total !== undefined) {
                iouReport.total -= amount;
            }

            if (typeof iouReport.unheldTotal === 'number') {
                iouReport.unheldTotal -= amount;
            }
        }
    } else {
        iouReport = updateIOUOwnerAndTotal(iouReport, payeeAccountID, amount, currency);
    }

    // STEP 3: Build an optimistic transaction
    const optimisticTransaction = buildOptimisticTransaction({
        policy,
        transactionParams: {
            amount: isExpenseReport(iouReport) ? -amount : amount,
            currency,
            reportID: iouReport.reportID,
            comment: finalComment,
            created,
            category,
            merchant,
            tag,
            customUnit,
            billable,
            pendingFields: {subRates: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
            attendees,
        },
    });
    // This is to differentiate between a normal expense and a per diem expense
    optimisticTransaction.iouRequestType = CONST.IOU.REQUEST_TYPE.PER_DIEM;
    optimisticTransaction.hasEReceipt = true;

    const optimisticPolicyRecentlyUsedCategories = buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, category);
    const optimisticPolicyRecentlyUsedTags = buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, tag);
    const optimisticPolicyRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(currency);
    const optimisticPolicyRecentlyUsedDestinations = buildOptimisticPolicyRecentlyUsedDestinations(iouReport.policyID, customUnit.customUnitRateID);

    // STEP 4: Build optimistic reportActions. We need:
    // 1. CREATED action for the chatReport
    // 2. CREATED action for the iouReport
    // 3. IOU action for the iouReport
    // 4. The transaction thread, which requires the iouAction, and CREATED action for the transaction thread
    // 5. REPORT_PREVIEW action for the chatReport
    // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
    const [optimisticCreatedActionForChat, optimisticCreatedActionForIOUReport, iouAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
        buildOptimisticMoneyRequestEntities({
            iouReport,
            type: CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            amount,
            currency,
            comment,
            payeeEmail,
            participants: [participant],
            transactionID: optimisticTransaction.transactionID,
        });

    let reportPreviewAction = shouldCreateNewMoneyRequestReport ? null : getReportPreviewAction(chatReport.reportID, iouReport.reportID);

    if (reportPreviewAction) {
        reportPreviewAction = updateReportPreview(iouReport, reportPreviewAction, false, comment, optimisticTransaction);
    } else {
        reportPreviewAction = buildOptimisticReportPreview(chatReport, iouReport, comment, optimisticTransaction);
        chatReport.lastVisibleActionCreated = reportPreviewAction.created;

        // Generated ReportPreview action is a parent report action of the iou report.
        // We are setting the iou report's parentReportActionID to display subtitle correctly in IOU page when offline.
        iouReport.parentReportActionID = reportPreviewAction.reportActionID;
    }

    const shouldCreateOptimisticPersonalDetails = isNewChatReport && !allPersonalDetails[payerAccountID];
    // Add optimistic personal details for participant
    const optimisticPersonalDetailListAction = shouldCreateOptimisticPersonalDetails
        ? {
              [payerAccountID]: {
                  accountID: payerAccountID,
                  // Disabling this line since participant.displayName can be an empty string
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  displayName: formatPhoneNumber(participant.displayName || payerEmail),
                  login: participant.login,
                  isOptimisticPersonalDetail: true,
              },
          }
        : {};

    const predictedNextStatus = policy?.reimbursementChoice === CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_NO ? CONST.REPORT.STATUS_NUM.CLOSED : CONST.REPORT.STATUS_NUM.OPEN;
    const optimisticNextStep = buildNextStep(iouReport, predictedNextStatus);

    // STEP 5: Build Onyx Data
    const [optimisticData, successData, failureData] = buildOnyxDataForMoneyRequest({
        isNewChatReport,
        shouldCreateNewMoneyRequestReport,
        policyParams: {
            policy,
            policyCategories,
            policyTagList,
        },
        optimisticParams: {
            chat: {
                report: chatReport,
                createdAction: optimisticCreatedActionForChat,
                reportPreviewAction,
            },
            iou: {
                report: iouReport,
                createdAction: optimisticCreatedActionForIOUReport,
                action: iouAction,
            },
            transactionParams: {
                transaction: optimisticTransaction,
                transactionThreadReport: optimisticTransactionThread,
                transactionThreadCreatedReportAction: optimisticCreatedActionForTransactionThread,
            },
            policyRecentlyUsed: {
                categories: optimisticPolicyRecentlyUsedCategories,
                tags: optimisticPolicyRecentlyUsedTags,
                currencies: optimisticPolicyRecentlyUsedCurrencies,
                destinations: optimisticPolicyRecentlyUsedDestinations,
            },
            personalDetailListAction: optimisticPersonalDetailListAction,
            nextStep: optimisticNextStep,
        },
    });

    return {
        payerAccountID,
        payerEmail,
        iouReport,
        chatReport,
        transaction: optimisticTransaction,
        iouAction,
        createdChatReportActionID: isNewChatReport ? optimisticCreatedActionForChat.reportActionID : undefined,
        createdIOUReportActionID: shouldCreateNewMoneyRequestReport ? optimisticCreatedActionForIOUReport.reportActionID : undefined,
        reportPreviewAction,
        transactionThreadReportID: optimisticTransactionThread?.reportID,
        createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        onyxData: {
            optimisticData,
            successData,
            failureData,
        },
        billable,
    };
}

/**
 * Gathers all the data needed to make an expense. It attempts to find existing reports, iouReports, and receipts. If it doesn't find them, then
 * it creates optimistic versions of them and uses those instead
 */
function getTrackExpenseInformation(params: GetTrackExpenseInformationParams): TrackExpenseInformation | null {
    const {parentChatReport, moneyRequestReportID = '', existingTransactionID, participantParams, policyParams, transactionParams, retryParams} = params;
    const {payeeAccountID = userAccountID, payeeEmail = currentUserEmail, participant} = participantParams;
    const {policy, policyCategories, policyTagList} = policyParams;
    const {comment, amount, currency, created, merchant, receipt, category, tag, taxCode, taxAmount, billable, linkedTrackedExpenseReportAction, attendees} = transactionParams;

    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    const isPolicyExpenseChat = participant.isPolicyExpenseChat;

    // STEP 1: Get existing chat report
    let chatReport = !isEmptyObject(parentChatReport) && parentChatReport?.reportID ? parentChatReport : null;
    // The chatReport always exists, and we can get it from Onyx if chatReport is null.
    if (!chatReport) {
        chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.reportID}`] ?? null;
    }

    // If we still don't have a report, it likely doesn't exist, and we will early return here as it should not happen
    // Maybe later, we can build an optimistic selfDM chat.
    if (!chatReport) {
        return null;
    }

    // Check if the report is a draft
    const isDraftReportLocal = isDraftReport(chatReport?.reportID);

    let createdWorkspaceParams: CreateWorkspaceParams | undefined;

    if (isDraftReportLocal) {
        const workspaceData = buildPolicyData({
            policyOwnerEmail: undefined,
            makeMeAdmin: policy?.makeMeAdmin,
            policyName: policy?.name,
            policyID: policy?.id,
            expenseReportId: chatReport?.reportID,
            engagementChoice: CONST.ONBOARDING_CHOICES.TRACK_WORKSPACE,
        });
        createdWorkspaceParams = workspaceData.params;
        optimisticData.push(...workspaceData.optimisticData);
        successData.push(...workspaceData.successData);
        failureData.push(...workspaceData.failureData);
    }

    // STEP 2: If not in the self-DM flow, we need to use the expense report.
    // For this, first use the chatReport.iouReportID property. Build a new optimistic expense report if needed.
    const shouldUseMoneyReport = !!isPolicyExpenseChat;

    let iouReport: OnyxInputValue<OnyxTypes.Report> = null;
    let shouldCreateNewMoneyRequestReport = false;

    if (shouldUseMoneyReport) {
        if (moneyRequestReportID) {
            iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${moneyRequestReportID}`] ?? null;
        } else {
            iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReport.iouReportID}`] ?? null;
        }
        const isScanRequest = isScanRequestTransactionUtils({amount, receipt});
        shouldCreateNewMoneyRequestReport = shouldCreateNewMoneyRequestReportReportUtils(iouReport, chatReport, isScanRequest);
        if (!iouReport || shouldCreateNewMoneyRequestReport) {
            iouReport = buildOptimisticExpenseReport(chatReport.reportID, chatReport.policyID, payeeAccountID, amount, currency, amount);
        } else {
            iouReport = {...iouReport};
            // Because of the Expense reports are stored as negative values, we subtract the total from the amount
            if (iouReport?.currency === currency) {
                if (!Number.isNaN(iouReport.total) && iouReport.total !== undefined && typeof iouReport.nonReimbursableTotal === 'number') {
                    iouReport.total -= amount;
                    iouReport.nonReimbursableTotal -= amount;
                }

                if (typeof iouReport.unheldTotal === 'number' && typeof iouReport.unheldNonReimbursableTotal === 'number') {
                    iouReport.unheldTotal -= amount;
                    iouReport.unheldNonReimbursableTotal -= amount;
                }
            }
        }
    }

    // If shouldUseMoneyReport is true, the iouReport was defined.
    // But we'll use the `shouldUseMoneyReport && iouReport` check further instead of `shouldUseMoneyReport` to avoid TS errors.

    // STEP 3: Build optimistic receipt and transaction
    const receiptObject: Receipt = {};
    let filename;
    if (receipt?.source) {
        receiptObject.source = receipt.source;
        receiptObject.state = receipt.state ?? CONST.IOU.RECEIPT_STATE.SCAN_READY;
        filename = receipt.name;
    }
    const existingTransaction = allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${existingTransactionID ?? CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`];
    if (!filename) {
        filename = existingTransaction?.filename;
    }
    const isDistanceRequest = existingTransaction && isDistanceRequestTransactionUtils(existingTransaction);
    let optimisticTransaction = buildOptimisticTransaction({
        existingTransactionID,
        existingTransaction,
        policy,
        transactionParams: {
            amount: -amount,
            currency,
            reportID: shouldUseMoneyReport && iouReport ? iouReport.reportID : CONST.REPORT.UNREPORTED_REPORT_ID,
            comment,
            created,
            merchant,
            receipt: receiptObject,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            pendingFields: isDistanceRequest ? {waypoints: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : undefined,
            reimbursable: false,
            filename,
            attendees,
        },
    });

    // If there is an existing transaction (which is the case for distance requests), then the data from the existing transaction
    // needs to be manually merged into the optimistic transaction. This is because buildOnyxDataForMoneyRequest() uses `Onyx.set()` for the transaction
    // data. This is a big can of worms to change it to `Onyx.merge()` as explored in https://expensify.slack.com/archives/C05DWUDHVK7/p1692139468252109.
    // I want to clean this up at some point, but it's possible this will live in the code for a while so I've created https://github.com/Expensify/App/issues/25417
    // to remind me to do this.
    if (isDistanceRequest) {
        optimisticTransaction = fastMerge(existingTransaction, optimisticTransaction, false);
    }

    // STEP 4: Build optimistic reportActions. We need:
    // 1. CREATED action for the iouReport (if tracking in the Expense chat)
    // 2. IOU action for the iouReport (if tracking in the Expense chat), otherwise – for chatReport
    // 3. The transaction thread, which requires the iouAction, and CREATED action for the transaction thread
    // 4. REPORT_PREVIEW action for the chatReport (if tracking in the Expense chat)
    const [, optimisticCreatedActionForIOUReport, iouAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] = buildOptimisticMoneyRequestEntities({
        iouReport: shouldUseMoneyReport && iouReport ? iouReport : chatReport,
        type: CONST.IOU.REPORT_ACTION_TYPE.TRACK,
        amount,
        currency,
        comment,
        payeeEmail,
        participants: [participant],
        transactionID: optimisticTransaction.transactionID,
        isPersonalTrackingExpense: !shouldUseMoneyReport,
        existingTransactionThreadReportID: linkedTrackedExpenseReportAction?.childReportID,
        linkedTrackedExpenseReportAction,
    });

    let reportPreviewAction: OnyxInputValue<OnyxTypes.ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.REPORT_PREVIEW>> = null;
    if (shouldUseMoneyReport && iouReport) {
        reportPreviewAction = shouldCreateNewMoneyRequestReport ? null : getReportPreviewAction(chatReport.reportID, iouReport.reportID);

        if (reportPreviewAction) {
            reportPreviewAction = updateReportPreview(iouReport, reportPreviewAction, false, comment, optimisticTransaction);
        } else {
            reportPreviewAction = buildOptimisticReportPreview(chatReport, iouReport, comment, optimisticTransaction);
            // Generated ReportPreview action is a parent report action of the iou report.
            // We are setting the iou report's parentReportActionID to display subtitle correctly in IOU page when offline.
            iouReport.parentReportActionID = reportPreviewAction.reportActionID;
        }
    }

    let actionableTrackExpenseWhisper: OnyxInputValue<OnyxTypes.ReportAction> = null;
    if (!isPolicyExpenseChat) {
        actionableTrackExpenseWhisper = buildOptimisticActionableTrackExpenseWhisper(iouAction, optimisticTransaction.transactionID);
    }

    // STEP 5: Build Onyx Data
    const trackExpenseOnyxData = buildOnyxDataForTrackExpense({
        participant,
        chat: {report: chatReport, previewAction: reportPreviewAction},
        iou: {report: iouReport, action: iouAction, createdAction: optimisticCreatedActionForIOUReport},
        transactionParams: {
            transaction: optimisticTransaction,
            threadCreatedReportAction: optimisticCreatedActionForTransactionThread,
            threadReport: optimisticTransactionThread ?? {},
        },
        policyParams: {policy, tagList: policyTagList, categories: policyCategories},
        shouldCreateNewMoneyRequestReport,
        actionableTrackExpenseWhisper,
        retryParams,
    });

    return {
        createdWorkspaceParams,
        chatReport,
        iouReport: iouReport ?? undefined,
        transaction: optimisticTransaction,
        iouAction,
        createdIOUReportActionID: shouldCreateNewMoneyRequestReport ? optimisticCreatedActionForIOUReport.reportActionID : undefined,
        reportPreviewAction: reportPreviewAction ?? undefined,
        transactionThreadReportID: optimisticTransactionThread.reportID,
        createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        actionableWhisperReportActionIDParam: actionableTrackExpenseWhisper?.reportActionID,
        onyxData: {
            optimisticData: optimisticData.concat(trackExpenseOnyxData[0]),
            successData: successData.concat(trackExpenseOnyxData[1]),
            failureData: failureData.concat(trackExpenseOnyxData[2]),
        },
    };
}

/**
 * Compute the diff amount when we update the transaction
 */
function calculateDiffAmount(
    iouReport: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report>,
    updatedTransaction: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Transaction>,
    transaction: OnyxEntry<OnyxTypes.Transaction>,
): number | null {
    if (!iouReport) {
        return 0;
    }
    const isExpenseReportLocal = isExpenseReport(iouReport);
    const updatedCurrency = getCurrency(updatedTransaction);
    const currentCurrency = getCurrency(transaction);

    const currentAmount = getAmount(transaction, isExpenseReportLocal);
    const updatedAmount = getAmount(updatedTransaction, isExpenseReportLocal);

    if (updatedCurrency === currentCurrency && currentAmount === updatedAmount) {
        return 0;
    }

    if (updatedCurrency === iouReport.currency && currentCurrency === iouReport.currency) {
        // Calculate the diff between the updated amount and the current amount if the currency of the updated and current transactions have the same currency as the report
        return updatedAmount - currentAmount;
    }

    return null;
}

/**
 * @param transactionID
 * @param transactionThreadReportID
 * @param transactionChanges
 * @param [transactionChanges.created] Present when updated the date field
 * @param policy  May be undefined, an empty object, or an object matching the Policy type (src/types/onyx/Policy.ts)
 * @param policyTagList
 * @param policyCategories
 */
function getUpdateMoneyRequestParams(
    transactionID: string | undefined,
    transactionThreadReportID: string | undefined,
    transactionChanges: TransactionChanges,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxTypes.OnyxInputOrEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxTypes.OnyxInputOrEntry<OnyxTypes.PolicyCategories>,
    violations?: OnyxEntry<OnyxTypes.TransactionViolations>,
    hash?: number,
): UpdateMoneyRequestData {
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    // Step 1: Set any "pending fields" (ones updated while the user was offline) to have error messages in the failureData
    const pendingFields: OnyxTypes.Transaction['pendingFields'] = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE]));
    const clearedPendingFields = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, null]));
    const errorFields = Object.fromEntries(Object.keys(pendingFields).map((key) => [key, {[DateUtils.getMicroseconds()]: Localize.translateLocal('iou.error.genericEditFailureMessage')}]));

    // Step 2: Get all the collections being updated
    const transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const isTransactionOnHold = isOnHold(transaction);
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.parentReportID}`] ?? null;
    const isFromExpenseReport = isExpenseReport(iouReport);
    const updatedTransaction: OnyxEntry<OnyxTypes.Transaction> = transaction
        ? getUpdatedTransaction({
              transaction,
              transactionChanges,
              isFromExpenseReport,
              policy,
          })
        : undefined;
    const transactionDetails = getTransactionDetails(updatedTransaction);

    if (transactionDetails?.waypoints) {
        // This needs to be a JSON string since we're sending this to the MapBox API
        transactionDetails.waypoints = JSON.stringify(transactionDetails.waypoints);
    }

    const dataToIncludeInParams: Partial<TransactionDetails> = Object.fromEntries(Object.entries(transactionDetails ?? {}).filter(([key]) => Object.keys(transactionChanges).includes(key)));

    const params: UpdateMoneyRequestParams = {
        ...dataToIncludeInParams,
        reportID: iouReport?.reportID,
        transactionID,
    };

    const hasPendingWaypoints = 'waypoints' in transactionChanges;
    const hasModifiedDistanceRate = 'customUnitRateID' in transactionChanges;
    const hasModifiedCreated = 'created' in transactionChanges;
    const hasModifiedAmount = 'amount' in transactionChanges;
    if (transaction && updatedTransaction && (hasPendingWaypoints || hasModifiedDistanceRate)) {
        // Delete the draft transaction when editing waypoints when the server responds successfully and there are no errors
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`,
            value: null,
        });

        // Revert the transaction's amount to the original value on failure.
        // The IOU Report will be fully reverted in the failureData further below.
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                amount: transaction.amount,
                modifiedAmount: transaction.modifiedAmount,
                modifiedMerchant: transaction.modifiedMerchant,
                modifiedCurrency: transaction.modifiedCurrency,
            },
        });
    }

    // Step 3: Build the modified expense report actions
    // We don't create a modified report action if:
    // - we're updating the waypoints
    // - we're updating the distance rate while the waypoints are still pending
    // In these cases, there isn't a valid optimistic mileage data we can use,
    // and the report action is created on the server with the distance-related response from the MapBox API
    const updatedReportAction = buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, isFromExpenseReport, policy, updatedTransaction);
    if (!hasPendingWaypoints && !(hasModifiedDistanceRate && isFetchingWaypointsFromServer(transaction))) {
        params.reportActionID = updatedReportAction.reportActionID;

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction as OnyxTypes.ReportAction,
            },
        });
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.reportID}`,
            value: {
                lastVisibleActionCreated: updatedReportAction.created,
                lastReadTime: updatedReportAction.created,
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.reportID}`,
            value: {
                lastVisibleActionCreated: transactionThread?.lastVisibleActionCreated,
                lastReadTime: transactionThread?.lastReadTime,
            },
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    ...(updatedReportAction as OnyxTypes.ReportAction),
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericEditFailureMessage'),
                },
            },
        });
    }

    // Step 4: Compute the IOU total and update the report preview message (and report header) so LHN amount owed is correct.
    const calculatedDiffAmount = calculateDiffAmount(iouReport, updatedTransaction, transaction);
    // If calculatedDiffAmount is null it means we cannot calculate the new iou report total from front-end due to currency differences.
    const isTotalIndeterminate = calculatedDiffAmount === null;
    const diff = calculatedDiffAmount ?? 0;

    let updatedMoneyRequestReport: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report>;
    if (!iouReport) {
        updatedMoneyRequestReport = null;
    } else if ((isExpenseReport(iouReport) || isInvoiceReportReportUtils(iouReport)) && !Number.isNaN(iouReport.total) && iouReport.total !== undefined) {
        // For expense report, the amount is negative, so we should subtract total from diff
        updatedMoneyRequestReport = {
            ...iouReport,
            total: iouReport.total - diff,
        };
        if (!transaction?.reimbursable && typeof updatedMoneyRequestReport.nonReimbursableTotal === 'number') {
            updatedMoneyRequestReport.nonReimbursableTotal -= diff;
        }
        if (!isTransactionOnHold) {
            if (typeof updatedMoneyRequestReport.unheldTotal === 'number') {
                updatedMoneyRequestReport.unheldTotal -= diff;
            }
            if (!transaction?.reimbursable && typeof updatedMoneyRequestReport.unheldNonReimbursableTotal === 'number') {
                updatedMoneyRequestReport.unheldNonReimbursableTotal -= diff;
            }
        }
    } else {
        updatedMoneyRequestReport = updateIOUOwnerAndTotal(
            iouReport,
            updatedReportAction.actorAccountID ?? CONST.DEFAULT_NUMBER_ID,
            diff,
            getCurrency(transaction),
            false,
            true,
            isTransactionOnHold,
        );
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {...updatedMoneyRequestReport, ...(isTotalIndeterminate && {pendingFields: {total: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}})},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.parentReportID}`,
            value: getOutstandingChildRequest(updatedMoneyRequestReport),
        },
    );
    if (isOneTransactionThread(transactionThread ?? undefined, iouReport ?? undefined, undefined)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                lastReadTime: updatedReportAction.created,
            },
        });
    }
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
        value: {pendingAction: null, ...(isTotalIndeterminate && {pendingFields: {total: null}})},
    });

    // Optimistically modify the transaction and the transaction thread
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...updatedTransaction,
            pendingFields,
            errorFields: null,
        },
    });

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
        value: {
            lastActorAccountID: updatedReportAction.actorAccountID,
        },
    });

    if (isScanning(transaction) && ('amount' in transactionChanges || 'currency' in transactionChanges)) {
        if (transactionThread?.parentReportActionID) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
                value: {
                    [transactionThread?.parentReportActionID]: {
                        originalMessage: {
                            whisperedTo: [],
                        },
                    },
                },
            });
        }

        if (iouReport?.parentReportActionID) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.parentReportID}`,
                value: {
                    [iouReport.parentReportActionID]: {
                        originalMessage: {
                            whisperedTo: [],
                        },
                    },
                },
            });
        }
    }

    // Update recently used categories if the category is changed
    const hasModifiedCategory = 'category' in transactionChanges;
    if (hasModifiedCategory) {
        const optimisticPolicyRecentlyUsedCategories = buildOptimisticPolicyRecentlyUsedCategories(iouReport?.policyID, transactionChanges.category);
        if (optimisticPolicyRecentlyUsedCategories.length) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }
    }

    // Update recently used currencies if the currency is changed
    if ('currency' in transactionChanges) {
        const optimisticRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(transactionChanges.currency);
        if (optimisticRecentlyUsedCurrencies.length) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: ONYXKEYS.RECENTLY_USED_CURRENCIES,
                value: optimisticRecentlyUsedCurrencies,
            });
        }
    }

    // Update recently used categories if the tag is changed
    const hasModifiedTag = 'tag' in transactionChanges;
    if (hasModifiedTag) {
        const optimisticPolicyRecentlyUsedTags = buildOptimisticPolicyRecentlyUsedTags(iouReport?.policyID, transactionChanges.tag);
        if (!isEmptyObject(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport?.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    }

    const overLimitViolation = violations?.find((violation) => violation.name === 'overLimit');
    // Update violation limit, if we modify attendees. The given limit value is for a single attendee, if we have multiple attendees we should multiply limit by attendee count
    if ('attendees' in transactionChanges && !!overLimitViolation) {
        const limitForSingleAttendee = ViolationsUtils.getViolationAmountLimit(overLimitViolation);
        if (limitForSingleAttendee * (transactionChanges?.attendees?.length ?? 1) > Math.abs(getAmount(transaction))) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
                value: violations?.filter((violation) => violation.name !== 'overLimit') ?? [],
            });
        }
    }

    if (Array.isArray(params?.attendees)) {
        params.attendees = JSON.stringify(params?.attendees);
    }

    // Clear out the error fields and loading states on success
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields: null,
            routes: null,
        },
    });

    // Clear out loading states, pending fields, and add the error fields
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...transaction,
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields,
        },
    });

    if (iouReport) {
        // Reset the iouReport to its original state
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {...iouReport, ...(isTotalIndeterminate && {pendingFields: {total: null}})},
        });
    }

    const hasModifiedCurrency = 'currency' in transactionChanges;
    const hasModifiedComment = 'comment' in transactionChanges;
    const hasModifiedDate = 'date' in transactionChanges;

    const isInvoice = isInvoiceReportReportUtils(iouReport);
    if (
        policy &&
        isPaidGroupPolicy(policy) &&
        !isInvoice &&
        updatedTransaction &&
        (hasModifiedTag || hasModifiedCategory || hasModifiedComment || hasModifiedDistanceRate || hasModifiedDate || hasModifiedCurrency || hasModifiedAmount || hasModifiedCreated)
    ) {
        const currentTransactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`] ?? [];
        // If the amount, currency or date have been modified, we remove the duplicate violations since they would be out of date as the transaction has changed
        const optimisticViolations =
            hasModifiedAmount || hasModifiedDate || hasModifiedCurrency
                ? currentTransactionViolations.filter((violation) => violation.name !== CONST.VIOLATIONS.DUPLICATED_TRANSACTION)
                : currentTransactionViolations;
        const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(
            updatedTransaction,
            optimisticViolations,
            policy,
            policyTagList ?? {},
            policyCategories ?? {},
            hasDependentTags(policy, policyTagList ?? {}),
            isInvoice,
        );
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: currentTransactionViolations,
        });
        if (hash) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`,
                value: {
                    data: {
                        [`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`]: violationsOnyxData.value,
                    },
                },
            });
            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`,
                value: {
                    data: {
                        [`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`]: currentTransactionViolations,
                    },
                },
            });
        }
        if (violationsOnyxData && (iouReport?.statusNum ?? CONST.REPORT.STATUS_NUM.OPEN) === CONST.REPORT.STATUS_NUM.OPEN) {
            const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`] ?? {};
            const shouldFixViolations = Array.isArray(violationsOnyxData.value) && violationsOnyxData.value.length > 0;
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`,
                value: buildNextStep(iouReport ?? undefined, iouReport?.statusNum ?? CONST.REPORT.STATUS_NUM.OPEN, shouldFixViolations),
            });
            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`,
                value: currentNextStep,
            });
        }
    }

    // Reset the transaction thread to its original state
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
        value: transactionThread,
    });

    return {
        params,
        onyxData: {optimisticData, successData, failureData},
    };
}

/**
 * @param transactionID
 * @param transactionThreadReportID
 * @param transactionChanges
 * @param [transactionChanges.created] Present when updated the date field
 * @param policy  May be undefined, an empty object, or an object matching the Policy type (src/types/onyx/Policy.ts)
 */
function getUpdateTrackExpenseParams(
    transactionID: string | undefined,
    transactionThreadReportID: string | undefined,
    transactionChanges: TransactionChanges,
    policy: OnyxEntry<OnyxTypes.Policy>,
): UpdateMoneyRequestData {
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    // Step 1: Set any "pending fields" (ones updated while the user was offline) to have error messages in the failureData
    const pendingFields = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE]));
    const clearedPendingFields = Object.fromEntries(Object.keys(transactionChanges).map((key) => [key, null]));
    const errorFields = Object.fromEntries(Object.keys(pendingFields).map((key) => [key, {[DateUtils.getMicroseconds()]: Localize.translateLocal('iou.error.genericEditFailureMessage')}]));

    // Step 2: Get all the collections being updated
    const transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread?.parentReportID}`] ?? null;
    const updatedTransaction = transaction
        ? getUpdatedTransaction({
              transaction,
              transactionChanges,
              isFromExpenseReport: false,
              policy,
          })
        : null;
    const transactionDetails = getTransactionDetails(updatedTransaction);

    if (transactionDetails?.waypoints) {
        // This needs to be a JSON string since we're sending this to the MapBox API
        transactionDetails.waypoints = JSON.stringify(transactionDetails.waypoints);
    }

    const dataToIncludeInParams: Partial<TransactionDetails> = Object.fromEntries(Object.entries(transactionDetails ?? {}).filter(([key]) => Object.keys(transactionChanges).includes(key)));

    const params: UpdateMoneyRequestParams = {
        ...dataToIncludeInParams,
        reportID: chatReport?.reportID,
        transactionID,
    };

    const hasPendingWaypoints = 'waypoints' in transactionChanges;
    const hasModifiedDistanceRate = 'customUnitRateID' in transactionChanges;
    if (transaction && updatedTransaction && (hasPendingWaypoints || hasModifiedDistanceRate)) {
        // Delete the draft transaction when editing waypoints when the server responds successfully and there are no errors
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`,
            value: null,
        });

        // Revert the transaction's amount to the original value on failure.
        // The IOU Report will be fully reverted in the failureData further below.
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                amount: transaction.amount,
                modifiedAmount: transaction.modifiedAmount,
                modifiedMerchant: transaction.modifiedMerchant,
            },
        });
    }

    // Step 3: Build the modified expense report actions
    // We don't create a modified report action if:
    // - we're updating the waypoints
    // - we're updating the distance rate while the waypoints are still pending
    // In these cases, there isn't a valid optimistic mileage data we can use,
    // and the report action is created on the server with the distance-related response from the MapBox API
    const updatedReportAction = buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, false, policy, updatedTransaction);
    if (!hasPendingWaypoints && !(hasModifiedDistanceRate && isFetchingWaypointsFromServer(transaction))) {
        params.reportActionID = updatedReportAction.reportActionID;

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction as OnyxTypes.ReportAction,
            },
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread?.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    ...(updatedReportAction as OnyxTypes.ReportAction),
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericEditFailureMessage'),
                },
            },
        });
    }

    // Step 4: Update the report preview message (and report header) so LHN amount tracked is correct.
    // Optimistically modify the transaction and the transaction thread
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...updatedTransaction,
            pendingFields,
            errorFields: null,
        },
    });

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
        value: {
            lastActorAccountID: updatedReportAction.actorAccountID,
        },
    });

    if (isScanning(transaction) && transactionThread?.parentReportActionID && ('amount' in transactionChanges || 'currency' in transactionChanges)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {[transactionThread.parentReportActionID]: {originalMessage: {whisperedTo: []}}},
        });
    }

    // Clear out the error fields and loading states on success
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields: null,
            routes: null,
        },
    });

    // Clear out loading states, pending fields, and add the error fields
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...transaction,
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields,
        },
    });

    // Reset the transaction thread to its original state
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
        value: transactionThread,
    });

    return {
        params,
        onyxData: {optimisticData, successData, failureData},
    };
}

/** Updates the created date of an expense */
function updateMoneyRequestDate(
    transactionID: string,
    transactionThreadReportID: string,
    transactions: OnyxCollection<OnyxTypes.Transaction>,
    transactionViolations: OnyxCollection<OnyxTypes.TransactionViolations>,
    value: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTags: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
) {
    const transactionChanges: TransactionChanges = {
        created: value,
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;
    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTags, policyCategories);
        removeTransactionFromDuplicateTransactionViolation(data.onyxData, transactionID, transactions, transactionViolations);
    }
    const {params, onyxData} = data;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_DATE, params, onyxData);
}

/** Updates the billable field of an expense */
function updateMoneyRequestBillable(
    transactionID: string | undefined,
    transactionThreadReportID: string | undefined,
    value: boolean,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
) {
    if (!transactionID || !transactionThreadReportID) {
        return;
    }
    const transactionChanges: TransactionChanges = {
        billable: value,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories);
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_BILLABLE, params, onyxData);
}

/** Updates the merchant field of an expense */
function updateMoneyRequestMerchant(
    transactionID: string,
    transactionThreadReportID: string,
    value: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
) {
    const transactionChanges: TransactionChanges = {
        merchant: value,
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;
    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories);
    }
    const {params, onyxData} = data;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_MERCHANT, params, onyxData);
}

/** Updates the attendees list of an expense */
function updateMoneyRequestAttendees(
    transactionID: string,
    transactionThreadReportID: string,
    attendees: Attendee[],
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
    violations: OnyxEntry<OnyxTypes.TransactionViolations> | undefined,
) {
    const transactionChanges: TransactionChanges = {
        attendees,
    };
    const data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories, violations);
    const {params, onyxData} = data;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_ATTENDEES, params, onyxData);
}

/** Updates the tag of an expense */
function updateMoneyRequestTag(
    transactionID: string,
    transactionThreadReportID: string | undefined,
    tag: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
    hash?: number,
) {
    const transactionChanges: TransactionChanges = {
        tag,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories, undefined, hash);
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_TAG, params, onyxData);
}

/** Updates the created tax amount of an expense */
function updateMoneyRequestTaxAmount(
    transactionID: string,
    optimisticReportActionID: string | undefined,
    taxAmount: number,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
) {
    const transactionChanges = {
        taxAmount,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, optimisticReportActionID, transactionChanges, policy, policyTagList, policyCategories);
    API.write('UpdateMoneyRequestTaxAmount', params, onyxData);
}

type UpdateMoneyRequestTaxRateParams = {
    transactionID: string;
    optimisticReportActionID: string;
    taxCode: string;
    taxAmount: number;
    policy: OnyxEntry<OnyxTypes.Policy>;
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>;
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>;
};

/** Updates the created tax rate of an expense */
function updateMoneyRequestTaxRate({transactionID, optimisticReportActionID, taxCode, taxAmount, policy, policyTagList, policyCategories}: UpdateMoneyRequestTaxRateParams) {
    const transactionChanges = {
        taxCode,
        taxAmount,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, optimisticReportActionID, transactionChanges, policy, policyTagList, policyCategories);
    API.write('UpdateMoneyRequestTaxRate', params, onyxData);
}

type UpdateMoneyRequestDistanceParams = {
    transactionID: string | undefined;
    transactionThreadReportID: string | undefined;
    waypoints: WaypointCollection;
    routes?: Routes;
    policy?: OnyxEntry<OnyxTypes.Policy>;
    policyTagList?: OnyxEntry<OnyxTypes.PolicyTagLists>;
    policyCategories?: OnyxEntry<OnyxTypes.PolicyCategories>;
    transactionBackup: OnyxEntry<OnyxTypes.Transaction>;
};

/** Updates the waypoints of a distance expense */
function updateMoneyRequestDistance({
    transactionID,
    transactionThreadReportID,
    waypoints,
    routes = undefined,
    policy = {} as OnyxTypes.Policy,
    policyTagList = {},
    policyCategories = {},
    transactionBackup,
}: UpdateMoneyRequestDistanceParams) {
    const transactionChanges: TransactionChanges = {
        waypoints: sanitizeRecentWaypoints(waypoints),
        routes,
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;
    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories);
    }
    const {params, onyxData} = data;

    const recentServerValidatedWaypoints = getRecentWaypoints().filter((item) => !item.pendingAction);
    onyxData?.failureData?.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.NVP_RECENT_WAYPOINTS}`,
        value: recentServerValidatedWaypoints,
    });

    if (transactionBackup) {
        const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];

        // We need to include all keys of the optimisticData's waypoints in the failureData for onyx merge to properly reset
        // waypoint keys that do not exist in the failureData's waypoints. For instance, if the optimisticData waypoints had
        // three keys and the failureData waypoint had only 2 keys then the third key that doesn't exist in the failureData
        // waypoints should be explicitly reset otherwise onyx merge will leave it intact.
        const allWaypointKeys = [...new Set([...Object.keys(transactionBackup.comment?.waypoints ?? {}), ...Object.keys(transaction?.comment?.waypoints ?? {})])];
        const onyxWaypoints = allWaypointKeys.reduce((acc: NullishDeep<WaypointCollection>, key) => {
            acc[key] = transactionBackup.comment?.waypoints?.[key] ? {...transactionBackup.comment?.waypoints?.[key]} : null;
            return acc;
        }, {});
        const allModifiedWaypointsKeys = [...new Set([...Object.keys(waypoints ?? {}), ...Object.keys(transaction?.modifiedWaypoints ?? {})])];
        const onyxModifiedWaypoints = allModifiedWaypointsKeys.reduce((acc: NullishDeep<WaypointCollection>, key) => {
            acc[key] = transactionBackup.modifiedWaypoints?.[key] ? {...transactionBackup.modifiedWaypoints?.[key]} : null;
            return acc;
        }, {});
        onyxData?.failureData?.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                comment: {
                    waypoints: onyxWaypoints,
                    customUnit: {
                        quantity: transactionBackup?.comment?.customUnit?.quantity,
                    },
                },
                modifiedWaypoints: onyxModifiedWaypoints,
                routes: null,
            },
        });
    }

    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_DISTANCE, params, onyxData);
}

/** Updates the category of an expense */
function updateMoneyRequestCategory(
    transactionID: string,
    transactionThreadReportID: string,
    category: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
    hash?: number,
) {
    const transactionChanges: TransactionChanges = {
        category,
    };

    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories, undefined, hash);
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_CATEGORY, params, onyxData);
}

/** Updates the description of an expense */
function updateMoneyRequestDescription(
    transactionID: string,
    transactionThreadReportID: string,
    comment: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
) {
    const parsedComment = getParsedComment(comment);
    const transactionChanges: TransactionChanges = {
        comment: parsedComment,
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;
    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories);
    }
    const {params, onyxData} = data;
    params.description = parsedComment;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_DESCRIPTION, params, onyxData);
}

/** Updates the distance rate of an expense */
function updateMoneyRequestDistanceRate(
    transactionID: string,
    transactionThreadReportID: string,
    rateID: string,
    policy: OnyxEntry<OnyxTypes.Policy>,
    policyTagList: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories: OnyxEntry<OnyxTypes.PolicyCategories>,
    updatedTaxAmount?: number,
    updatedTaxCode?: string,
) {
    const transactionChanges: TransactionChanges = {
        customUnitRateID: rateID,
        ...(typeof updatedTaxAmount === 'number' ? {taxAmount: updatedTaxAmount} : {}),
        ...(updatedTaxCode ? {taxCode: updatedTaxCode} : {}),
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;

    const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    if (transaction) {
        const existingDistanceUnit = transaction?.comment?.customUnit?.distanceUnit;
        const newDistanceUnit = DistanceRequestUtils.getRateByCustomUnitRateID({customUnitRateID: rateID, policy})?.unit;

        // If the distanceUnit is set and the rate is changed to one that has a different unit, mark the merchant as modified to make the distance field pending
        if (existingDistanceUnit && newDistanceUnit && newDistanceUnit !== existingDistanceUnit) {
            transactionChanges.merchant = getMerchant(transaction);
        }
    }

    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList, policyCategories);
    }
    const {params, onyxData} = data;
    // `taxAmount` & `taxCode` only needs to be updated in the optimistic data, so we need to remove them from the params
    const {taxAmount, taxCode, ...paramsWithoutTaxUpdated} = params;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_DISTANCE_RATE, paramsWithoutTaxUpdated, onyxData);
}

const getConvertTrackedExpenseInformation = (
    transactionID: string | undefined,
    actionableWhisperReportActionID: string | undefined,
    moneyRequestReportID: string | undefined,
    linkedTrackedExpenseReportAction: OnyxTypes.ReportAction,
    linkedTrackedExpenseReportID: string,
    transactionThreadReportID: string | undefined,
    resolution: IOUAction,
) => {
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    // Delete the transaction from the track expense report
    const {
        optimisticData: deleteOptimisticData,
        successData: deleteSuccessData,
        failureData: deleteFailureData,
    } = getDeleteTrackExpenseInformation(linkedTrackedExpenseReportID, transactionID, linkedTrackedExpenseReportAction, false, true, actionableWhisperReportActionID, resolution);

    optimisticData?.push(...deleteOptimisticData);
    successData?.push(...deleteSuccessData);
    failureData?.push(...deleteFailureData);

    // Build modified expense report action with the transaction changes
    const modifiedExpenseReportAction = buildOptimisticMovedTransactionAction(transactionThreadReportID, moneyRequestReportID ?? CONST.REPORT.UNREPORTED_REPORT_ID);

    optimisticData?.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [modifiedExpenseReportAction.reportActionID]: modifiedExpenseReportAction,
        },
    });
    successData?.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [modifiedExpenseReportAction.reportActionID]: {pendingAction: null},
        },
    });
    failureData?.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [modifiedExpenseReportAction.reportActionID]: {
                ...modifiedExpenseReportAction,
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericEditFailureMessage'),
            },
        },
    });

    return {optimisticData, successData, failureData, modifiedExpenseReportActionID: modifiedExpenseReportAction.reportActionID};
};

type ConvertTrackedWorkspaceParams = {
    category: string | undefined;
    tag: string | undefined;
    taxCode: string;
    taxAmount: number;
    billable: boolean | undefined;
    policyID: string;
    receipt: Receipt | undefined;
    waypoints?: string;
    customUnitID?: string;
    customUnitRateID?: string;
};

type AddTrackedExpenseToPolicyParam = {
    amount: number;
    currency: string;
    comment: string;
    created: string;
    merchant: string;
    transactionID: string;
    reimbursable: boolean;
    actionableWhisperReportActionID: string | undefined;
    moneyRequestReportID: string;
    reportPreviewReportActionID: string;
    modifiedExpenseReportActionID: string;
    moneyRequestCreatedReportActionID: string | undefined;
    moneyRequestPreviewReportActionID: string;
} & ConvertTrackedWorkspaceParams;

type ConvertTrackedExpenseToRequestParams = {
    payerParams: {
        accountID: number;
        email: string;
    };
    transactionParams: {
        transactionID: string;
        actionableWhisperReportActionID: string | undefined;
        linkedTrackedExpenseReportAction: OnyxTypes.ReportAction;
        linkedTrackedExpenseReportID: string;
        amount: number;
        currency: string;
        comment: string;
        merchant: string;
        created: string;
        attendees?: Attendee[];
        transactionThreadReportID: string;
    };
    chatParams: {
        reportID: string;
        createdReportActionID: string | undefined;
        reportPreviewReportActionID: string;
    };
    iouParams: {
        reportID: string;
        createdReportActionID: string | undefined;
        reportActionID: string;
    };
    onyxData: OnyxData;
    workspaceParams?: ConvertTrackedWorkspaceParams;
};

function addTrackedExpenseToPolicy(parameters: AddTrackedExpenseToPolicyParam, onyxData: OnyxData) {
    API.write(WRITE_COMMANDS.ADD_TRACKED_EXPENSE_TO_POLICY, parameters, onyxData);
}

function convertTrackedExpenseToRequest(convertTrackedExpenseParams: ConvertTrackedExpenseToRequestParams) {
    const {payerParams, transactionParams, chatParams, iouParams, onyxData, workspaceParams} = convertTrackedExpenseParams;
    const {accountID: payerAccountID, email: payerEmail} = payerParams;
    const {
        transactionID,
        actionableWhisperReportActionID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        amount,
        currency,
        comment,
        merchant,
        created,
        attendees,
        transactionThreadReportID,
    } = transactionParams;
    const {optimisticData: convertTransactionOptimisticData = [], successData: convertTransactionSuccessData = [], failureData: convertTransactionFailureData = []} = onyxData;

    const {optimisticData, successData, failureData, modifiedExpenseReportActionID} = getConvertTrackedExpenseInformation(
        transactionID,
        actionableWhisperReportActionID,
        iouParams.reportID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        transactionThreadReportID,
        CONST.IOU.ACTION.SUBMIT,
    );

    optimisticData?.push(...convertTransactionOptimisticData);
    successData?.push(...convertTransactionSuccessData);
    failureData?.push(...convertTransactionFailureData);

    if (workspaceParams) {
        const params = {
            amount,
            currency,
            comment,
            created,
            merchant,
            reimbursable: true,
            transactionID,
            actionableWhisperReportActionID,
            moneyRequestReportID: iouParams.reportID,
            moneyRequestCreatedReportActionID: iouParams.createdReportActionID,
            moneyRequestPreviewReportActionID: iouParams.reportActionID,
            modifiedExpenseReportActionID,
            reportPreviewReportActionID: chatParams.reportPreviewReportActionID,
            ...workspaceParams,
        };

        addTrackedExpenseToPolicy(params, {optimisticData, successData, failureData});
        return;
    }

    const parameters = {
        attendees,
        amount,
        currency,
        comment,
        created,
        merchant,
        payerAccountID,
        payerEmail,
        chatReportID: chatParams.reportID,
        transactionID,
        actionableWhisperReportActionID,
        createdChatReportActionID: chatParams.createdReportActionID,
        moneyRequestReportID: iouParams.reportID,
        moneyRequestCreatedReportActionID: iouParams.createdReportActionID,
        moneyRequestPreviewReportActionID: iouParams.reportActionID,
        transactionThreadReportID,
        modifiedExpenseReportActionID,
        reportPreviewReportActionID: chatParams.reportPreviewReportActionID,
    };
    API.write(WRITE_COMMANDS.CONVERT_TRACKED_EXPENSE_TO_REQUEST, parameters, {optimisticData, successData, failureData});
}

/**
 * Move multiple tracked expenses from self-DM to an IOU report
 */
function convertBulkTrackedExpensesToIOU(transactionIDs: string[], targetReportID: string) {
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${targetReportID}`];

    if (!iouReport || !isMoneyRequestReportReportUtils(iouReport)) {
        Log.warn('[convertBulkTrackedExpensesToIOU] Invalid IOU report', {targetReportID});
        return;
    }

    const chatReportID = iouReport.chatReportID;
    if (!chatReportID) {
        Log.warn('[convertBulkTrackedExpensesToIOU] No chat report found for IOU', {targetReportID});
        return;
    }

    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`];
    if (!chatReport) {
        Log.warn('[convertBulkTrackedExpensesToIOU] Chat report not found', {chatReportID});
        return;
    }

    const participantAccountIDs = getReportRecipientAccountIDs(iouReport, userAccountID);
    const payerAccountID = participantAccountIDs.at(0);

    if (!payerAccountID) {
        Log.warn('[convertBulkTrackedExpensesToIOU] No payer found', {targetReportID, participantAccountIDs});
        return;
    }

    const payerEmail = personalDetailsList?.[payerAccountID]?.login ?? '';
    const selfDMReportID = findSelfDMReportID();

    if (!selfDMReportID) {
        Log.warn('[convertBulkTrackedExpensesToIOU] Self DM not found');
        return;
    }

    const selfDMReportActions = getAllReportActions(selfDMReportID);

    transactionIDs.forEach((transactionID) => {
        const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
        if (!transaction) {
            Log.warn('[convertBulkTrackedExpensesToIOU] Transaction not found', {transactionID});
            return;
        }

        const linkedTrackedExpenseReportAction = Object.values(selfDMReportActions).find((action) => {
            if (!isMoneyRequestAction(action)) {
                return false;
            }
            const originalMessage = getOriginalMessage(action);
            return originalMessage?.IOUTransactionID === transactionID;
        });

        if (!linkedTrackedExpenseReportAction) {
            Log.warn('[convertBulkTrackedExpensesToIOU] Tracked expense IOU action not found', {transactionID});
            return;
        }

        const actionableWhisperReportActionID = getTrackExpenseActionableWhisper(transactionID, selfDMReportID)?.reportActionID;

        const commentText = typeof transaction.comment === 'string' ? transaction.comment : (transaction.comment?.comment ?? '');
        const parsedComment = getParsedComment(commentText);

        const attendees = transaction.comment?.attendees;

        const transactionThreadReportID = (linkedTrackedExpenseReportAction as OnyxTypes.ReportAction).childReportID;

        if (!transactionThreadReportID) {
            Log.warn('[convertBulkTrackedExpensesToIOU] No transaction thread found for tracked expense, skipping', {
                transactionID,
                actionReportActionID: (linkedTrackedExpenseReportAction as OnyxTypes.ReportAction).reportActionID,
            });
            return;
        }

        const participantParams = {
            payeeAccountID: userAccountID,
            payeeEmail: currentUserEmail,
            participant: {
                accountID: payerAccountID,
                login: payerEmail,
            },
        };

        const transactionParams = {
            amount: getAmount(transaction),
            currency: getCurrency(transaction),
            comment: parsedComment,
            merchant: getMerchant(transaction),
            created: transaction.created,
            attendees,
            actionableWhisperReportActionID,
            linkedTrackedExpenseReportAction,
            linkedTrackedExpenseReportID: selfDMReportID,
        };

        const {
            payerAccountID: moneyRequestPayerAccountID,
            payerEmail: moneyRequestPayerEmail,
            iouReport: moneyRequestIOUReport,
            chatReport: moneyRequestChatReport,
            transaction: moneyRequestTransaction,
            iouAction,
            createdChatReportActionID,
            createdIOUReportActionID,
            reportPreviewAction,
            transactionThreadReportID: moneyRequestTransactionThreadReportID,
            onyxData,
        } = getMoneyRequestInformation({
            parentChatReport: chatReport,
            participantParams,
            transactionParams,
            moneyRequestReportID: targetReportID,
            existingTransactionID: transactionID,
            existingTransaction: transaction,
        });

        const convertParams: ConvertTrackedExpenseToRequestParams = {
            payerParams: {
                accountID: moneyRequestPayerAccountID,
                email: moneyRequestPayerEmail,
            },
            transactionParams: {
                amount: getAmount(transaction),
                currency: getCurrency(transaction),
                comment: parsedComment,
                merchant: getMerchant(transaction),
                created: transaction.created,
                attendees,
                transactionID: moneyRequestTransaction.transactionID,
                actionableWhisperReportActionID,
                linkedTrackedExpenseReportAction,
                linkedTrackedExpenseReportID: selfDMReportID,
                transactionThreadReportID: moneyRequestTransactionThreadReportID,
            },
            chatParams: {
                reportID: moneyRequestChatReport.reportID,
                createdReportActionID: createdChatReportActionID,
                reportPreviewReportActionID: reportPreviewAction.reportActionID,
            },
            iouParams: {
                reportID: moneyRequestIOUReport.reportID,
                createdReportActionID: createdIOUReportActionID,
                reportActionID: iouAction.reportActionID,
            },
            onyxData,
        };

        convertTrackedExpenseToRequest(convertParams);
    });
}

function categorizeTrackedExpense(trackedExpenseParams: TrackedExpenseParams) {
    const {onyxData, reportInformation, transactionParams, policyParams, createdWorkspaceParams} = trackedExpenseParams;
    const {optimisticData, successData, failureData} = onyxData ?? {};
    const {transactionID} = transactionParams;
    const {isDraftPolicy} = policyParams;
    const {actionableWhisperReportActionID, moneyRequestReportID, linkedTrackedExpenseReportAction, linkedTrackedExpenseReportID, transactionThreadReportID} = reportInformation;
    const {
        optimisticData: moveTransactionOptimisticData,
        successData: moveTransactionSuccessData,
        failureData: moveTransactionFailureData,
        modifiedExpenseReportActionID,
    } = getConvertTrackedExpenseInformation(
        transactionID,
        actionableWhisperReportActionID,
        moneyRequestReportID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        transactionThreadReportID,
        CONST.IOU.ACTION.CATEGORIZE,
    );

    optimisticData?.push(...moveTransactionOptimisticData);
    successData?.push(...moveTransactionSuccessData);
    failureData?.push(...moveTransactionFailureData);

    const parameters: CategorizeTrackedExpenseApiParams = {
        ...{
            ...reportInformation,
            linkedTrackedExpenseReportAction: undefined,
        },
        ...policyParams,
        ...transactionParams,
        modifiedExpenseReportActionID,
        policyExpenseChatReportID: createdWorkspaceParams?.expenseChatReportID,
        policyExpenseCreatedReportActionID: createdWorkspaceParams?.expenseCreatedReportActionID,
        adminsChatReportID: createdWorkspaceParams?.adminsChatReportID,
        adminsCreatedReportActionID: createdWorkspaceParams?.adminsCreatedReportActionID,
        engagementChoice: createdWorkspaceParams?.engagementChoice,
        guidedSetupData: createdWorkspaceParams?.guidedSetupData,
        description: transactionParams.comment,
        customUnitID: createdWorkspaceParams?.customUnitID,
        customUnitRateID: createdWorkspaceParams?.customUnitRateID ?? transactionParams.customUnitRateID,
        attendees: transactionParams.attendees ? JSON.stringify(transactionParams.attendees) : undefined,
    };

    API.write(WRITE_COMMANDS.CATEGORIZE_TRACKED_EXPENSE, parameters, {optimisticData, successData, failureData});

    // If a draft policy was used, then the CategorizeTrackedExpense command will create a real one
    // so let's track that conversion here
    if (isDraftPolicy) {
        GoogleTagManager.publishEvent(CONST.ANALYTICS.EVENT.WORKSPACE_CREATED, userAccountID);
    }
}

function shareTrackedExpense(trackedExpenseParams: TrackedExpenseParams) {
    const {onyxData, reportInformation, transactionParams, policyParams, createdWorkspaceParams, accountantParams} = trackedExpenseParams;

    const policyID = policyParams?.policyID;
    const chatReportID = reportInformation?.chatReportID;
    const accountantEmail = addSMSDomainIfPhoneNumber(accountantParams?.accountant?.login);
    const accountantAccountID = accountantParams?.accountant?.accountID;

    if (!policyID || !chatReportID || !accountantEmail || !accountantAccountID) {
        return;
    }

    const {optimisticData: shareTrackedExpenseOptimisticData = [], successData: shareTrackedExpenseSuccessData = [], failureData: shareTrackedExpenseFailureData = []} = onyxData ?? {};

    const {transactionID} = transactionParams;
    const {
        actionableWhisperReportActionID,
        moneyRequestPreviewReportActionID,
        moneyRequestCreatedReportActionID,
        reportPreviewReportActionID,
        moneyRequestReportID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        transactionThreadReportID,
    } = reportInformation;

    const {optimisticData, successData, failureData, modifiedExpenseReportActionID} = getConvertTrackedExpenseInformation(
        transactionID,
        actionableWhisperReportActionID,
        moneyRequestReportID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        transactionThreadReportID,
        CONST.IOU.ACTION.SHARE,
    );

    optimisticData?.push(...shareTrackedExpenseOptimisticData);
    successData?.push(...shareTrackedExpenseSuccessData);
    failureData?.push(...shareTrackedExpenseFailureData);

    const policyEmployeeList = allPolicies?.[`${ONYXKEYS.COLLECTION.POLICY}${policyParams?.policyID}`]?.employeeList;
    if (!policyEmployeeList?.[accountantEmail]) {
        const policyMemberAccountIDs = Object.values(getMemberAccountIDsForWorkspace(policyEmployeeList, false, false));
        const {
            optimisticData: addAccountantToWorkspaceOptimisticData,
            successData: addAccountantToWorkspaceSuccessData,
            failureData: addAccountantToWorkspaceFailureData,
        } = buildAddMembersToWorkspaceOnyxData({[accountantEmail]: accountantAccountID}, policyID, policyMemberAccountIDs, CONST.POLICY.ROLE.ADMIN, formatPhoneNumber);
        optimisticData?.push(...addAccountantToWorkspaceOptimisticData);
        successData?.push(...addAccountantToWorkspaceSuccessData);
        failureData?.push(...addAccountantToWorkspaceFailureData);
    } else if (policyEmployeeList?.[accountantEmail].role !== CONST.POLICY.ROLE.ADMIN) {
        const {
            optimisticData: addAccountantToWorkspaceOptimisticData,
            successData: addAccountantToWorkspaceSuccessData,
            failureData: addAccountantToWorkspaceFailureData,
        } = buildUpdateWorkspaceMembersRoleOnyxData(policyID, [accountantAccountID], CONST.POLICY.ROLE.ADMIN);
        optimisticData?.push(...addAccountantToWorkspaceOptimisticData);
        successData?.push(...addAccountantToWorkspaceSuccessData);
        failureData?.push(...addAccountantToWorkspaceFailureData);
    }

    const chatReportParticipants = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`]?.participants;
    if (!chatReportParticipants?.[accountantAccountID]) {
        const {
            optimisticData: inviteAccountantToRoomOptimisticData,
            successData: inviteAccountantToRoomSuccessData,
            failureData: inviteAccountantToRoomFailureData,
        } = buildInviteToRoomOnyxData(chatReportID, {[accountantEmail]: accountantAccountID}, formatPhoneNumber);
        optimisticData?.push(...inviteAccountantToRoomOptimisticData);
        successData?.push(...inviteAccountantToRoomSuccessData);
        failureData?.push(...inviteAccountantToRoomFailureData);
    }

    const parameters: ShareTrackedExpenseParams = {
        ...transactionParams,
        policyID,
        moneyRequestPreviewReportActionID,
        moneyRequestReportID,
        moneyRequestCreatedReportActionID,
        actionableWhisperReportActionID,
        modifiedExpenseReportActionID,
        reportPreviewReportActionID,
        policyExpenseChatReportID: createdWorkspaceParams?.expenseChatReportID,
        policyExpenseCreatedReportActionID: createdWorkspaceParams?.expenseCreatedReportActionID,
        adminsChatReportID: createdWorkspaceParams?.adminsChatReportID,
        adminsCreatedReportActionID: createdWorkspaceParams?.adminsCreatedReportActionID,
        engagementChoice: createdWorkspaceParams?.engagementChoice,
        guidedSetupData: createdWorkspaceParams?.guidedSetupData,
        policyName: createdWorkspaceParams?.policyName,
        description: transactionParams.comment,
        customUnitID: createdWorkspaceParams?.customUnitID,
        customUnitRateID: createdWorkspaceParams?.customUnitRateID ?? transactionParams.customUnitRateID,
        attendees: transactionParams.attendees ? JSON.stringify(transactionParams.attendees) : undefined,
        accountantEmail,
    };

    API.write(WRITE_COMMANDS.SHARE_TRACKED_EXPENSE, parameters, {optimisticData, successData, failureData});
}

/**
 * Submit expense to another user
 */
function requestMoney(requestMoneyInformation: RequestMoneyInformation) {
    const {
        report,
        participantParams,
        policyParams = {},
        transactionParams,
        gpsPoints,
        action,
        reimbursible,
        shouldHandleNavigation = true,
        backToReport,
        shouldPlaySound = true,
        optimisticChatReportID,
        optimisticCreatedReportActionID,
        optimisticIOUReportID,
        optimisticReportPreviewActionID,
    } = requestMoneyInformation;
    const {payeeAccountID} = participantParams;
    const parsedComment = getParsedComment(transactionParams.comment ?? '');
    transactionParams.comment = parsedComment;
    const {
        amount,
        currency,
        merchant,
        comment = '',
        receipt,
        category,
        tag,
        taxCode = '',
        taxAmount = 0,
        billable,
        created,
        attendees,
        actionableWhisperReportActionID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        waypoints,
        customUnitRateID,
        isTestDrive,
    } = transactionParams;

    const testDriveCommentReportActionID = isTestDrive ? NumberUtils.rand64() : undefined;

    const sanitizedWaypoints = waypoints ? JSON.stringify(sanitizeRecentWaypoints(waypoints)) : undefined;

    // If the report is iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = isMoneyRequestReportReportUtils(report);
    const currentChatReport = isMoneyRequestReport ? getReportOrDraftReport(report?.chatReportID) : report;
    const moneyRequestReportID = isMoneyRequestReport ? report?.reportID : '';
    const isMovingTransactionFromTrackExpense = isMovingTransactionFromTrackExpenseIOUUtils(action);
    const existingTransactionID =
        isMovingTransactionFromTrackExpense && linkedTrackedExpenseReportAction && isMoneyRequestAction(linkedTrackedExpenseReportAction)
            ? getOriginalMessage(linkedTrackedExpenseReportAction)?.IOUTransactionID
            : undefined;
    const existingTransaction =
        action === CONST.IOU.ACTION.SUBMIT
            ? allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${existingTransactionID}`]
            : allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${existingTransactionID}`];

    const retryParams = {
        ...requestMoneyInformation,
        participantParams: {
            ...requestMoneyInformation.participantParams,
            participant: (({icons, ...rest}) => rest)(requestMoneyInformation.participantParams.participant),
        },
        transactionParams: {
            ...requestMoneyInformation.transactionParams,
            receipt: undefined,
        },
    };

    const {
        payerAccountID,
        payerEmail,
        iouReport,
        chatReport,
        transaction,
        iouAction,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewAction,
        transactionThreadReportID,
        createdReportActionIDForThread,
        onyxData,
    } = getMoneyRequestInformation({
        parentChatReport: isMovingTransactionFromTrackExpense ? undefined : currentChatReport,
        participantParams,
        policyParams,
        transactionParams,
        moneyRequestReportID,
        existingTransactionID,
        existingTransaction: isDistanceRequestTransactionUtils(existingTransaction) ? existingTransaction : undefined,
        retryParams,
        testDriveCommentReportActionID,
        optimisticChatReportID,
        optimisticCreatedReportActionID,
        optimisticIOUReportID,
        optimisticReportPreviewActionID,
    });
    const activeReportID = isMoneyRequestReport ? report?.reportID : chatReport.reportID;

    if (shouldPlaySound) {
        playSound(SOUNDS.DONE);
    }

    switch (action) {
        case CONST.IOU.ACTION.SUBMIT: {
            if (!linkedTrackedExpenseReportAction || !linkedTrackedExpenseReportID) {
                return;
            }
            const workspaceParams =
                isPolicyExpenseChatReportUtil(chatReport) && chatReport.policyID
                    ? {
                          receipt: isFileUploadable(receipt) ? receipt : undefined,
                          category,
                          tag,
                          taxCode,
                          taxAmount,
                          billable,
                          policyID: chatReport.policyID,
                          waypoints: sanitizedWaypoints,
                          customUnitID: getDistanceRateCustomUnit(policyParams?.policy)?.customUnitID,
                          customUnitRateID,
                      }
                    : undefined;
            convertTrackedExpenseToRequest({
                payerParams: {
                    accountID: payerAccountID,
                    email: payerEmail,
                },
                transactionParams: {
                    amount,
                    currency,
                    comment,
                    merchant,
                    created,
                    attendees,
                    transactionID: transaction.transactionID,
                    actionableWhisperReportActionID,
                    linkedTrackedExpenseReportAction,
                    linkedTrackedExpenseReportID,
                    transactionThreadReportID,
                },
                chatParams: {
                    reportID: chatReport.reportID,
                    createdReportActionID: createdChatReportActionID,
                    reportPreviewReportActionID: reportPreviewAction.reportActionID,
                },
                iouParams: {
                    reportID: iouReport.reportID,
                    createdReportActionID: createdIOUReportActionID,
                    reportActionID: iouAction.reportActionID,
                },
                onyxData,
                workspaceParams,
            });
            break;
        }
        default: {
            // This is only required when inviting admins to test drive the app
            const guidedSetupData: GuidedSetupData | undefined = isTestDrive
                ? prepareOnboardingOnyxData(
                      {choice: CONST.ONBOARDING_CHOICES.TEST_DRIVE_RECEIVER},
                      CONST.ONBOARDING_CHOICES.TEST_DRIVE_RECEIVER,
                      getOnboardingMessages().onboardingMessages[CONST.ONBOARDING_CHOICES.TEST_DRIVE_RECEIVER],
                  )?.guidedSetupData
                : undefined;

            const parameters: RequestMoneyParams = {
                debtorEmail: payerEmail,
                debtorAccountID: payerAccountID,
                amount,
                currency,
                comment,
                created,
                merchant,
                iouReportID: iouReport.reportID,
                chatReportID: chatReport.reportID,
                transactionID: transaction.transactionID,
                reportActionID: iouAction.reportActionID,
                createdChatReportActionID,
                createdIOUReportActionID,
                reportPreviewReportActionID: reportPreviewAction.reportActionID,
                receipt: isFileUploadable(receipt) ? receipt : undefined,
                receiptState: receipt?.state,
                category,
                tag,
                taxCode,
                taxAmount,
                billable,
                // This needs to be a string of JSON because of limitations with the fetch() API and nested objects
                receiptGpsPoints: gpsPoints ? JSON.stringify(gpsPoints) : undefined,
                transactionThreadReportID,
                createdReportActionIDForThread,
                reimbursible,
                description: parsedComment,
                attendees: attendees ? JSON.stringify(attendees) : undefined,
                isTestDrive,
                guidedSetupData: guidedSetupData ? JSON.stringify(guidedSetupData) : undefined,
                testDriveCommentReportActionID,
            };
            // eslint-disable-next-line rulesdir/no-multiple-api-calls
            API.write(WRITE_COMMANDS.REQUEST_MONEY, parameters, onyxData);
        }
    }

    if (shouldHandleNavigation) {
        InteractionManager.runAfterInteractions(() => removeDraftTransactions());
        if (!requestMoneyInformation.isRetry) {
            dismissModalAndOpenReportInInboxTab(backToReport ?? activeReportID);
        }

        const trackReport = Navigation.getReportRouteByID(linkedTrackedExpenseReportAction?.childReportID);
        if (trackReport?.key) {
            Navigation.removeScreenByKey(trackReport.key);
        }
    }

    if (activeReportID && !isMoneyRequestReport) {
        Navigation.setNavigationActionToMicrotaskQueue(() =>
            setTimeout(() => {
                notifyNewAction(activeReportID, payeeAccountID, reportPreviewAction);
            }, CONST.TIMING.NOTIFY_NEW_ACTION_DELAY),
        );
    }
}

/**
 * Submit per diem expense to another user
 */
function submitPerDiemExpense(submitPerDiemExpenseInformation: PerDiemExpenseInformation) {
    const {report, participantParams, policyParams = {}, transactionParams} = submitPerDiemExpenseInformation;
    const {payeeAccountID} = participantParams;
    const {currency, comment = '', category, tag, created, customUnit, attendees} = transactionParams;

    if (
        isEmptyObject(policyParams.policy) ||
        isEmptyObject(customUnit) ||
        !customUnit.customUnitID ||
        !customUnit.customUnitRateID ||
        (customUnit.subRates ?? []).length === 0 ||
        isEmptyObject(customUnit.attributes)
    ) {
        return;
    }

    // If the report is iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = isMoneyRequestReportReportUtils(report);
    const currentChatReport = isMoneyRequestReport ? getReportOrDraftReport(report?.chatReportID) : report;
    const moneyRequestReportID = isMoneyRequestReport ? report?.reportID : '';

    const {
        iouReport,
        chatReport,
        transaction,
        iouAction,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewAction,
        transactionThreadReportID,
        createdReportActionIDForThread,
        onyxData,
        billable,
    } = getPerDiemExpenseInformation({
        parentChatReport: currentChatReport,
        participantParams,
        policyParams,
        transactionParams,
        moneyRequestReportID,
    });
    const activeReportID = isMoneyRequestReport && Navigation.getTopmostReportId() === report?.reportID ? report?.reportID : chatReport.reportID;

    const customUnitRate = getPerDiemRateCustomUnitRate(policyParams.policy, customUnit.customUnitRateID);

    const customUnitRateParam = {
        id: customUnitRate?.customUnitRateID,
        name: customUnitRate?.name,
    };

    const parameters: CreatePerDiemRequestParams = {
        policyID: policyParams.policy.id,
        customUnitID: customUnit.customUnitID,
        customUnitRateID: customUnit.customUnitRateID,
        customUnitRate: JSON.stringify(customUnitRateParam),
        subRates: JSON.stringify(customUnit.subRates),
        startDateTime: customUnit.attributes.dates.start,
        endDateTime: customUnit.attributes.dates.end,
        currency,
        description: comment,
        created,
        iouReportID: iouReport.reportID,
        chatReportID: chatReport.reportID,
        transactionID: transaction.transactionID,
        reportActionID: iouAction.reportActionID,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewReportActionID: reportPreviewAction.reportActionID,
        category,
        tag,
        transactionThreadReportID,
        createdReportActionIDForThread,
        billable,
        attendees: attendees ? JSON.stringify(attendees) : undefined,
    };

    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.CREATE_PER_DIEM_REQUEST, parameters, onyxData);

    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));
    dismissModalAndOpenReportInInboxTab(activeReportID);

    if (activeReportID) {
        notifyNewAction(activeReportID, payeeAccountID);
    }
}

function sendInvoice(
    currentUserAccountID: number,
    transaction: OnyxEntry<OnyxTypes.Transaction>,
    invoiceChatReport?: OnyxEntry<OnyxTypes.Report>,
    receiptFile?: Receipt,
    policy?: OnyxEntry<OnyxTypes.Policy>,
    policyTagList?: OnyxEntry<OnyxTypes.PolicyTagLists>,
    policyCategories?: OnyxEntry<OnyxTypes.PolicyCategories>,
    companyName?: string,
    companyWebsite?: string,
) {
    const parsedComment = getParsedComment(transaction?.comment?.comment?.trim() ?? '');
    if (transaction?.comment) {
        // eslint-disable-next-line no-param-reassign
        transaction.comment.comment = parsedComment;
    }
    const {
        senderWorkspaceID,
        receiver,
        invoiceRoom,
        createdChatReportActionID,
        invoiceReportID,
        reportPreviewReportActionID,
        transactionID,
        transactionThreadReportID,
        createdIOUReportActionID,
        createdReportActionIDForThread,
        reportActionID,
        onyxData,
    } = getSendInvoiceInformation(transaction, currentUserAccountID, invoiceChatReport, receiptFile, policy, policyTagList, policyCategories, companyName, companyWebsite);

    const parameters: SendInvoiceParams = {
        createdIOUReportActionID,
        createdReportActionIDForThread,
        reportActionID,
        senderWorkspaceID,
        accountID: currentUserAccountID,
        amount: transaction?.amount ?? 0,
        currency: transaction?.currency ?? '',
        comment: parsedComment,
        merchant: transaction?.merchant ?? '',
        category: transaction?.category,
        date: transaction?.created ?? '',
        invoiceRoomReportID: invoiceRoom.reportID,
        createdChatReportActionID,
        invoiceReportID,
        reportPreviewReportActionID,
        transactionID,
        transactionThreadReportID,
        companyName,
        companyWebsite,
        description: parsedComment,
        ...(invoiceChatReport?.reportID ? {receiverInvoiceRoomID: invoiceChatReport.reportID} : {receiverEmail: receiver.login ?? ''}),
    };

    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.SEND_INVOICE, parameters, onyxData);
    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));

    if (isSearchTopmostFullScreenRoute()) {
        Navigation.dismissModal();
    } else {
        Navigation.dismissModalWithReport({reportID: invoiceRoom.reportID});
    }

    notifyNewAction(invoiceRoom.reportID, currentUserAccountID);
}

/**
 * Track an expense
 */
function trackExpense(params: CreateTrackExpenseParams) {
    const {
        report,
        action,
        isDraftPolicy,
        participantParams,
        policyParams: policyData = {},
        transactionParams: transactionData,
        accountantParams,
        shouldHandleNavigation = true,
        shouldPlaySound = true,
    } = params;
    const {participant, payeeAccountID, payeeEmail} = participantParams;
    const {policy, policyCategories, policyTagList} = policyData;
    const parsedComment = getParsedComment(transactionData.comment ?? '');
    transactionData.comment = parsedComment;
    const {
        amount,
        currency,
        created = '',
        merchant = '',
        comment = '',
        receipt,
        category,
        tag,
        taxCode = '',
        taxAmount = 0,
        billable,
        gpsPoints,
        validWaypoints,
        actionableWhisperReportActionID,
        linkedTrackedExpenseReportAction,
        linkedTrackedExpenseReportID,
        customUnitRateID,
        attendees,
    } = transactionData;

    const isMoneyRequestReport = isMoneyRequestReportReportUtils(report);
    const currentChatReport = isMoneyRequestReport ? getReportOrDraftReport(report.chatReportID) : report;
    const moneyRequestReportID = isMoneyRequestReport ? report.reportID : '';
    const isMovingTransactionFromTrackExpense = isMovingTransactionFromTrackExpenseIOUUtils(action);

    // Pass an open receipt so the distance expense will show a map with the route optimistically
    const trackedReceipt = validWaypoints ? {source: ReceiptGeneric as ReceiptSource, state: CONST.IOU.RECEIPT_STATE.OPEN} : receipt;
    const sanitizedWaypoints = validWaypoints ? JSON.stringify(sanitizeRecentWaypoints(validWaypoints)) : undefined;

    const retryParams: CreateTrackExpenseParams = {
        report,
        isDraftPolicy,
        action,
        participantParams: {
            participant,
            payeeAccountID,
            payeeEmail,
        },
        transactionParams: {
            amount,
            currency,
            created,
            merchant,
            comment,
            receipt: undefined,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            validWaypoints,
            gpsPoints,
            actionableWhisperReportActionID,
            linkedTrackedExpenseReportAction,
            linkedTrackedExpenseReportID,
            customUnitRateID,
        },
    };

    const {
        createdWorkspaceParams,
        iouReport,
        chatReport,
        transaction,
        iouAction,
        createdChatReportActionID,
        createdIOUReportActionID,
        reportPreviewAction,
        transactionThreadReportID,
        createdReportActionIDForThread,
        actionableWhisperReportActionIDParam,
        onyxData,
    } =
        getTrackExpenseInformation({
            parentChatReport: currentChatReport,
            moneyRequestReportID,
            existingTransactionID:
                isMovingTransactionFromTrackExpense && linkedTrackedExpenseReportAction && isMoneyRequestAction(linkedTrackedExpenseReportAction)
                    ? getOriginalMessage(linkedTrackedExpenseReportAction)?.IOUTransactionID
                    : undefined,
            participantParams: {
                participant,
                payeeAccountID,
                payeeEmail,
            },
            transactionParams: {
                comment,
                amount,
                currency,
                created,
                merchant,
                receipt: trackedReceipt,
                category,
                tag,
                taxCode,
                taxAmount,
                billable,
                linkedTrackedExpenseReportAction,
                attendees,
            },
            policyParams: {
                policy,
                policyCategories,
                policyTagList,
            },
            retryParams,
        }) ?? {};
    const activeReportID = isMoneyRequestReport ? report.reportID : chatReport?.reportID;

    const recentServerValidatedWaypoints = getRecentWaypoints().filter((item) => !item.pendingAction);
    onyxData?.failureData?.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.NVP_RECENT_WAYPOINTS}`,
        value: recentServerValidatedWaypoints,
    });

    const mileageRate = isCustomUnitRateIDForP2P(transaction) ? undefined : customUnitRateID;
    if (shouldPlaySound) {
        playSound(SOUNDS.DONE);
    }

    switch (action) {
        case CONST.IOU.ACTION.CATEGORIZE: {
            if (!linkedTrackedExpenseReportAction || !linkedTrackedExpenseReportID) {
                return;
            }
            const transactionParams: TrackedExpenseTransactionParams = {
                transactionID: transaction?.transactionID,
                amount,
                currency,
                comment,
                merchant,
                created,
                taxCode,
                taxAmount,
                category,
                tag,
                billable,
                receipt: isFileUploadable(trackedReceipt) ? trackedReceipt : undefined,
                waypoints: sanitizedWaypoints,
                customUnitRateID: mileageRate,
                attendees,
            };
            const policyParams: TrackedExpensePolicyParams = {
                policyID: chatReport?.policyID,
                isDraftPolicy,
            };
            const reportInformation: TrackedExpenseReportInformation = {
                moneyRequestPreviewReportActionID: iouAction?.reportActionID,
                moneyRequestReportID: iouReport?.reportID,
                moneyRequestCreatedReportActionID: createdIOUReportActionID,
                actionableWhisperReportActionID,
                linkedTrackedExpenseReportAction,
                linkedTrackedExpenseReportID,
                transactionThreadReportID,
                reportPreviewReportActionID: reportPreviewAction?.reportActionID,
                chatReportID: chatReport?.reportID,
            };
            const trackedExpenseParams: TrackedExpenseParams = {
                onyxData,
                reportInformation,
                transactionParams,
                policyParams,
                createdWorkspaceParams,
            };

            categorizeTrackedExpense(trackedExpenseParams);
            break;
        }
        case CONST.IOU.ACTION.SHARE: {
            if (!linkedTrackedExpenseReportAction || !linkedTrackedExpenseReportID) {
                return;
            }
            const transactionParams: TrackedExpenseTransactionParams = {
                transactionID: transaction?.transactionID,
                amount,
                currency,
                comment,
                merchant,
                created,
                taxCode: taxCode ?? '',
                taxAmount: taxAmount ?? 0,
                category,
                tag,
                billable,
                receipt: isFileUploadable(trackedReceipt) ? trackedReceipt : undefined,
                waypoints: sanitizedWaypoints,
                customUnitRateID: mileageRate,
                attendees,
            };
            const policyParams: TrackedExpensePolicyParams = {
                policyID: chatReport?.policyID,
            };
            const reportInformation: TrackedExpenseReportInformation = {
                moneyRequestPreviewReportActionID: iouAction?.reportActionID,
                moneyRequestReportID: iouReport?.reportID,
                moneyRequestCreatedReportActionID: createdIOUReportActionID,
                actionableWhisperReportActionID,
                linkedTrackedExpenseReportAction,
                linkedTrackedExpenseReportID,
                transactionThreadReportID,
                reportPreviewReportActionID: reportPreviewAction?.reportActionID,
                chatReportID: chatReport?.reportID,
            };
            const trackedExpenseParams: TrackedExpenseParams = {
                onyxData,
                reportInformation,
                transactionParams,
                policyParams,
                createdWorkspaceParams,
                accountantParams,
            };
            shareTrackedExpense(trackedExpenseParams);
            break;
        }
        default: {
            const parameters: TrackExpenseParams = {
                amount,
                currency,
                comment,
                created,
                merchant,
                iouReportID: iouReport?.reportID,
                chatReportID: chatReport?.reportID,
                transactionID: transaction?.transactionID,
                reportActionID: iouAction?.reportActionID,
                createdChatReportActionID,
                createdIOUReportActionID,
                reportPreviewReportActionID: reportPreviewAction?.reportActionID,
                receipt: isFileUploadable(trackedReceipt) ? trackedReceipt : undefined,
                receiptState: trackedReceipt?.state,
                category,
                tag,
                taxCode,
                taxAmount,
                billable,
                // This needs to be a string of JSON because of limitations with the fetch() API and nested objects
                receiptGpsPoints: gpsPoints ? JSON.stringify(gpsPoints) : undefined,
                transactionThreadReportID,
                createdReportActionIDForThread,
                waypoints: sanitizedWaypoints,
                customUnitRateID,
                description: parsedComment,
            };
            if (actionableWhisperReportActionIDParam) {
                parameters.actionableWhisperReportActionID = actionableWhisperReportActionIDParam;
            }
            API.write(WRITE_COMMANDS.TRACK_EXPENSE, parameters, onyxData);
        }
    }

    if (shouldHandleNavigation) {
        InteractionManager.runAfterInteractions(() => removeDraftTransactions());

        if (!params.isRetry) {
            dismissModalAndOpenReportInInboxTab(activeReportID);
        }
    }

    notifyNewAction(activeReportID, payeeAccountID);
}

function getOrCreateOptimisticSplitChatReport(existingSplitChatReportID: string | undefined, participants: Participant[], participantAccountIDs: number[], currentUserAccountID: number) {
    // The existing chat report could be passed as reportID or exist on the sole "participant" (in this case a report option)
    const existingChatReportID = existingSplitChatReportID ?? participants.at(0)?.reportID;

    // Check if the report is available locally if we do have one
    const existingSplitChatOnyxData = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${existingChatReportID}`];
    let existingSplitChatReport = existingChatReportID && existingSplitChatOnyxData ? {...existingSplitChatOnyxData} : undefined;

    const allParticipantsAccountIDs = [...participantAccountIDs, currentUserAccountID];
    if (!existingSplitChatReport) {
        existingSplitChatReport = getChatByParticipants(allParticipantsAccountIDs, undefined, participantAccountIDs.length > 1);
    }

    // We found an existing chat report we are done...
    if (existingSplitChatReport) {
        // Yes, these are the same, but give the caller a way to identify if we created a new report or not
        return {existingSplitChatReport, splitChatReport: existingSplitChatReport};
    }

    // Create a Group Chat if we have multiple participants
    if (participants.length > 1) {
        const splitChatReport = buildOptimisticChatReport({
            participantList: allParticipantsAccountIDs,
            reportName: '',
            chatType: CONST.REPORT.CHAT_TYPE.GROUP,
            notificationPreference: CONST.REPORT.NOTIFICATION_PREFERENCE.ALWAYS,
        });

        return {existingSplitChatReport: null, splitChatReport};
    }

    // Otherwise, create a new 1:1 chat report
    const splitChatReport = buildOptimisticChatReport({
        participantList: participantAccountIDs,
    });
    return {existingSplitChatReport: null, splitChatReport};
}

/**
 * Build the Onyx data and IOU split necessary for splitting a bill with 3+ users.
 * 1. Build the optimistic Onyx data for the group chat, i.e. chatReport and iouReportAction creating the former if it doesn't yet exist.
 * 2. Loop over the group chat participant list, building optimistic or updating existing chatReports, iouReports and iouReportActions between the user and each participant.
 * We build both Onyx data and the IOU split that is sent as a request param and is used by Auth to create the chatReports, iouReports and iouReportActions in the database.
 * The IOU split has the following shape:
 *  [
 *      {email: 'currentUser', amount: 100},
 *      {email: 'user2', amount: 100, iouReportID: '100', chatReportID: '110', transactionID: '120', reportActionID: '130'},
 *      {email: 'user3', amount: 100, iouReportID: '200', chatReportID: '210', transactionID: '220', reportActionID: '230'}
 *  ]
 * @param amount - always in the smallest unit of the currency
 * @param existingSplitChatReportID - the report ID where the split expense happens, could be a group chat or a expense chat
 */
function createSplitsAndOnyxData({
    participants,
    currentUserLogin,
    currentUserAccountID,
    existingSplitChatReportID,
    transactionParams: {
        amount,
        comment,
        currency,
        merchant,
        created,
        category,
        tag,
        splitShares = {},
        billable = false,
        iouRequestType = CONST.IOU.REQUEST_TYPE.MANUAL,
        taxCode = '',
        taxAmount = 0,
        attendees,
    },
}: CreateSplitsAndOnyxDataParams): SplitsAndOnyxData {
    const currentUserEmailForIOUSplit = addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = participants.map((participant) => Number(participant.accountID));

    const {splitChatReport, existingSplitChatReport} = getOrCreateOptimisticSplitChatReport(existingSplitChatReportID, participants, participantAccountIDs, currentUserAccountID);
    const isOwnPolicyExpenseChat = !!splitChatReport.isOwnPolicyExpenseChat;

    // Pass an open receipt so the distance expense will show a map with the route optimistically
    const receipt: Receipt | undefined = iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE ? {source: ReceiptGeneric as ReceiptSource, state: CONST.IOU.RECEIPT_STATE.OPEN} : undefined;

    const existingTransaction = allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`];
    const isDistanceRequest = existingTransaction && existingTransaction.iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE;
    let splitTransaction = buildOptimisticTransaction({
        existingTransaction,
        transactionParams: {
            amount,
            currency,
            reportID: CONST.REPORT.SPLIT_REPORT_ID,
            comment,
            created,
            merchant: merchant || Localize.translateLocal('iou.expense'),
            receipt,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            pendingFields: isDistanceRequest ? {waypoints: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : undefined,
            attendees,
        },
    });

    // Important data is set on the draft distance transaction, such as the iouRequestType marking it as a distance request, so merge it into the optimistic split transaction
    if (isDistanceRequest) {
        splitTransaction = fastMerge(existingTransaction, splitTransaction, false);
    }

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitCreatedReportAction = buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = buildOptimisticIOUReportAction({
        type: CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        amount,
        currency,
        comment,
        participants,
        transactionID: splitTransaction.transactionID,
        isOwnPolicyExpenseChat,
    });

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = getReportActionText(splitIOUReportAction);
    splitChatReport.lastMessageHtml = getReportActionHtml(splitIOUReportAction);
    splitChatReport.lastActorAccountID = currentUserAccountID;
    splitChatReport.lastVisibleActionCreated = splitIOUReportAction.created;

    if (splitChatReport.participants && getReportNotificationPreference(splitChatReport) === CONST.REPORT.NOTIFICATION_PREFERENCE.HIDDEN) {
        splitChatReport.participants[currentUserAccountID] = {notificationPreference: CONST.REPORT.NOTIFICATION_PREFERENCE.ALWAYS};
    }

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData: OnyxUpdate[] = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: {
                action: iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE ? CONST.QUICK_ACTIONS.SPLIT_DISTANCE : CONST.QUICK_ACTIONS.SPLIT_MANUAL,
                chatReportID: splitChatReport.reportID,
                isFirstQuickAction: isEmptyObject(quickAction),
            },
        },
        existingSplitChatReport
            ? {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitCreatedReportAction.reportActionID]: splitCreatedReportAction as OnyxTypes.ReportAction,
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    if (!existingSplitChatReport) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${splitChatReport.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null, pendingFields: null},
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${splitChatReport.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        });
    }

    const redundantParticipants: Record<number, null> = {};
    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}, participants: redundantParticipants},
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                pendingAction: null,
                pendingFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: quickAction ?? null,
        },
    ];

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitIOUReportAction.reportActionID]: {
                        errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                    },
                },
            },
        );
    }

    // Loop through participants creating individual chats, iouReports and reportActionIDs as needed
    const currentUserAmount = splitShares?.[currentUserAccountID]?.amount ?? calculateIOUAmount(participants.length, amount, currency, true);
    const currentUserTaxAmount = calculateIOUAmount(participants.length, taxAmount, currency, true);

    const splits: Split[] = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID, amount: currentUserAmount, taxAmount: currentUserTaxAmount}];

    const hasMultipleParticipants = participants.length > 1;
    participants.forEach((participant) => {
        // In a case when a participant is a workspace, even when a current user is not an owner of the workspace
        const isPolicyExpenseChat = isPolicyExpenseChatReportUtil(participant);
        const splitAmount = splitShares?.[participant.accountID ?? CONST.DEFAULT_NUMBER_ID]?.amount ?? calculateIOUAmount(participants.length, amount, currency, false);
        const splitTaxAmount = calculateIOUAmount(participants.length, taxAmount, currency, false);

        // To exclude someone from a split, the amount can be 0. The scenario for this is when creating a split from a group chat, we have remove the option to deselect users to exclude them.
        // We can input '0' next to someone we want to exclude.
        if (splitAmount === 0) {
            return;
        }

        // In case the participant is a workspace, email & accountID should remain undefined and won't be used in the rest of this code
        // participant.login is undefined when the request is initiated from a group DM with an unknown user, so we need to add a default
        const email = isOwnPolicyExpenseChat || isPolicyExpenseChat ? '' : addSMSDomainIfPhoneNumber(participant.login ?? '').toLowerCase();
        const accountID = isOwnPolicyExpenseChat || isPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // STEP 1: Get existing chat report OR build a new optimistic one
        // If we only have one participant and the request was initiated from the global create menu, i.e. !existingGroupChatReportID, the oneOnOneChatReport is the groupChatReport
        let oneOnOneChatReport: OnyxTypes.Report | OptimisticChatReport;
        let isNewOneOnOneChatReport = false;
        let shouldCreateOptimisticPersonalDetails = false;
        const personalDetailExists = accountID in allPersonalDetails;

        // If this is a split between two people only and the function
        // wasn't provided with an existing group chat report id
        // or, if the split is being made from the expense chat, then the oneOnOneChatReport is the same as the splitChatReport
        // in this case existingSplitChatReport will belong to the policy expense chat and we won't be
        // entering code that creates optimistic personal details
        if ((!hasMultipleParticipants && !existingSplitChatReportID) || isOwnPolicyExpenseChat || isOneOnOneChat(splitChatReport)) {
            oneOnOneChatReport = splitChatReport;
            shouldCreateOptimisticPersonalDetails = !existingSplitChatReport && !personalDetailExists;
        } else {
            const existingChatReport = getChatByParticipants([accountID, currentUserAccountID]);
            isNewOneOnOneChatReport = !existingChatReport;
            shouldCreateOptimisticPersonalDetails = isNewOneOnOneChatReport && !personalDetailExists;
            oneOnOneChatReport =
                existingChatReport ??
                buildOptimisticChatReport({
                    participantList: [accountID, currentUserAccountID],
                });
        }

        // STEP 2: Get existing IOU/Expense report and update its total OR build a new optimistic one
        let oneOnOneIOUReport: OneOnOneIOUReport = oneOnOneChatReport.iouReportID ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`] : null;
        const isScanRequest = isScanRequestTransactionUtils(splitTransaction);
        const shouldCreateNewOneOnOneIOUReport = shouldCreateNewMoneyRequestReportReportUtils(oneOnOneIOUReport, oneOnOneChatReport, isScanRequest);

        if (!oneOnOneIOUReport || shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isOwnPolicyExpenseChat
                ? buildOptimisticExpenseReport(oneOnOneChatReport.reportID, oneOnOneChatReport.policyID, currentUserAccountID, splitAmount, currency)
                : buildOptimisticIOUReport(currentUserAccountID, accountID, splitAmount, oneOnOneChatReport.reportID, currency);
        } else if (isOwnPolicyExpenseChat) {
            // Because of the Expense reports are stored as negative values, we subtract the total from the amount
            if (oneOnOneIOUReport?.currency === currency) {
                if (typeof oneOnOneIOUReport.total === 'number') {
                    oneOnOneIOUReport.total -= splitAmount;
                }

                if (typeof oneOnOneIOUReport.unheldTotal === 'number') {
                    oneOnOneIOUReport.unheldTotal -= splitAmount;
                }
            }
        } else {
            oneOnOneIOUReport = updateIOUOwnerAndTotal(oneOnOneIOUReport, currentUserAccountID, splitAmount, currency);
        }

        // STEP 3: Build optimistic transaction
        let oneOnOneTransaction = buildOptimisticTransaction({
            originalTransactionID: splitTransaction.transactionID,
            transactionParams: {
                amount: isExpenseReport(oneOnOneIOUReport) ? -splitAmount : splitAmount,
                currency,
                reportID: oneOnOneIOUReport.reportID,
                comment,
                created,
                merchant: merchant || Localize.translateLocal('iou.expense'),
                category,
                tag,
                taxCode,
                taxAmount: isExpenseReport(oneOnOneIOUReport) ? -splitTaxAmount : splitTaxAmount,
                billable,
                source: CONST.IOU.TYPE.SPLIT,
            },
        });

        if (isDistanceRequest) {
            oneOnOneTransaction = fastMerge(existingTransaction, oneOnOneTransaction, false);
        }

        // STEP 4: Build optimistic reportActions. We need:
        // 1. CREATED action for the chatReport
        // 2. CREATED action for the iouReport
        // 3. IOU action for the iouReport
        // 4. Transaction Thread and the CREATED action for it
        // 5. REPORT_PREVIEW action for the chatReport
        const [oneOnOneCreatedActionForChat, oneOnOneCreatedActionForIOU, oneOnOneIOUAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
            buildOptimisticMoneyRequestEntities({
                iouReport: oneOnOneIOUReport,
                type: CONST.IOU.REPORT_ACTION_TYPE.CREATE,
                amount: splitAmount,
                currency,
                comment,
                payeeEmail: currentUserEmailForIOUSplit,
                participants: [participant],
                transactionID: oneOnOneTransaction.transactionID,
            });

        // Add optimistic personal details for new participants
        const oneOnOnePersonalDetailListAction: OnyxTypes.PersonalDetailsList = shouldCreateOptimisticPersonalDetails
            ? {
                  [accountID]: {
                      accountID,
                      // Disabling this line since participant.displayName can be an empty string
                      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                      displayName: formatPhoneNumber(participant.displayName || email),
                      login: participant.login,
                      isOptimisticPersonalDetail: true,
                  },
              }
            : {};

        if (shouldCreateOptimisticPersonalDetails) {
            // BE will send different participants. We clear the optimistic ones to avoid duplicated entries
            redundantParticipants[accountID] = null;
        }

        let oneOnOneReportPreviewAction = getReportPreviewAction(oneOnOneChatReport.reportID, oneOnOneIOUReport.reportID);
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport);
        }

        // Add category to optimistic policy recently used categories when a participant is a workspace
        const optimisticPolicyRecentlyUsedCategories = isPolicyExpenseChat ? buildOptimisticPolicyRecentlyUsedCategories(participant.policyID, category) : [];

        const optimisticRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(currency);

        // Add tag to optimistic policy recently used tags when a participant is a workspace
        const optimisticPolicyRecentlyUsedTags = isPolicyExpenseChat ? buildOptimisticPolicyRecentlyUsedTags(participant.policyID, tag) : {};

        // STEP 5: Build Onyx Data
        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest({
            isNewChatReport: isNewOneOnOneChatReport,
            shouldCreateNewMoneyRequestReport: shouldCreateNewOneOnOneIOUReport,
            isOneOnOneSplit: true,
            optimisticParams: {
                chat: {
                    report: oneOnOneChatReport,
                    createdAction: oneOnOneCreatedActionForChat,
                    reportPreviewAction: oneOnOneReportPreviewAction,
                },
                iou: {
                    report: oneOnOneIOUReport,
                    createdAction: oneOnOneCreatedActionForIOU,
                    action: oneOnOneIOUAction,
                },
                transactionParams: {
                    transaction: oneOnOneTransaction,
                    transactionThreadReport: optimisticTransactionThread,
                    transactionThreadCreatedReportAction: optimisticCreatedActionForTransactionThread,
                },
                policyRecentlyUsed: {
                    categories: optimisticPolicyRecentlyUsedCategories,
                    tags: optimisticPolicyRecentlyUsedTags,
                    currencies: optimisticRecentlyUsedCurrencies,
                },
                personalDetailListAction: oneOnOnePersonalDetailListAction,
            },
        });

        const individualSplit = {
            email,
            accountID,
            isOptimisticAccount: isOptimisticPersonalDetail(accountID),
            amount: splitAmount,
            iouReportID: oneOnOneIOUReport.reportID,
            chatReportID: oneOnOneChatReport.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
            transactionThreadReportID: optimisticTransactionThread.reportID,
            createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
            taxAmount: splitTaxAmount,
        };

        splits.push(individualSplit);
        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
        value: {
            comment: {
                splits: splits.map((split) => ({accountID: split.accountID, amount: split.amount})),
            },
        },
    });

    const splitData: SplitData = {
        chatReportID: splitChatReport.reportID,
        transactionID: splitTransaction.transactionID,
        reportActionID: splitIOUReportAction.reportActionID,
        policyID: splitChatReport.policyID,
        chatType: splitChatReport.chatType,
    };

    if (!existingSplitChatReport) {
        splitData.createdReportActionID = splitCreatedReportAction.reportActionID;
    }

    return {
        splitData,
        splits,
        onyxData: {optimisticData, successData, failureData},
    };
}

type SplitBillActionsParams = {
    participants: Participant[];
    currentUserLogin: string;
    currentUserAccountID: number;
    amount: number;
    comment: string;
    currency: string;
    merchant: string;
    created: string;
    category?: string;
    tag?: string;
    billable?: boolean;
    iouRequestType?: IOURequestType;
    existingSplitChatReportID?: string;
    splitShares?: SplitShares;
    splitPayerAccountIDs?: number[];
    taxCode?: string;
    taxAmount?: number;
    isRetry?: boolean;
};

/**
 * @param amount - always in smallest currency unit
 * @param existingSplitChatReportID - Either a group DM or a expense chat
 */
function splitBill({
    participants,
    currentUserLogin,
    currentUserAccountID,
    amount,
    comment,
    currency,
    merchant,
    created,
    category = '',
    tag = '',
    billable = false,
    iouRequestType = CONST.IOU.REQUEST_TYPE.MANUAL,
    existingSplitChatReportID,
    splitShares = {},
    splitPayerAccountIDs = [],
    taxCode = '',
    taxAmount = 0,
}: SplitBillActionsParams) {
    const parsedComment = getParsedComment(comment);
    const {splitData, splits, onyxData} = createSplitsAndOnyxData({
        participants,
        currentUserLogin,
        currentUserAccountID,
        existingSplitChatReportID,
        transactionParams: {
            amount,
            comment: parsedComment,
            currency,
            merchant,
            created,
            category,
            tag,
            splitShares,
            billable,
            iouRequestType,
            taxCode,
            taxAmount,
        },
    });

    const parameters: SplitBillParams = {
        reportID: splitData.chatReportID,
        amount,
        splits: JSON.stringify(splits),
        currency,
        comment: parsedComment,
        category,
        merchant,
        created,
        tag,
        billable,
        transactionID: splitData.transactionID,
        reportActionID: splitData.reportActionID,
        createdReportActionID: splitData.createdReportActionID,
        policyID: splitData.policyID,
        chatType: splitData.chatType,
        splitPayerAccountIDs,
        taxCode,
        taxAmount,
        description: parsedComment,
    };

    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.SPLIT_BILL, parameters, onyxData);
    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));

    dismissModalAndOpenReportInInboxTab(existingSplitChatReportID);

    notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/**
 * @param amount - always in the smallest currency unit
 */
function splitBillAndOpenReport({
    participants,
    currentUserLogin,
    currentUserAccountID,
    amount,
    comment,
    currency,
    merchant,
    created,
    category = '',
    tag = '',
    billable = false,
    iouRequestType = CONST.IOU.REQUEST_TYPE.MANUAL,
    splitShares = {},
    splitPayerAccountIDs = [],
    taxCode = '',
    taxAmount = 0,
    existingSplitChatReportID,
}: SplitBillActionsParams) {
    const parsedComment = getParsedComment(comment);
    const {splitData, splits, onyxData} = createSplitsAndOnyxData({
        participants,
        currentUserLogin,
        currentUserAccountID,
        existingSplitChatReportID,
        transactionParams: {
            amount,
            comment: parsedComment,
            currency,
            merchant,
            created,
            category,
            tag,
            splitShares,
            billable,
            iouRequestType,
            taxCode,
            taxAmount,
        },
    });

    const parameters: SplitBillParams = {
        reportID: splitData.chatReportID,
        amount,
        splits: JSON.stringify(splits),
        currency,
        merchant,
        created,
        comment: parsedComment,
        category,
        tag,
        billable,
        transactionID: splitData.transactionID,
        reportActionID: splitData.reportActionID,
        createdReportActionID: splitData.createdReportActionID,
        policyID: splitData.policyID,
        chatType: splitData.chatType,
        splitPayerAccountIDs,
        taxCode,
        taxAmount,
        description: parsedComment,
    };

    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.SPLIT_BILL_AND_OPEN_REPORT, parameters, onyxData);
    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));

    dismissModalAndOpenReportInInboxTab(splitData.chatReportID);
    notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/** Used exclusively for starting a split expense request that contains a receipt, the split request will be completed once the receipt is scanned
 *  or user enters details manually.
 *
 * @param existingSplitChatReportID - Either a group DM or a expense chat
 */
function startSplitBill({
    participants,
    currentUserLogin,
    currentUserAccountID,
    comment,
    receipt,
    existingSplitChatReportID,
    billable = false,
    category = '',
    tag = '',
    currency,
    taxCode = '',
    taxAmount = 0,
    shouldPlaySound = true,
}: StartSplitBilActionParams) {
    const currentUserEmailForIOUSplit = addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = participants.map((participant) => Number(participant.accountID));
    const {splitChatReport, existingSplitChatReport} = getOrCreateOptimisticSplitChatReport(existingSplitChatReportID, participants, participantAccountIDs, currentUserAccountID);
    const isOwnPolicyExpenseChat = !!splitChatReport.isOwnPolicyExpenseChat;
    const parsedComment = getParsedComment(comment);

    const {name: filename, source, state = CONST.IOU.RECEIPT_STATE.SCAN_READY} = receipt;
    const receiptObject: Receipt = {state, source};

    // ReportID is -2 (aka "deleted") on the group transaction
    const splitTransaction = buildOptimisticTransaction({
        transactionParams: {
            amount: 0,
            currency,
            reportID: CONST.REPORT.SPLIT_REPORT_ID,
            comment: parsedComment,
            merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
            receipt: receiptObject,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            filename,
        },
    });

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitChatCreatedReportAction = buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = buildOptimisticIOUReportAction({
        type: CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        amount: 0,
        currency: CONST.CURRENCY.USD,
        comment: parsedComment,
        participants,
        transactionID: splitTransaction.transactionID,
        isOwnPolicyExpenseChat,
    });

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = getReportActionText(splitIOUReportAction);
    splitChatReport.lastMessageHtml = getReportActionHtml(splitIOUReportAction);

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData: OnyxUpdate[] = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: {
                action: CONST.QUICK_ACTIONS.SPLIT_SCAN,
                chatReportID: splitChatReport.reportID,
                isFirstQuickAction: isEmptyObject(quickAction),
            },
        },
        existingSplitChatReport
            ? {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              }
            : {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                  value: {
                      [splitChatCreatedReportAction.reportActionID]: splitChatCreatedReportAction,
                      [splitIOUReportAction.reportActionID]: splitIOUReportAction as OnyxTypes.ReportAction,
                  },
              },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    if (!existingSplitChatReport) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${splitChatReport.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitChatCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null},
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${splitChatReport.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        });
    }

    const redundantParticipants: Record<number, null> = {};
    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}, participants: redundantParticipants},
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: quickAction ?? null,
        },
    ];

    const retryParams = {
        participants: participants.map(({icons, ...rest}) => rest),
        currentUserLogin,
        currentUserAccountID,
        comment,
        receipt: receiptObject,
        existingSplitChatReportID,
        billable,
        category,
        tag,
        currency,
        taxCode,
        taxAmount,
    };

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: getReceiptError(receipt, filename, undefined, undefined, CONST.IOU.ACTION_PARAMS.START_SPLIT_BILL, retryParams),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitChatCreatedReportAction.reportActionID]: {
                        errors: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                    },
                    [splitIOUReportAction.reportActionID]: {
                        errors: getReceiptError(receipt, filename, undefined, undefined, CONST.IOU.ACTION_PARAMS.START_SPLIT_BILL, retryParams),
                    },
                },
            },
        );
    }

    const splits: Split[] = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID}];

    participants.forEach((participant) => {
        // Disabling this line since participant.login can be an empty string
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const email = participant.isOwnPolicyExpenseChat ? '' : addSMSDomainIfPhoneNumber(participant.login || participant.text || '').toLowerCase();
        const accountID = participant.isOwnPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // When splitting with a expense chat, we only need to supply the policyID and the workspace reportID as it's needed so we can update the report preview
        if (participant.isOwnPolicyExpenseChat) {
            splits.push({
                policyID: participant.policyID,
                chatReportID: splitChatReport.reportID,
            });
            return;
        }

        const participantPersonalDetails = allPersonalDetails[participant?.accountID ?? CONST.DEFAULT_NUMBER_ID];
        if (!participantPersonalDetails) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.PERSONAL_DETAILS_LIST,
                value: {
                    [accountID]: {
                        accountID,
                        // Disabling this line since participant.displayName can be an empty string
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        displayName: formatPhoneNumber(participant.displayName || email),
                        // Disabling this line since participant.login can be an empty string
                        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                        login: participant.login || participant.text,
                        isOptimisticPersonalDetail: true,
                    },
                },
            });
            // BE will send different participants. We clear the optimistic ones to avoid duplicated entries
            redundantParticipants[accountID] = null;
        }

        splits.push({
            email,
            accountID,
        });
    });

    participants.forEach((participant) => {
        const isPolicyExpenseChat = isPolicyExpenseChatReportUtil(participant);
        if (!isPolicyExpenseChat) {
            return;
        }

        const optimisticPolicyRecentlyUsedCategories = buildOptimisticPolicyRecentlyUsedCategories(participant.policyID, category);
        const optimisticPolicyRecentlyUsedTags = buildOptimisticPolicyRecentlyUsedTags(participant.policyID, tag);
        const optimisticRecentlyUsedCurrencies = buildOptimisticRecentlyUsedCurrencies(currency);

        if (optimisticPolicyRecentlyUsedCategories.length > 0) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${participant.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }

        if (optimisticRecentlyUsedCurrencies.length > 0) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: ONYXKEYS.RECENTLY_USED_CURRENCIES,
                value: optimisticRecentlyUsedCurrencies,
            });
        }

        if (!isEmptyObject(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${participant.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    });

    // Save the new splits array into the transaction's comment in case the user calls CompleteSplitBill while offline
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
        value: {
            comment: {
                splits,
            },
        },
    });

    const parameters: StartSplitBillParams = {
        chatReportID: splitChatReport.reportID,
        reportActionID: splitIOUReportAction.reportActionID,
        transactionID: splitTransaction.transactionID,
        splits: JSON.stringify(splits),
        receipt,
        comment: parsedComment,
        category,
        tag,
        currency,
        isFromGroupDM: !existingSplitChatReport,
        billable,
        ...(existingSplitChatReport ? {} : {createdReportActionID: splitChatCreatedReportAction.reportActionID}),
        chatType: splitChatReport?.chatType,
        taxCode,
        taxAmount,
        description: parsedComment,
    };
    if (shouldPlaySound) {
        playSound(SOUNDS.DONE);
    }

    API.write(WRITE_COMMANDS.START_SPLIT_BILL, parameters, {optimisticData, successData, failureData});

    Navigation.dismissModalWithReport({reportID: splitChatReport.reportID});
    notifyNewAction(splitChatReport.reportID, currentUserAccountID);

    // Return the split transactionID for testing purpose
    return {splitTransactionID: splitTransaction.transactionID};
}

/** Used for editing a split expense while it's still scanning or when SmartScan fails, it completes a split expense started by startSplitBill above.
 *
 * @param chatReportID - The group chat or workspace reportID
 * @param reportAction - The split action that lives in the chatReport above
 * @param updatedTransaction - The updated **draft** split transaction
 * @param sessionAccountID - accountID of the current user
 * @param sessionEmail - email of the current user
 */
function completeSplitBill(
    chatReportID: string,
    reportAction: OnyxEntry<OnyxTypes.ReportAction>,
    updatedTransaction: OnyxEntry<OnyxTypes.Transaction>,
    sessionAccountID: number,
    sessionEmail?: string,
) {
    if (!reportAction) {
        return;
    }

    const parsedComment = getParsedComment(Parser.htmlToMarkdown(updatedTransaction?.comment?.comment ?? ''));
    if (updatedTransaction?.comment) {
        // eslint-disable-next-line no-param-reassign
        updatedTransaction.comment.comment = parsedComment;
    }
    const currentUserEmailForIOUSplit = addSMSDomainIfPhoneNumber(sessionEmail);
    const transactionID = updatedTransaction?.transactionID;
    const unmodifiedTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];

    // Save optimistic updated transaction and action
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...updatedTransaction,
                receipt: {
                    state: CONST.IOU.RECEIPT_STATE.OPEN,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    lastModified: DateUtils.getDBTime(),
                    originalMessage: {
                        whisperedTo: [],
                    },
                },
            },
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`,
            value: {pendingAction: null},
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...unmodifiedTransaction,
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                },
            },
        },
    ];

    const splitParticipants: Split[] = updatedTransaction?.comment?.splits ?? [];
    const amount = updatedTransaction?.modifiedAmount;
    const currency = updatedTransaction?.modifiedCurrency;

    // Exclude the current user when calculating the split amount, `calculateAmount` takes it into account
    const splitAmount = calculateIOUAmount(splitParticipants.length - 1, amount ?? 0, currency ?? '', false);
    const splitTaxAmount = calculateIOUAmount(splitParticipants.length - 1, updatedTransaction?.taxAmount ?? 0, currency ?? '', false);

    const splits: Split[] = [{email: currentUserEmailForIOUSplit}];
    splitParticipants.forEach((participant) => {
        // Skip creating the transaction for the current user
        if (participant.email === currentUserEmailForIOUSplit) {
            return;
        }
        const isPolicyExpenseChat = !!participant.policyID;

        if (!isPolicyExpenseChat) {
            // In case this is still the optimistic accountID saved in the splits array, return early as we cannot know
            // if there is an existing chat between the split creator and this participant
            // Instead, we will rely on Auth generating the report IDs and the user won't see any optimistic chats or reports created
            const participantPersonalDetails: OnyxTypes.PersonalDetails | null = allPersonalDetails[participant?.accountID ?? CONST.DEFAULT_NUMBER_ID];
            if (!participantPersonalDetails || participantPersonalDetails.isOptimisticPersonalDetail) {
                splits.push({
                    email: participant.email,
                });
                return;
            }
        }

        let oneOnOneChatReport: OnyxEntry<OnyxTypes.Report>;
        let isNewOneOnOneChatReport = false;
        if (isPolicyExpenseChat) {
            // The expense chat reportID is saved in the splits array when starting a split expense with a workspace
            oneOnOneChatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${participant.chatReportID}`];
        } else {
            const existingChatReport = getChatByParticipants(participant.accountID ? [participant.accountID, sessionAccountID] : []);
            isNewOneOnOneChatReport = !existingChatReport;
            oneOnOneChatReport =
                existingChatReport ??
                buildOptimisticChatReport({
                    participantList: participant.accountID ? [participant.accountID, sessionAccountID] : [],
                });
        }

        let oneOnOneIOUReport: OneOnOneIOUReport = oneOnOneChatReport?.iouReportID ? allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`] : null;
        const shouldCreateNewOneOnOneIOUReport = shouldCreateNewMoneyRequestReportReportUtils(oneOnOneIOUReport, oneOnOneChatReport, false);

        if (!oneOnOneIOUReport || shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isPolicyExpenseChat
                ? buildOptimisticExpenseReport(oneOnOneChatReport?.reportID, participant.policyID, sessionAccountID, splitAmount, currency ?? '')
                : buildOptimisticIOUReport(sessionAccountID, participant.accountID ?? CONST.DEFAULT_NUMBER_ID, splitAmount, oneOnOneChatReport?.reportID, currency ?? '');
        } else if (isPolicyExpenseChat) {
            if (typeof oneOnOneIOUReport?.total === 'number') {
                // Because of the Expense reports are stored as negative values, we subtract the total from the amount
                oneOnOneIOUReport.total -= splitAmount;
            }
        } else {
            oneOnOneIOUReport = updateIOUOwnerAndTotal(oneOnOneIOUReport, sessionAccountID, splitAmount, currency ?? '');
        }

        const oneOnOneTransaction = buildOptimisticTransaction({
            originalTransactionID: transactionID,
            transactionParams: {
                amount: isPolicyExpenseChat ? -splitAmount : splitAmount,
                currency: currency ?? '',
                reportID: oneOnOneIOUReport?.reportID,
                comment: parsedComment,
                created: updatedTransaction?.modifiedCreated,
                merchant: updatedTransaction?.modifiedMerchant,
                receipt: {...updatedTransaction?.receipt, state: CONST.IOU.RECEIPT_STATE.OPEN},
                category: updatedTransaction?.category,
                tag: updatedTransaction?.tag,
                taxCode: updatedTransaction?.taxCode,
                taxAmount: isPolicyExpenseChat ? -splitTaxAmount : splitAmount,
                billable: updatedTransaction?.billable,
                source: CONST.IOU.TYPE.SPLIT,
                filename: updatedTransaction?.filename,
            },
        });

        const [oneOnOneCreatedActionForChat, oneOnOneCreatedActionForIOU, oneOnOneIOUAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
            buildOptimisticMoneyRequestEntities({
                iouReport: oneOnOneIOUReport,
                type: CONST.IOU.REPORT_ACTION_TYPE.CREATE,
                amount: splitAmount,
                currency: currency ?? '',
                comment: parsedComment,
                payeeEmail: currentUserEmailForIOUSplit,
                participants: [participant],
                transactionID: oneOnOneTransaction.transactionID,
            });

        let oneOnOneReportPreviewAction = getReportPreviewAction(oneOnOneChatReport?.reportID, oneOnOneIOUReport?.reportID);
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport, '', oneOnOneTransaction);
        }

        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest({
            isNewChatReport: isNewOneOnOneChatReport,
            isOneOnOneSplit: true,
            shouldCreateNewMoneyRequestReport: shouldCreateNewOneOnOneIOUReport,
            optimisticParams: {
                chat: {
                    report: oneOnOneChatReport,
                    createdAction: oneOnOneCreatedActionForChat,
                    reportPreviewAction: oneOnOneReportPreviewAction,
                },
                iou: {
                    report: oneOnOneIOUReport,
                    createdAction: oneOnOneCreatedActionForIOU,
                    action: oneOnOneIOUAction,
                },
                transactionParams: {
                    transaction: oneOnOneTransaction,
                    transactionThreadReport: optimisticTransactionThread,
                    transactionThreadCreatedReportAction: optimisticCreatedActionForTransactionThread,
                },
                policyRecentlyUsed: {},
            },
        });

        splits.push({
            email: participant.email,
            accountID: participant.accountID,
            policyID: participant.policyID,
            iouReportID: oneOnOneIOUReport?.reportID,
            chatReportID: oneOnOneChatReport?.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
            transactionThreadReportID: optimisticTransactionThread.reportID,
            createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        });

        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    const {
        amount: transactionAmount,
        currency: transactionCurrency,
        created: transactionCreated,
        merchant: transactionMerchant,
        comment: transactionComment,
        category: transactionCategory,
        tag: transactionTag,
        taxCode: transactionTaxCode,
        taxAmount: transactionTaxAmount,
        billable: transactionBillable,
    } = getTransactionDetails(updatedTransaction) ?? {};

    const parameters: CompleteSplitBillParams = {
        transactionID,
        amount: transactionAmount,
        currency: transactionCurrency,
        created: transactionCreated,
        merchant: transactionMerchant,
        comment: transactionComment,
        category: transactionCategory,
        tag: transactionTag,
        splits: JSON.stringify(splits),
        taxCode: transactionTaxCode,
        taxAmount: transactionTaxAmount,
        billable: transactionBillable,
        description: parsedComment,
    };

    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.COMPLETE_SPLIT_BILL, parameters, {optimisticData, successData, failureData});
    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));
    dismissModalAndOpenReportInInboxTab(chatReportID);
    notifyNewAction(chatReportID, sessionAccountID);
}

function setDraftSplitTransaction(transactionID: string | undefined, transactionChanges: TransactionChanges = {}, policy?: OnyxEntry<OnyxTypes.Policy>) {
    if (!transactionID) {
        return undefined;
    }
    let draftSplitTransaction = allDraftSplitTransactions[`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`];

    if (!draftSplitTransaction) {
        draftSplitTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    }

    const updatedTransaction = draftSplitTransaction
        ? getUpdatedTransaction({
              transaction: draftSplitTransaction,
              transactionChanges,
              isFromExpenseReport: false,
              shouldUpdateReceiptState: false,
              policy,
          })
        : null;

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`, updatedTransaction);
}

/** Requests money based on a distance (e.g. mileage from a map) */
function createDistanceRequest(distanceRequestInformation: CreateDistanceRequestInformation) {
    const {
        report,
        participants,
        currentUserLogin = '',
        currentUserAccountID = -1,
        iouType = CONST.IOU.TYPE.SUBMIT,
        existingTransaction,
        transactionParams,
        policyParams = {},
        backToReport,
    } = distanceRequestInformation;
    const {policy, policyCategories, policyTagList} = policyParams;
    const parsedComment = getParsedComment(transactionParams.comment);
    transactionParams.comment = parsedComment;
    const {amount, comment, currency, created, category, tag, taxAmount, taxCode, merchant, billable, validWaypoints, customUnitRateID = '', splitShares = {}, attendees} = transactionParams;

    // If the report is an iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = isMoneyRequestReportReportUtils(report);
    const currentChatReport = isMoneyRequestReport ? getReportOrDraftReport(report?.chatReportID) : report;
    const moneyRequestReportID = isMoneyRequestReport ? report?.reportID : '';

    const optimisticReceipt: Receipt = {
        source: ReceiptGeneric as ReceiptSource,
        state: CONST.IOU.RECEIPT_STATE.OPEN,
    };

    let parameters: CreateDistanceRequestParams;
    let onyxData: OnyxData;
    const sanitizedWaypoints = sanitizeRecentWaypoints(validWaypoints);
    if (iouType === CONST.IOU.TYPE.SPLIT) {
        const {
            splitData,
            splits,
            onyxData: splitOnyxData,
        } = createSplitsAndOnyxData({
            participants,
            currentUserLogin: currentUserLogin ?? '',
            currentUserAccountID,
            existingSplitChatReportID: report?.reportID,
            transactionParams: {
                amount,
                comment,
                currency,
                merchant,
                created,
                category: category ?? '',
                tag: tag ?? '',
                splitShares,
                billable,
                iouRequestType: CONST.IOU.REQUEST_TYPE.DISTANCE,
                taxCode,
                taxAmount,
                attendees,
            },
        });
        onyxData = splitOnyxData;

        // Splits don't use the IOU report param. The split transaction isn't linked to a report shown in the UI, it's linked to a special default reportID of -2.
        // Therefore, any params related to the IOU report are irrelevant and omitted below.
        parameters = {
            transactionID: splitData.transactionID,
            chatReportID: splitData.chatReportID,
            createdChatReportActionID: splitData.createdReportActionID,
            reportActionID: splitData.reportActionID,
            waypoints: JSON.stringify(sanitizedWaypoints),
            customUnitRateID,
            comment,
            created,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            splits: JSON.stringify(splits),
            chatType: splitData.chatType,
            description: parsedComment,
            attendees: attendees ? JSON.stringify(attendees) : undefined,
        };
    } else {
        const participant = participants.at(0) ?? {};
        const {
            iouReport,
            chatReport,
            transaction,
            iouAction,
            createdChatReportActionID,
            createdIOUReportActionID,
            reportPreviewAction,
            transactionThreadReportID,
            createdReportActionIDForThread,
            payerEmail,
            onyxData: moneyRequestOnyxData,
        } = getMoneyRequestInformation({
            parentChatReport: currentChatReport,
            existingTransaction,
            moneyRequestReportID,
            participantParams: {
                participant,
                payeeAccountID: userAccountID,
                payeeEmail: currentUserEmail,
            },
            policyParams: {
                policy,
                policyCategories,
                policyTagList,
            },
            transactionParams: {
                amount,
                currency,
                comment,
                created,
                merchant,
                receipt: optimisticReceipt,
                category,
                tag,
                taxCode,
                taxAmount,
                billable,
                attendees,
            },
        });

        onyxData = moneyRequestOnyxData;

        parameters = {
            comment,
            iouReportID: iouReport.reportID,
            chatReportID: chatReport.reportID,
            transactionID: transaction.transactionID,
            reportActionID: iouAction.reportActionID,
            createdChatReportActionID,
            createdIOUReportActionID,
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
            waypoints: JSON.stringify(sanitizedWaypoints),
            created,
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
            transactionThreadReportID,
            createdReportActionIDForThread,
            payerEmail,
            customUnitRateID,
            description: parsedComment,
            attendees: attendees ? JSON.stringify(attendees) : undefined,
        };
    }

    const recentServerValidatedWaypoints = getRecentWaypoints().filter((item) => !item.pendingAction);
    onyxData?.failureData?.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.NVP_RECENT_WAYPOINTS}`,
        value: recentServerValidatedWaypoints,
    });

    playSound(SOUNDS.DONE);

    API.write(WRITE_COMMANDS.CREATE_DISTANCE_REQUEST, parameters, onyxData);
    InteractionManager.runAfterInteractions(() => removeDraftTransaction(CONST.IOU.OPTIMISTIC_TRANSACTION_ID));
    const activeReportID = isMoneyRequestReport && report?.reportID ? report.reportID : parameters.chatReportID;
    dismissModalAndOpenReportInInboxTab(backToReport ?? activeReportID);

    if (!isMoneyRequestReport) {
        notifyNewAction(activeReportID, userAccountID);
    }
}

type UpdateMoneyRequestAmountAndCurrencyParams = {
    transactionID: string;
    transactionThreadReportID: string;
    currency: string;
    amount: number;
    taxAmount: number;
    policy?: OnyxEntry<OnyxTypes.Policy>;
    policyTagList?: OnyxEntry<OnyxTypes.PolicyTagLists>;
    policyCategories?: OnyxEntry<OnyxTypes.PolicyCategories>;
    taxCode: string;
    transactions: OnyxCollection<OnyxTypes.Transaction>;
    transactionViolations: OnyxCollection<OnyxTypes.TransactionViolations>;
};

/** Updates the amount and currency fields of an expense */
function updateMoneyRequestAmountAndCurrency({
    transactionID,
    transactionThreadReportID,
    currency,
    amount,
    taxAmount,
    policy,
    policyTagList,
    policyCategories,
    taxCode,
    transactions,
    transactionViolations,
}: UpdateMoneyRequestAmountAndCurrencyParams) {
    const transactionChanges = {
        amount,
        currency,
        taxCode,
        taxAmount,
    };
    const transactionThreadReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`] ?? null;
    const parentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReport?.parentReportID}`] ?? null;
    let data: UpdateMoneyRequestData;
    if (isTrackExpenseReport(transactionThreadReport) && isSelfDM(parentReport)) {
        data = getUpdateTrackExpenseParams(transactionID, transactionThreadReportID, transactionChanges, policy);
    } else {
        data = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, policy, policyTagList ?? null, policyCategories ?? null);
        removeTransactionFromDuplicateTransactionViolation(data.onyxData, transactionID, transactions, transactionViolations);
    }
    const {params, onyxData} = data;
    API.write(WRITE_COMMANDS.UPDATE_MONEY_REQUEST_AMOUNT_AND_CURRENCY, params, onyxData);
}

/**
 *
 * @param transactionID  - The transactionID of IOU
 * @param reportAction - The reportAction of the transaction in the IOU report
 * @return the url to navigate back once the money request is deleted
 */
function prepareToCleanUpMoneyRequest(transactionID: string, reportAction: OnyxTypes.ReportAction, shouldRemoveIOUTransactionID = true, transactionIDsPendingDeletion?: string[]) {
    // STEP 1: Get all collections we're updating
    const iouReportID = isMoneyRequestAction(reportAction) ? getOriginalMessage(reportAction)?.IOUReportID : undefined;
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${iouReportID}`] ?? null;
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${iouReport?.chatReportID}`];
    const reportPreviewAction = getReportPreviewAction(iouReport?.chatReportID, iouReport?.reportID);
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const isTransactionOnHold = isOnHold(transaction);
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`];
    const transactionThreadID = reportAction.childReportID;
    let transactionThread = null;
    if (transactionThreadID) {
        transactionThread = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`] ?? null;
    }

    // STEP 2: Decide if we need to:
    // 1. Delete the transactionThread - delete if there are no visible comments in the thread
    // 2. Update the moneyRequestPreview to show [Deleted expense] - update if the transactionThread exists AND it isn't being deleted
    // The current state is that we want to get rid of the [Deleted expense] breadcrumb,
    // so we never want to display it if transactionThreadID is present.
    const shouldDeleteTransactionThread = !!transactionThreadID;

    // STEP 3: Update the IOU reportAction and decide if the iouReport should be deleted. We delete the iouReport if there are no visible comments left in the report.
    const updatedReportAction = {
        [reportAction.reportActionID]: {
            pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            previousMessage: reportAction.message,
            message: [
                {
                    type: 'COMMENT',
                    html: '',
                    text: '',
                    isEdited: true,
                    isDeletedParentAction: shouldDeleteTransactionThread,
                },
            ],
            originalMessage: {
                IOUTransactionID: shouldRemoveIOUTransactionID ? null : transactionID,
            },
            errors: null,
        },
    } as Record<string, NullishDeep<OnyxTypes.ReportAction>>;

    let canUserPerformWriteAction = true;
    if (chatReport) {
        canUserPerformWriteAction = !!canUserPerformWriteActionReportUtils(chatReport);
    }
    // If we are deleting the last transaction on a report, then delete the report too
    const shouldDeleteIOUReport = getReportTransactions(iouReportID).filter((trans) => !transactionIDsPendingDeletion?.includes(trans.transactionID)).length === 1;

    // STEP 4: Update the iouReport and reportPreview with new totals and messages if it wasn't deleted
    let updatedIOUReport: OnyxInputValue<OnyxTypes.Report>;
    const currency = getCurrency(transaction);
    const updatedReportPreviewAction: Partial<OnyxTypes.ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.REPORT_PREVIEW>> = cloneDeep(reportPreviewAction ?? {});
    updatedReportPreviewAction.pendingAction = shouldDeleteIOUReport ? CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE : CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE;
    if (iouReport && isExpenseReport(iouReport)) {
        updatedIOUReport = {...iouReport};

        if (typeof updatedIOUReport.total === 'number' && currency === iouReport?.currency) {
            // Because of the Expense reports are stored as negative values, we add the total from the amount
            const amountDiff = getAmount(transaction, true);
            updatedIOUReport.total += amountDiff;

            if (!transaction?.reimbursable && typeof updatedIOUReport.nonReimbursableTotal === 'number') {
                updatedIOUReport.nonReimbursableTotal += amountDiff;
            }

            if (!isTransactionOnHold) {
                if (typeof updatedIOUReport.unheldTotal === 'number') {
                    updatedIOUReport.unheldTotal += amountDiff;
                }

                if (!transaction?.reimbursable && typeof updatedIOUReport.unheldNonReimbursableTotal === 'number') {
                    updatedIOUReport.unheldNonReimbursableTotal += amountDiff;
                }
            }
        }
    } else {
        updatedIOUReport = updateIOUOwnerAndTotal(
            iouReport,
            reportAction.actorAccountID ?? CONST.DEFAULT_NUMBER_ID,
            getAmount(transaction, false),
            currency,
            true,
            false,
            isTransactionOnHold,
        );
    }

    if (updatedIOUReport) {
        const lastVisibleAction = getLastVisibleAction(iouReport?.reportID, canUserPerformWriteAction, updatedReportAction);
        const iouReportLastMessageText = getLastVisibleMessage(iouReport?.reportID, canUserPerformWriteAction, updatedReportAction).lastMessageText;
        updatedIOUReport.lastMessageText = iouReportLastMessageText;
        updatedIOUReport.lastVisibleActionCreated = lastVisibleAction?.created;
    }

    const hasNonReimbursableTransactions = hasNonReimbursableTransactionsReportUtils(iouReport?.reportID);
    const messageText = Localize.translateLocal(hasNonReimbursableTransactions ? 'iou.payerSpentAmount' : 'iou.payerOwesAmount', {
        payer: getPersonalDetailsForAccountID(updatedIOUReport?.managerID ?? CONST.DEFAULT_NUMBER_ID).login ?? '',
        amount: convertToDisplayString(updatedIOUReport?.total, updatedIOUReport?.currency),
    });

    if (getReportActionMessage(updatedReportPreviewAction)) {
        if (Array.isArray(updatedReportPreviewAction?.message)) {
            const message = updatedReportPreviewAction.message.at(0);
            if (message) {
                message.text = messageText;
                message.html = messageText;
                message.deleted = shouldDeleteIOUReport ? DateUtils.getDBTime() : '';
            }
        } else if (!Array.isArray(updatedReportPreviewAction.message) && updatedReportPreviewAction.message) {
            updatedReportPreviewAction.message.text = messageText;
            updatedReportPreviewAction.message.deleted = shouldDeleteIOUReport ? DateUtils.getDBTime() : '';
        }
    }

    if (updatedReportPreviewAction && reportPreviewAction?.childMoneyRequestCount && reportPreviewAction?.childMoneyRequestCount > 0) {
        updatedReportPreviewAction.childMoneyRequestCount = reportPreviewAction.childMoneyRequestCount - 1;
    }

    return {
        shouldDeleteTransactionThread,
        shouldDeleteIOUReport,
        updatedReportAction,
        updatedIOUReport,
        updatedReportPreviewAction,
        transactionThreadID,
        transactionThread,
        chatReport,
        transaction,
        transactionViolations,
        reportPreviewAction,
        iouReport,
    };
}

/**
 * Calculate the URL to navigate to after a money request deletion
 * @param transactionID - The ID of the money request being deleted
 * @param reportAction - The report action associated with the money request
 * @param isSingleTransactionView - whether we are in the transaction thread report
 * @returns The URL to navigate to
 */
function getNavigationUrlOnMoneyRequestDelete(transactionID: string | undefined, reportAction: OnyxTypes.ReportAction, isSingleTransactionView = false): Route | undefined {
    if (!transactionID) {
        return undefined;
    }

    const {shouldDeleteTransactionThread, shouldDeleteIOUReport, iouReport} = prepareToCleanUpMoneyRequest(transactionID, reportAction);

    // Determine which report to navigate back to
    if (iouReport && isSingleTransactionView && shouldDeleteTransactionThread && !shouldDeleteIOUReport) {
        return ROUTES.REPORT_WITH_ID.getRoute(iouReport.reportID);
    }

    if (iouReport?.chatReportID && shouldDeleteIOUReport) {
        return ROUTES.REPORT_WITH_ID.getRoute(iouReport.chatReportID);
    }

    return undefined;
}

/**
 * Calculate the URL to navigate to after a track expense deletion
 * @param chatReportID - The ID of the chat report containing the track expense
 * @param transactionID - The ID of the track expense being deleted
 * @param reportAction - The report action associated with the track expense
 * @param isSingleTransactionView - Whether we're in single transaction view
 * @returns The URL to navigate to
 */
function getNavigationUrlAfterTrackExpenseDelete(
    chatReportID: string | undefined,
    transactionID: string | undefined,
    reportAction: OnyxTypes.ReportAction,
    isSingleTransactionView = false,
): Route | undefined {
    if (!chatReportID || !transactionID) {
        return undefined;
    }

    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`] ?? null;

    // If not a self DM, handle it as a regular money request
    if (!isSelfDM(chatReport)) {
        return getNavigationUrlOnMoneyRequestDelete(transactionID, reportAction, isSingleTransactionView);
    }

    const transactionThreadID = reportAction.childReportID;
    const shouldDeleteTransactionThread = transactionThreadID ? (reportAction?.childVisibleActionCount ?? 0) === 0 : false;

    // Only navigate if in single transaction view and the thread will be deleted
    if (isSingleTransactionView && shouldDeleteTransactionThread && chatReport?.reportID) {
        // Pop the deleted report screen before navigating. This prevents navigating to the Concierge chat due to the missing report.
        return ROUTES.REPORT_WITH_ID.getRoute(chatReport.reportID);
    }

    return undefined;
}

/**
 *
 * @param transactionID  - The transactionID of IOU
 * @param reportAction - The reportAction of the transaction in the IOU report
 * @param isSingleTransactionView - whether we are in the transaction thread report
 * @return the url to navigate back once the money request is deleted
 */
function cleanUpMoneyRequest(transactionID: string, reportAction: OnyxTypes.ReportAction, reportID: string, isSingleTransactionView = false) {
    const {
        shouldDeleteTransactionThread,
        shouldDeleteIOUReport,
        updatedReportAction,
        updatedIOUReport,
        updatedReportPreviewAction,
        transactionThreadID,
        chatReport,
        iouReport,
        reportPreviewAction,
    } = prepareToCleanUpMoneyRequest(transactionID, reportAction, false);

    const urlToNavigateBack = getNavigationUrlOnMoneyRequestDelete(transactionID, reportAction, isSingleTransactionView);
    // build Onyx data

    // Onyx operations to delete the transaction, update the IOU report action and chat report action
    const reportActionsOnyxUpdates: OnyxUpdate[] = [];
    const onyxUpdates: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: null,
        },
    ];
    reportActionsOnyxUpdates.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
        value: {
            [reportAction.reportActionID]: shouldDeleteIOUReport
                ? null
                : {
                      pendingAction: null,
                  },
        },
    });

    if (reportPreviewAction?.reportActionID) {
        reportActionsOnyxUpdates.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    ...updatedReportPreviewAction,
                    pendingAction: null,
                    errors: null,
                },
            },
        });
    }

    // added the operation to delete associated transaction violations
    onyxUpdates.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
        value: null,
    });

    // added the operation to delete transaction thread
    if (shouldDeleteTransactionThread) {
        onyxUpdates.push(
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                value: null,
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadID}`,
                value: null,
            },
        );
    }

    // added operations to update IOU report and chat report
    reportActionsOnyxUpdates.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
        value: updatedReportAction,
    });
    onyxUpdates.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: updatedIOUReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: getOutstandingChildRequest(updatedIOUReport),
        },
    );

    if (!shouldDeleteIOUReport && updatedReportPreviewAction.childMoneyRequestCount === 0) {
        onyxUpdates.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: false,
            },
        });
    }

    if (shouldDeleteIOUReport) {
        let canUserPerformWriteAction = true;
        if (chatReport) {
            canUserPerformWriteAction = !!canUserPerformWriteActionReportUtils(chatReport);
        }

        const lastMessageText = getLastVisibleMessage(
            iouReport?.chatReportID,
            canUserPerformWriteAction,
            reportPreviewAction?.reportActionID ? {[reportPreviewAction.reportActionID]: null} : {},
        )?.lastMessageText;
        const lastVisibleActionCreated = getLastVisibleAction(
            iouReport?.chatReportID,
            canUserPerformWriteAction,
            reportPreviewAction?.reportActionID ? {[reportPreviewAction.reportActionID]: null} : {},
        )?.created;

        onyxUpdates.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
                value: {
                    hasOutstandingChildRequest: false,
                    iouReportID: null,
                    lastMessageText,
                    lastVisibleActionCreated,
                },
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                value: null,
            },
        );
    }

    clearAllRelatedReportActionErrors(reportID, reportAction);

    // First, update the reportActions to ensure related actions are not displayed.
    Onyx.update(reportActionsOnyxUpdates).then(() => {
        Navigation.goBack(urlToNavigateBack);
        InteractionManager.runAfterInteractions(() => {
            // After navigation, update the remaining data.
            Onyx.update(onyxUpdates);
        });
    });
}

/**
 *
 * @param transactionID  - The transactionID of IOU
 * @param reportAction - The reportAction of the transaction in the IOU report
 * @param isSingleTransactionView - whether we are in the transaction thread report
 * @return the url to navigate back once the money request is deleted
 */
function deleteMoneyRequest(
    transactionID: string | undefined,
    reportAction: OnyxTypes.ReportAction,
    transactions: OnyxCollection<OnyxTypes.Transaction>,
    violations: OnyxCollection<OnyxTypes.TransactionViolations>,
    isSingleTransactionView = false,
    transactionIDsPendingDeletion?: string[],
) {
    if (!transactionID) {
        return;
    }

    // STEP 1: Calculate and prepare the data
    const {
        shouldDeleteTransactionThread,
        shouldDeleteIOUReport,
        updatedReportAction,
        updatedIOUReport,
        updatedReportPreviewAction,
        transactionThreadID,
        transactionThread,
        chatReport,
        transaction,
        transactionViolations,
        iouReport,
        reportPreviewAction,
    } = prepareToCleanUpMoneyRequest(transactionID, reportAction, false, transactionIDsPendingDeletion);

    const urlToNavigateBack = getNavigationUrlOnMoneyRequestDelete(transactionID, reportAction, isSingleTransactionView);

    // STEP 2: Build Onyx data
    // The logic mostly resembles the cleanUpMoneyRequest function
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {...transaction, pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE},
        },
    ];

    optimisticData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
        value: null,
    });

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {...transaction, pendingAction: null},
        },
    ];

    removeTransactionFromDuplicateTransactionViolation({optimisticData, failureData}, transactionID, transactions, violations);

    if (shouldDeleteTransactionThread) {
        optimisticData.push(
            // Use merge instead of set to avoid deleting the report too quickly, which could cause a brief "not found" page to appear.
            // The remaining parts of the report object will be removed after the API call is successful.
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                value: {
                    reportID: null,
                    stateNum: CONST.REPORT.STATE_NUM.APPROVED,
                    statusNum: CONST.REPORT.STATUS_NUM.CLOSED,
                    participants: {
                        [userAccountID]: {
                            notificationPreference: CONST.REPORT.NOTIFICATION_PREFERENCE.HIDDEN,
                        },
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadID}`,
                value: null,
            },
        );
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: updatedReportAction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: updatedIOUReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: getOutstandingChildRequest(updatedIOUReport),
        },
    );

    if (reportPreviewAction?.reportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {[reportPreviewAction.reportActionID]: updatedReportPreviewAction},
        });
    }

    if (!shouldDeleteIOUReport && updatedReportPreviewAction?.childMoneyRequestCount === 0) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: false,
            },
        });
    }

    if (shouldDeleteIOUReport) {
        let canUserPerformWriteAction = true;
        if (chatReport) {
            canUserPerformWriteAction = !!canUserPerformWriteActionReportUtils(chatReport);
        }

        const lastMessageText = getLastVisibleMessage(
            iouReport?.chatReportID,
            canUserPerformWriteAction,
            reportPreviewAction?.reportActionID ? {[reportPreviewAction.reportActionID]: null} : {},
        )?.lastMessageText;
        const lastVisibleActionCreated = getLastVisibleAction(
            iouReport?.chatReportID,
            canUserPerformWriteAction,
            reportPreviewAction?.reportActionID ? {[reportPreviewAction.reportActionID]: null} : {},
        )?.created;

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: false,
                iouReportID: null,
                lastMessageText,
                lastVisibleActionCreated,
            },
        });
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                pendingFields: {
                    preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
                },
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: shouldDeleteIOUReport
                    ? null
                    : {
                          pendingAction: null,
                      },
            },
        },
    ];

    if (reportPreviewAction?.reportActionID) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        });
    }

    // Ensure that any remaining data is removed upon successful completion, even if the server sends a report removal response.
    // This is done to prevent the removal update from lingering in the applyHTTPSOnyxUpdates function.
    if (shouldDeleteTransactionThread && transactionThread) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
            value: null,
        });
    }

    if (shouldDeleteIOUReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: null,
        });
    }

    successData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: null,
    });

    failureData.push({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
        value: transactionViolations ?? null,
    });

    if (shouldDeleteTransactionThread) {
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
            value: transactionThread,
        });
    }

    const errorKey = DateUtils.getMicroseconds();

    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    pendingAction: null,
                    errors: {
                        [errorKey]: Localize.translateLocal('iou.error.genericDeleteFailureMessage'),
                    },
                },
            },
        },
        shouldDeleteIOUReport
            ? {
                  onyxMethod: Onyx.METHOD.SET,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                  value: iouReport,
              }
            : {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
                  value: iouReport,
              },
    );

    if (reportPreviewAction?.reportActionID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    ...reportPreviewAction,
                    pendingAction: null,
                    errors: {
                        [errorKey]: Localize.translateLocal('iou.error.genericDeleteFailureMessage'),
                    },
                },
            },
        });
    }

    if (chatReport && shouldDeleteIOUReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: chatReport,
        });
    }

    if (!shouldDeleteIOUReport && updatedReportPreviewAction?.childMoneyRequestCount === 0) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport?.reportID}`,
            value: {
                hasOutstandingChildRequest: true,
            },
        });
    }

    const parameters: DeleteMoneyRequestParams = {
        transactionID,
        reportActionID: reportAction.reportActionID,
    };

    // STEP 3: Make the API request
    API.write(WRITE_COMMANDS.DELETE_MONEY_REQUEST, parameters, {optimisticData, successData, failureData});
    clearPdfByOnyxKey(transactionID);

    return urlToNavigateBack;
}

function deleteTrackExpense(
    chatReportID: string | undefined,
    transactionID: string | undefined,
    reportAction: OnyxTypes.ReportAction,
    transactions: OnyxCollection<OnyxTypes.Transaction>,
    violations: OnyxCollection<OnyxTypes.TransactionViolations>,
    isSingleTransactionView = false,
) {
    if (!chatReportID || !transactionID) {
        return;
    }

    const urlToNavigateBack = getNavigationUrlAfterTrackExpenseDelete(chatReportID, transactionID, reportAction, isSingleTransactionView);

    // STEP 1: Get all collections we're updating
    const chatReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${chatReportID}`] ?? null;
    if (!isSelfDM(chatReport)) {
        deleteMoneyRequest(transactionID, reportAction, transactions, violations, isSingleTransactionView);
        return urlToNavigateBack;
    }

    const whisperAction = getTrackExpenseActionableWhisper(transactionID, chatReportID);
    const actionableWhisperReportActionID = whisperAction?.reportActionID;
    const {parameters, optimisticData, successData, failureData} = getDeleteTrackExpenseInformation(
        chatReportID,
        transactionID,
        reportAction,
        undefined,
        undefined,
        actionableWhisperReportActionID,
        CONST.REPORT.ACTIONABLE_TRACK_EXPENSE_WHISPER_RESOLUTION.NOTHING,
        false,
    );

    // STEP 6: Make the API request
    API.write(WRITE_COMMANDS.DELETE_MONEY_REQUEST, parameters, {optimisticData, successData, failureData});
    clearPdfByOnyxKey(transactionID);

    // STEP 7: Navigate the user depending on which page they are on and which resources were deleted
    return urlToNavigateBack;
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function getSendMoneyParams(
    report: OnyxEntry<OnyxTypes.Report>,
    amount: number,
    currency: string,
    commentParam: string,
    paymentMethodType: PaymentMethodType,
    managerID: number,
    recipient: Participant,
): SendMoneyParamsData {
    const recipientEmail = addSMSDomainIfPhoneNumber(recipient.login ?? '');
    const recipientAccountID = Number(recipient.accountID);
    const comment = getParsedComment(commentParam);
    const newIOUReportDetails = JSON.stringify({
        amount,
        currency,
        requestorEmail: recipientEmail,
        requestorAccountID: recipientAccountID,
        comment,
        idempotencyKey: Str.guid(),
    });

    let chatReport = !isEmptyObject(report) && report?.reportID ? report : getChatByParticipants([recipientAccountID, managerID]);
    let isNewChat = false;
    if (!chatReport) {
        chatReport = buildOptimisticChatReport({
            participantList: [recipientAccountID, managerID],
        });
        isNewChat = true;
    }
    const optimisticIOUReport = buildOptimisticIOUReport(recipientAccountID, managerID, amount, chatReport.reportID, currency, true);

    const optimisticTransaction = buildOptimisticTransaction({
        transactionParams: {
            amount,
            currency,
            reportID: optimisticIOUReport.reportID,
            comment,
        },
    });
    const optimisticTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
        value: optimisticTransaction,
    };

    const [optimisticCreatedActionForChat, optimisticCreatedActionForIOUReport, optimisticIOUReportAction, optimisticTransactionThread, optimisticCreatedActionForTransactionThread] =
        buildOptimisticMoneyRequestEntities({
            iouReport: optimisticIOUReport,
            type: CONST.IOU.REPORT_ACTION_TYPE.PAY,
            amount,
            currency,
            comment,
            payeeEmail: recipientEmail,
            participants: [recipient],
            transactionID: optimisticTransaction.transactionID,
            paymentType: paymentMethodType,
            isSendMoneyFlow: true,
        });

    const reportPreviewAction = buildOptimisticReportPreview(chatReport, optimisticIOUReport);

    // Change the method to set for new reports because it doesn't exist yet, is faster,
    // and we need the data to be available when we navigate to the chat page
    const optimisticChatReportData: OnyxUpdate = isNewChat
        ? {
              onyxMethod: Onyx.METHOD.SET,
              key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
              value: {
                  ...chatReport,
                  // Set and clear pending fields on the chat report
                  pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD},
                  lastReadTime: DateUtils.getDBTime(),
                  lastVisibleActionCreated: reportPreviewAction.created,
              },
          }
        : {
              onyxMethod: Onyx.METHOD.MERGE,
              key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
              value: {
                  ...chatReport,
                  lastReadTime: DateUtils.getDBTime(),
                  lastVisibleActionCreated: reportPreviewAction.created,
              },
          };
    const optimisticQuickActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
        value: {
            action: CONST.QUICK_ACTIONS.SEND_MONEY,
            chatReportID: chatReport.reportID,
            isFirstQuickAction: isEmptyObject(quickAction),
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticIOUReport.reportID}`,
        value: {
            ...optimisticIOUReport,
            lastMessageText: getReportActionText(optimisticIOUReportAction),
            lastMessageHtml: getReportActionHtml(optimisticIOUReportAction),
        },
    };
    const optimisticTransactionThreadData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticTransactionThread.reportID}`,
        value: optimisticTransactionThread,
    };
    const optimisticIOUReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
        value: {
            [optimisticCreatedActionForIOUReport.reportActionID]: optimisticCreatedActionForIOUReport,
            [optimisticIOUReportAction.reportActionID]: {
                ...(optimisticIOUReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticChatReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
        value: {
            [reportPreviewAction.reportActionID]: reportPreviewAction,
        },
    };
    const optimisticTransactionThreadReportActionsData: OnyxUpdate | undefined = optimisticCreatedActionForTransactionThread
        ? {
              onyxMethod: Onyx.METHOD.MERGE,
              key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticTransactionThread.reportID}`,
              value: {[optimisticCreatedActionForTransactionThread?.reportActionID]: optimisticCreatedActionForTransactionThread},
          }
        : undefined;

    const optimisticMetaData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chatReport.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${optimisticTransactionThread.reportID}`,
            value: {
                isOptimisticReport: true,
            },
        },
    ];

    const successData: OnyxUpdate[] = [];

    // Add optimistic personal details for recipient
    let optimisticPersonalDetailListData: OnyxUpdate | null = null;
    const optimisticPersonalDetailListAction = isNewChat
        ? {
              [recipientAccountID]: {
                  accountID: recipientAccountID,
                  // Disabling this line since participant.displayName can be an empty string
                  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                  displayName: recipient.displayName || recipient.login,
                  login: recipient.login,
              },
          }
        : {};

    const redundantParticipants: Record<number, null> = {};
    if (!isEmptyObject(optimisticPersonalDetailListAction)) {
        const successPersonalDetailListAction: Record<number, null> = {};

        // BE will send different participants. We clear the optimistic ones to avoid duplicated entries
        Object.keys(optimisticPersonalDetailListAction).forEach((accountIDKey) => {
            const accountID = Number(accountIDKey);
            successPersonalDetailListAction[accountID] = null;
            redundantParticipants[accountID] = null;
        });

        optimisticPersonalDetailListData = {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: optimisticPersonalDetailListAction,
        };
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: successPersonalDetailListAction,
        });
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticIOUReport.reportID}`,
            value: {
                participants: redundantParticipants,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticTransactionThread.reportID}`,
            value: {
                participants: redundantParticipants,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${optimisticTransactionThread.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_METADATA}${chatReport.reportID}`,
            value: {
                isOptimisticReport: false,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                    childLastActorAccountID: reportPreviewAction.childLastActorAccountID,
                },
            },
        },
    );

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticTransactionThread.reportID}`,
            value: {
                errorFields: {
                    createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: ONYXKEYS.NVP_QUICK_ACTION_GLOBAL_CREATE,
            value: quickAction ?? null,
        },
    ];

    if (optimisticCreatedActionForTransactionThread?.reportActionID) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticTransactionThread.reportID}`,
            value: {[optimisticCreatedActionForTransactionThread?.reportActionID]: {pendingAction: null}},
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticTransactionThread.reportID}`,
            value: {[optimisticCreatedActionForTransactionThread?.reportActionID]: {errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage')}},
        });
    }

    // Now, let's add the data we need just when we are creating a new chat report
    if (isNewChat) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {pendingFields: null, participants: redundantParticipants},
        });
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: getMicroSecondOnyxErrorWithTranslationKey('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
                value: {
                    [optimisticIOUReportAction.reportActionID]: {
                        errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericCreateFailureMessage'),
                    },
                },
            },
        );

        const optimisticChatReportActionsValue = optimisticChatReportActionsData.value as Record<string, OnyxTypes.ReportAction>;

        if (optimisticChatReportActionsValue) {
            // Add an optimistic created action to the optimistic chat reportActions data
            optimisticChatReportActionsValue[optimisticCreatedActionForChat.reportActionID] = optimisticCreatedActionForChat;
        }
    } else {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        });
    }

    const optimisticData: OnyxUpdate[] = [
        optimisticChatReportData,
        optimisticQuickActionData,
        optimisticIOUReportData,
        optimisticChatReportActionsData,
        optimisticIOUReportActionsData,
        optimisticTransactionData,
        optimisticTransactionThreadData,
        ...optimisticMetaData,
    ];

    if (optimisticTransactionThreadReportActionsData) {
        optimisticData.push(optimisticTransactionThreadReportActionsData);
    }
    if (!isEmptyObject(optimisticPersonalDetailListData)) {
        optimisticData.push(optimisticPersonalDetailListData);
    }

    return {
        params: {
            iouReportID: optimisticIOUReport.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
            transactionID: optimisticTransaction.transactionID,
            newIOUReportDetails,
            createdReportActionID: isNewChat ? optimisticCreatedActionForChat.reportActionID : undefined,
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
            createdIOUReportActionID: optimisticCreatedActionForIOUReport.reportActionID,
            transactionThreadReportID: optimisticTransactionThread.reportID,
            createdReportActionIDForThread: optimisticCreatedActionForTransactionThread?.reportActionID,
        },
        optimisticData,
        successData,
        failureData,
    };
}

type OptimisticHoldReportExpenseActionID = {
    optimisticReportActionID: string;
    oldReportActionID: string;
};

function getHoldReportActionsAndTransactions(reportID: string | undefined) {
    const iouReportActions = getAllReportActions(reportID);
    const holdReportActions: Array<OnyxTypes.ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU>> = [];
    const holdTransactions: OnyxTypes.Transaction[] = [];

    Object.values(iouReportActions).forEach((action) => {
        const transactionID = isMoneyRequestAction(action) ? getOriginalMessage(action)?.IOUTransactionID : undefined;
        const transaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];

        if (transaction?.comment?.hold) {
            holdReportActions.push(action as OnyxTypes.ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU>);
            holdTransactions.push(transaction);
        }
    });

    return {holdReportActions, holdTransactions};
}

function getReportFromHoldRequestsOnyxData(
    chatReport: OnyxTypes.Report,
    iouReport: OnyxEntry<OnyxTypes.Report>,
    recipient: Participant,
): {
    optimisticHoldReportID: string;
    optimisticHoldActionID: string;
    optimisticHoldReportExpenseActionIDs: OptimisticHoldReportExpenseActionID[];
    optimisticData: OnyxUpdate[];
    successData: OnyxUpdate[];
    failureData: OnyxUpdate[];
} {
    const {holdReportActions, holdTransactions} = getHoldReportActionsAndTransactions(iouReport?.reportID);
    const firstHoldTransaction = holdTransactions.at(0);
    const newParentReportActionID = NumberUtils.rand64();

    const coefficient = isExpenseReport(iouReport) ? -1 : 1;
    const isPolicyExpenseChat = isPolicyExpenseChatReportUtil(chatReport);
    const holdAmount = ((iouReport?.total ?? 0) - (iouReport?.unheldTotal ?? 0)) * coefficient;
    const holdNonReimbursableAmount = ((iouReport?.nonReimbursableTotal ?? 0) - (iouReport?.unheldNonReimbursableTotal ?? 0)) * coefficient;
    const optimisticExpenseReport = isPolicyExpenseChat
        ? buildOptimisticExpenseReport(
              chatReport.reportID,
              chatReport.policyID ?? iouReport?.policyID,
              recipient.accountID ?? 1,
              holdAmount,
              iouReport?.currency ?? '',
              holdNonReimbursableAmount,
              newParentReportActionID,
          )
        : buildOptimisticIOUReport(
              iouReport?.ownerAccountID ?? CONST.DEFAULT_NUMBER_ID,
              iouReport?.managerID ?? CONST.DEFAULT_NUMBER_ID,
              holdAmount,
              chatReport.reportID,
              iouReport?.currency ?? '',
              false,
              newParentReportActionID,
          );

    const optimisticExpenseReportPreview = buildOptimisticReportPreview(
        chatReport,
        optimisticExpenseReport,
        '',
        firstHoldTransaction,
        optimisticExpenseReport.reportID,
        newParentReportActionID,
    );

    const updateHeldReports: Record<string, Pick<OnyxTypes.Report, 'parentReportActionID' | 'parentReportID' | 'chatReportID'>> = {};
    const addHoldReportActions: OnyxTypes.ReportActions = {};
    const addHoldReportActionsSuccess: OnyxCollection<NullishDeep<ReportAction>> = {};
    const deleteHoldReportActions: Record<string, Pick<OnyxTypes.ReportAction, 'message'>> = {};
    const optimisticHoldReportExpenseActionIDs: OptimisticHoldReportExpenseActionID[] = [];

    holdReportActions.forEach((holdReportAction) => {
        const originalMessage = getOriginalMessage(holdReportAction);

        deleteHoldReportActions[holdReportAction.reportActionID] = {
            message: [
                {
                    deleted: DateUtils.getDBTime(),
                    type: CONST.REPORT.MESSAGE.TYPE.TEXT,
                    text: '',
                },
            ],
        };

        const reportActionID = NumberUtils.rand64();
        addHoldReportActions[reportActionID] = {
            ...holdReportAction,
            reportActionID,
            originalMessage: {
                ...originalMessage,
                IOUReportID: optimisticExpenseReport.reportID,
            },
            pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
        addHoldReportActionsSuccess[reportActionID] = {
            pendingAction: null,
        };

        const heldReport = getReportOrDraftReport(holdReportAction.childReportID);
        if (heldReport) {
            optimisticHoldReportExpenseActionIDs.push({optimisticReportActionID: reportActionID, oldReportActionID: holdReportAction.reportActionID});

            updateHeldReports[`${ONYXKEYS.COLLECTION.REPORT}${heldReport.reportID}`] = {
                parentReportActionID: reportActionID,
                parentReportID: optimisticExpenseReport.reportID,
                chatReportID: optimisticExpenseReport.reportID,
            };
        }
    });

    const updateHeldTransactions: Record<string, Pick<OnyxTypes.Transaction, 'reportID'>> = {};
    holdTransactions.forEach((transaction) => {
        updateHeldTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`] = {
            reportID: optimisticExpenseReport.reportID,
        };
    });

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                iouReportID: optimisticExpenseReport.reportID,
                lastVisibleActionCreated: optimisticExpenseReportPreview.created,
            },
        },
        // add new optimistic expense report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticExpenseReport.reportID}`,
            value: {
                ...optimisticExpenseReport,
                unheldTotal: 0,
                unheldNonReimbursableTotal: 0,
            },
        },
        // add preview report action to main chat
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticExpenseReportPreview.reportActionID]: optimisticExpenseReportPreview,
            },
        },
        // remove hold report actions from old iou report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: deleteHoldReportActions,
        },
        // add hold report actions to new iou report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticExpenseReport.reportID}`,
            value: addHoldReportActions,
        },
        // update held reports with new parentReportActionID
        {
            onyxMethod: Onyx.METHOD.MERGE_COLLECTION,
            key: `${ONYXKEYS.COLLECTION.REPORT}`,
            value: updateHeldReports,
        },
        // update transactions with new iouReportID
        {
            onyxMethod: Onyx.METHOD.MERGE_COLLECTION,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}`,
            value: updateHeldTransactions,
        },
    ];

    const bringReportActionsBack: Record<string, OnyxTypes.ReportAction> = {};
    holdReportActions.forEach((reportAction) => {
        bringReportActionsBack[reportAction.reportActionID] = reportAction;
    });

    const bringHeldTransactionsBack: Record<string, OnyxTypes.Transaction> = {};
    holdTransactions.forEach((transaction) => {
        bringHeldTransactionsBack[`${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`] = transaction;
    });

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticExpenseReportPreview.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticExpenseReport.reportID}`,
            value: addHoldReportActionsSuccess,
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                iouReportID: chatReport.iouReportID,
                lastVisibleActionCreated: chatReport.lastVisibleActionCreated,
            },
        },
        // remove added optimistic expense report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticExpenseReport.reportID}`,
            value: null,
        },
        // remove preview report action from the main chat
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticExpenseReportPreview.reportActionID]: null,
            },
        },
        // add hold report actions back to old iou report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: bringReportActionsBack,
        },
        // remove hold report actions from the new iou report
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticExpenseReport.reportID}`,
            value: null,
        },
        // add hold transactions back to old iou report
        {
            onyxMethod: Onyx.METHOD.MERGE_COLLECTION,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}`,
            value: bringHeldTransactionsBack,
        },
    ];

    return {
        optimisticData,
        optimisticHoldActionID: optimisticExpenseReportPreview.reportActionID,
        failureData,
        successData,
        optimisticHoldReportID: optimisticExpenseReport.reportID,
        optimisticHoldReportExpenseActionIDs,
    };
}

function hasOutstandingChildRequest(chatReport: OnyxTypes.Report, excludedIOUReport: OnyxEntry<OnyxTypes.Report>, policyId?: string) {
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const policy = getPolicy(policyId);
    if (!policy?.achAccount?.bankAccountID) {
        return false;
    }
    const reportActions = getAllReportActions(chatReport.reportID);
    return !!Object.values(reportActions).find((action) => {
        const iouReportID = getIOUReportIDFromReportActionPreview(action);
        if (iouReportID === excludedIOUReport?.reportID) {
            return false;
        }
        const iouReport = getReportOrDraftReport(iouReportID);
        const transactions = getReportTransactions(iouReportID);
        return canIOUBePaid(iouReport, chatReport, policy, transactions) || canIOUBePaid(iouReport, chatReport, policy, transactions, true);
    });
}

function getPayMoneyRequestParams(
    initialChatReport: OnyxTypes.Report,
    iouReport: OnyxEntry<OnyxTypes.Report>,
    recipient: Participant,
    paymentMethodType: PaymentMethodType,
    full: boolean,
    payAsBusiness?: boolean,
    bankAccountID?: number,
    paymentPolicyID?: string | undefined,
    lastUsedPaymentMethod?: OnyxTypes.LastPaymentMethodType,
): PayMoneyRequestData {
    const isInvoiceReport = isInvoiceReportReportUtils(iouReport);
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const activePolicy = getPolicy(activePolicyID);
    let payerPolicyID = activePolicyID;
    let chatReport = initialChatReport;
    let policyParams = {};
    const optimisticData: OnyxUpdate[] = [];
    const successData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];
    const shouldCreatePolicy = !activePolicy || !isPolicyAdmin(activePolicy) || !isPaidGroupPolicy(activePolicy);

    if (isIndividualInvoiceRoom(chatReport) && payAsBusiness && shouldCreatePolicy) {
        payerPolicyID = generatePolicyID();
        const {
            optimisticData: policyOptimisticData,
            failureData: policyFailureData,
            successData: policySuccessData,
            params,
        } = buildPolicyData({
            policyOwnerEmail: currentUserEmail,
            makeMeAdmin: true,
            policyID: payerPolicyID,
        });
        const {adminsChatReportID, adminsCreatedReportActionID, expenseChatReportID, expenseCreatedReportActionID, customUnitRateID, customUnitID, ownerEmail, policyName} = params;

        policyParams = {
            policyID: payerPolicyID,
            adminsChatReportID,
            adminsCreatedReportActionID,
            expenseChatReportID,
            expenseCreatedReportActionID,
            customUnitRateID,
            customUnitID,
            ownerEmail,
            policyName,
        };

        optimisticData.push(...policyOptimisticData, {onyxMethod: Onyx.METHOD.MERGE, key: ONYXKEYS.NVP_ACTIVE_POLICY_ID, value: payerPolicyID});
        successData.push(...policySuccessData);
        failureData.push(...policyFailureData, {onyxMethod: Onyx.METHOD.MERGE, key: ONYXKEYS.NVP_ACTIVE_POLICY_ID, value: activePolicyID ?? null});
    }

    if (isIndividualInvoiceRoom(chatReport) && payAsBusiness && activePolicyID) {
        const existingB2BInvoiceRoom = getInvoiceChatByParticipants(activePolicyID, CONST.REPORT.INVOICE_RECEIVER_TYPE.BUSINESS, chatReport.policyID);
        if (existingB2BInvoiceRoom) {
            chatReport = existingB2BInvoiceRoom;
        }
    }

    let total = (iouReport?.total ?? 0) - (iouReport?.nonReimbursableTotal ?? 0);
    if (hasHeldExpensesReportUtils(iouReport?.reportID) && !full && !!iouReport?.unheldTotal) {
        total = iouReport.unheldTotal - (iouReport?.unheldNonReimbursableTotal ?? 0);
    }

    const optimisticIOUReportAction = buildOptimisticIOUReportAction({
        type: CONST.IOU.REPORT_ACTION_TYPE.PAY,
        amount: isExpenseReport(iouReport) ? -total : total,
        currency: iouReport?.currency ?? '',
        comment: '',
        participants: [recipient],
        transactionID: '',
        paymentType: paymentMethodType,
        iouReportID: iouReport?.reportID,
        isSettlingUp: true,
        payAsBusiness,
        bankAccountID,
    });

    // In some instances, the report preview action might not be available to the payer (only whispered to the requestor)
    // hence we need to make the updates to the action safely.
    let optimisticReportPreviewAction = null;
    const reportPreviewAction = getReportPreviewAction(chatReport.reportID, iouReport?.reportID);
    if (reportPreviewAction) {
        optimisticReportPreviewAction = updateReportPreview(iouReport, reportPreviewAction, true);
    }
    let currentNextStep = null;
    let optimisticNextStep = null;
    if (!isInvoiceReport) {
        currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`] ?? null;
        optimisticNextStep = buildNextStep(iouReport, CONST.REPORT.STATUS_NUM.REIMBURSED);
    }

    const optimisticChatReport = {
        ...chatReport,
        lastReadTime: DateUtils.getDBTime(),
        hasOutstandingChildRequest: hasOutstandingChildRequest(chatReport, iouReport, iouReport?.policyID),
        iouReportID: null,
        lastMessageText: getReportActionText(optimisticIOUReportAction),
        lastMessageHtml: getReportActionHtml(optimisticIOUReportAction),
    };
    if (isIndividualInvoiceRoom(chatReport) && payAsBusiness && payerPolicyID) {
        optimisticChatReport.invoiceReceiver = {
            type: CONST.REPORT.INVOICE_RECEIVER_TYPE.BUSINESS,
            policyID: payerPolicyID,
        };
    }

    optimisticData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: optimisticChatReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    ...(optimisticIOUReportAction as OnyxTypes.ReportAction),
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                lastMessageText: getReportActionText(optimisticIOUReportAction),
                lastMessageHtml: getReportActionHtml(optimisticIOUReportAction),
                lastVisibleActionCreated: optimisticIOUReportAction.created,
                hasOutstandingChildRequest: false,
                statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED,
                stateNum: CONST.REPORT.STATE_NUM.APPROVED,
                pendingFields: {
                    preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                    reimbursed: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                    partial: full ? null : CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                },
                errors: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`,
            value: optimisticNextStep,
        },
    );

    if (iouReport?.policyID) {
        const prevLastUsedPaymentMethod = lastUsedPaymentMethod?.lastUsed?.name;
        const usedPaymentOption = paymentPolicyID ?? paymentMethodType;

        const optimisticLastPaymentMethod = {
            [iouReport.policyID]: {
                ...(iouReport.type ? {[iouReport.type]: {name: usedPaymentOption}} : {}),
                ...(isInvoiceReport ? {invoice: {name: paymentMethodType, bankAccountID}} : {}),
                lastUsed: {
                    name: prevLastUsedPaymentMethod !== usedPaymentOption && !!prevLastUsedPaymentMethod ? prevLastUsedPaymentMethod : usedPaymentOption,
                },
            },
        };

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.NVP_LAST_PAYMENT_METHOD,
            value: optimisticLastPaymentMethod,
        });
    }

    successData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                pendingFields: {
                    preview: null,
                    reimbursed: null,
                    partial: null,
                },
                errors: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    );

    failureData.push(
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport?.reportID}`,
            value: {
                ...iouReport,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: chatReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport?.reportID}`,
            value: currentNextStep,
        },
    );

    // In case the report preview action is loaded locally, let's update it.
    if (optimisticReportPreviewAction) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: optimisticReportPreviewAction,
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: {
                    created: optimisticReportPreviewAction.created,
                },
            },
        });
    }

    // Optimistically unhold all transactions if we pay all requests
    if (full) {
        const reportTransactions = getReportTransactions(iouReport?.reportID);
        for (const transaction of reportTransactions) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
                value: {
                    comment: {
                        hold: null,
                    },
                },
            });
            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
                value: {
                    comment: {
                        hold: transaction.comment?.hold,
                    },
                },
            });
        }

        const optimisticTransactionViolations: OnyxUpdate[] = reportTransactions.map(({transactionID}) => {
            return {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
                value: null,
            };
        });
        optimisticData.push(...optimisticTransactionViolations);

        const failureTransactionViolations: OnyxUpdate[] = reportTransactions.map(({transactionID}) => {
            const violations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`] ?? [];
            return {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
                value: violations,
            };
        });
        failureData.push(...failureTransactionViolations);
    }

    let optimisticHoldReportID;
    let optimisticHoldActionID;
    let optimisticHoldReportExpenseActionIDs;
    if (!full) {
        const holdReportOnyxData = getReportFromHoldRequestsOnyxData(chatReport, iouReport, recipient);

        optimisticData.push(...holdReportOnyxData.optimisticData);
        successData.push(...holdReportOnyxData.successData);
        failureData.push(...holdReportOnyxData.failureData);
        optimisticHoldReportID = holdReportOnyxData.optimisticHoldReportID;
        optimisticHoldActionID = holdReportOnyxData.optimisticHoldActionID;
        optimisticHoldReportExpenseActionIDs = JSON.stringify(holdReportOnyxData.optimisticHoldReportExpenseActionIDs);
    }

    return {
        params: {
            iouReportID: iouReport?.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
            full,
            amount: Math.abs(total),
            optimisticHoldReportID,
            optimisticHoldActionID,
            optimisticHoldReportExpenseActionIDs,
            ...policyParams,
        },
        optimisticData,
        successData,
        failureData,
    };
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function sendMoneyElsewhere(report: OnyxEntry<OnyxTypes.Report>, amount: number, currency: string, comment: string, managerID: number, recipient: Participant) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.ELSEWHERE, managerID, recipient);
    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.SEND_MONEY_ELSEWHERE, params, {optimisticData, successData, failureData});

    dismissModalAndOpenReportInInboxTab(params.chatReportID);
    notifyNewAction(params.chatReportID, managerID);
}

/**
 * @param managerID - Account ID of the person sending the money
 * @param recipient - The user receiving the money
 */
function sendMoneyWithWallet(report: OnyxEntry<OnyxTypes.Report>, amount: number, currency: string, comment: string, managerID: number, recipient: Participant | OptionData) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.EXPENSIFY, managerID, recipient);
    playSound(SOUNDS.DONE);
    API.write(WRITE_COMMANDS.SEND_MONEY_WITH_WALLET, params, {optimisticData, successData, failureData});

    dismissModalAndOpenReportInInboxTab(params.chatReportID);
    notifyNewAction(params.chatReportID, managerID);
}

function canApproveIOU(
    iouReport: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report> | SearchReport,
    policy: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Policy> | SearchPolicy,
    iouTransactions?: OnyxTypes.Transaction[],
) {
    // Only expense reports can be approved
    if (!isExpenseReport(iouReport) || !(policy && isPaidGroupPolicy(policy))) {
        return false;
    }

    const isOnSubmitAndClosePolicy = isSubmitAndClose(policy);
    if (isOnSubmitAndClosePolicy) {
        return false;
    }

    const managerID = iouReport?.managerID ?? CONST.DEFAULT_NUMBER_ID;
    const isCurrentUserManager = managerID === userAccountID;
    const isOpenExpenseReport = isOpenExpenseReportReportUtils(iouReport);
    const isApproved = isReportApproved({report: iouReport});
    const iouSettled = isSettled(iouReport);
    const reportNameValuePairs = allReportNameValuePairs?.[`${ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS}${iouReport?.reportID}`];
    const isArchivedExpenseReport = isArchivedReport(reportNameValuePairs);
    const reportTransactions = iouTransactions ?? getReportTransactions(iouReport?.reportID);
    const hasOnlyPendingCardOrScanningTransactions = reportTransactions.length > 0 && reportTransactions.every(isPendingCardOrScanningTransaction);
    if (hasOnlyPendingCardOrScanningTransactions) {
        return false;
    }
    const isPayAtEndExpenseReport = isPayAtEndExpenseReportReportUtils(iouReport ?? undefined, reportTransactions);
    const isClosedReport = isClosedReportUtil(iouReport);
    return (
        reportTransactions.length > 0 && isCurrentUserManager && !isOpenExpenseReport && !isApproved && !iouSettled && !isArchivedExpenseReport && !isPayAtEndExpenseReport && !isClosedReport
    );
}

function canUnapproveIOU(iouReport: OnyxEntry<OnyxTypes.Report>, policy: OnyxEntry<OnyxTypes.Policy>) {
    return (
        isExpenseReport(iouReport) &&
        (isReportManager(iouReport) || isPolicyAdmin(policy)) &&
        isReportApproved({report: iouReport}) &&
        !isSubmitAndClose(policy) &&
        !iouReport?.isWaitingOnBankAccount
    );
}

function canIOUBePaid(
    iouReport: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report> | SearchReport,
    chatReport: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Report> | SearchReport,
    policy: OnyxTypes.OnyxInputOrEntry<OnyxTypes.Policy> | SearchPolicy,
    transactions?: OnyxTypes.Transaction[] | SearchTransaction[],
    onlyShowPayElsewhere = false,
    chatReportRNVP?: OnyxTypes.ReportNameValuePairs,
    invoiceReceiverPolicy?: SearchPolicy,
    shouldCheckApprovedState = true,
) {
    const reportNameValuePairs = chatReportRNVP ?? allReportNameValuePairs?.[`${ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS}${chatReport?.reportID}`];
    const isChatReportArchived = isArchivedReport(reportNameValuePairs);
    const iouSettled = isSettled(iouReport);

    if (isEmptyObject(iouReport)) {
        return false;
    }

    if (policy?.reimbursementChoice === CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_NO) {
        if (!onlyShowPayElsewhere) {
            return false;
        }
        if (iouReport?.statusNum !== CONST.REPORT.STATUS_NUM.SUBMITTED) {
            return false;
        }
    }

    if (isInvoiceReportReportUtils(iouReport)) {
        if (isChatReportArchived || iouSettled || isOpenInvoiceReportReportUtils(iouReport)) {
            return false;
        }
        if (chatReport?.invoiceReceiver?.type === CONST.REPORT.INVOICE_RECEIVER_TYPE.INDIVIDUAL) {
            return chatReport?.invoiceReceiver?.accountID === userAccountID;
        }
        // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
        // eslint-disable-next-line deprecation/deprecation
        return (invoiceReceiverPolicy ?? getPolicy(chatReport?.invoiceReceiver?.policyID))?.role === CONST.POLICY.ROLE.ADMIN;
    }

    const isPayer = isPayerReportUtils(
        {
            email: currentUserEmail,
            accountID: userAccountID,
        },
        iouReport,
        onlyShowPayElsewhere,
        policy,
    );

    const isOpenExpenseReport = isOpenExpenseReportReportUtils(iouReport);

    const {reimbursableSpend} = getMoneyRequestSpendBreakdown(iouReport);
    const isAutoReimbursable = policy?.reimbursementChoice === CONST.POLICY.REIMBURSEMENT_CHOICES.REIMBURSEMENT_YES ? false : canBeAutoReimbursed(iouReport, policy);
    const shouldBeApproved = canApproveIOU(iouReport, policy, transactions);
    const isPayAtEndExpenseReport = isPayAtEndExpenseReportReportUtils(iouReport ?? undefined, transactions);
    return (
        isPayer &&
        !isOpenExpenseReport &&
        !iouSettled &&
        !iouReport?.isWaitingOnBankAccount &&
        reimbursableSpend > 0 &&
        !isChatReportArchived &&
        !isAutoReimbursable &&
        (!shouldBeApproved || !shouldCheckApprovedState) &&
        !isPayAtEndExpenseReport
    );
}

function canCancelPayment(iouReport: OnyxEntry<OnyxTypes.Report>, session: OnyxEntry<OnyxTypes.Session>) {
    return isPayerReportUtils(session, iouReport) && (isSettled(iouReport) || iouReport?.isWaitingOnBankAccount) && isExpenseReport(iouReport);
}

function canSubmitReport(
    report: OnyxEntry<OnyxTypes.Report> | SearchReport,
    policy: OnyxEntry<OnyxTypes.Policy> | SearchPolicy,
    transactions: OnyxTypes.Transaction[] | SearchTransaction[],
    allViolations: OnyxCollection<OnyxTypes.TransactionViolations> | undefined,
    isReportArchived: boolean,
) {
    const currentUserAccountID = getCurrentUserAccountID();
    const isOpenExpenseReport = isOpenExpenseReportReportUtils(report);
    const isAdmin = policy?.role === CONST.POLICY.ROLE.ADMIN;
    const hasAllPendingRTERViolations = allHavePendingRTERViolation(transactions, allViolations);
    const isManualSubmitEnabled = getCorrectedAutoReportingFrequency(policy) === CONST.POLICY.AUTO_REPORTING_FREQUENCIES.MANUAL;
    const hasTransactionWithoutRTERViolation = hasAnyTransactionWithoutRTERViolation(transactions, allViolations);
    const hasOnlyPendingCardOrScanFailTransactions = transactions.length > 0 && transactions.every((t) => isPendingCardOrScanningTransaction(t));

    const baseCanSubmit =
        isOpenExpenseReport &&
        (report?.ownerAccountID === currentUserAccountID || report?.managerID === currentUserAccountID || isAdmin) &&
        !hasOnlyPendingCardOrScanFailTransactions &&
        !hasAllPendingRTERViolations &&
        hasTransactionWithoutRTERViolation &&
        !isReportArchived &&
        transactions.length > 0;
    const reportActions = allReportActions?.[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report?.reportID}`] ?? [];
    const hasBeenReopened = hasReportBeenReopened(reportActions);
    if (baseCanSubmit && hasBeenReopened) {
        return true;
    }

    return baseCanSubmit && isManualSubmitEnabled;
}

function getIOUReportActionToApproveOrPay(chatReport: OnyxEntry<OnyxTypes.Report>, updatedIouReport: OnyxEntry<OnyxTypes.Report>): OnyxEntry<ReportAction> {
    const chatReportActions = allReportActions?.[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport?.reportID}`] ?? {};

    return Object.values(chatReportActions).find((action) => {
        if (!action) {
            return false;
        }
        const iouReport = updatedIouReport?.reportID === action.childReportID ? updatedIouReport : getReportOrDraftReport(action.childReportID);
        // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
        // eslint-disable-next-line deprecation/deprecation
        const policy = getPolicy(iouReport?.policyID);
        const shouldShowSettlementButton = canIOUBePaid(iouReport, chatReport, policy) || canApproveIOU(iouReport, policy);
        return action.actionName === CONST.REPORT.ACTIONS.TYPE.REPORT_PREVIEW && shouldShowSettlementButton && !isDeletedAction(action);
    });
}

function hasIOUToApproveOrPay(chatReport: OnyxEntry<OnyxTypes.Report>, updatedIouReport: OnyxEntry<OnyxTypes.Report>): boolean {
    return !!getIOUReportActionToApproveOrPay(chatReport, updatedIouReport);
}

function isLastApprover(approvalChain: string[]): boolean {
    if (approvalChain.length === 0) {
        return true;
    }
    return approvalChain.at(-1) === currentUserEmail;
}

function approveMoneyRequest(expenseReport: OnyxEntry<OnyxTypes.Report>, full?: boolean) {
    if (!expenseReport) {
        return;
    }

    if (expenseReport.policyID && shouldRestrictUserBillableActions(expenseReport.policyID)) {
        Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(expenseReport.policyID));
        return;
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;
    let total = expenseReport.total ?? 0;
    const hasHeldExpenses = hasHeldExpensesReportUtils(expenseReport.reportID);
    const hasDuplicates = hasDuplicateTransactions(expenseReport.reportID);
    if (hasHeldExpenses && !full && !!expenseReport.unheldTotal) {
        total = expenseReport.unheldTotal;
    }
    const optimisticApprovedReportAction = buildOptimisticApprovedReportAction(total, expenseReport.currency ?? '', expenseReport.reportID);

    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const approvalChain = getApprovalChain(getPolicy(expenseReport.policyID), expenseReport);

    const predictedNextStatus = isLastApprover(approvalChain) ? CONST.REPORT.STATUS_NUM.APPROVED : CONST.REPORT.STATUS_NUM.SUBMITTED;
    const predictedNextState = isLastApprover(approvalChain) ? CONST.REPORT.STATE_NUM.APPROVED : CONST.REPORT.STATE_NUM.SUBMITTED;
    const managerID = isLastApprover(approvalChain) ? expenseReport.managerID : getNextApproverAccountID(expenseReport);

    const optimisticNextStep = buildNextStep(expenseReport, predictedNextStatus);
    const chatReport = getReportOrDraftReport(expenseReport.chatReportID);

    const optimisticReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticApprovedReportAction.reportActionID]: {
                ...(optimisticApprovedReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const updatedExpenseReport = {
        ...expenseReport,
        lastMessageText: getReportActionText(optimisticApprovedReportAction),
        lastMessageHtml: getReportActionHtml(optimisticApprovedReportAction),
        stateNum: predictedNextState,
        statusNum: predictedNextStatus,
        managerID,
        pendingFields: {
            partial: full ? null : CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: updatedExpenseReport,
    };

    const optimisticChatReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.chatReportID}`,
        value: {
            hasOutstandingChildRequest: hasIOUToApproveOrPay(chatReport, updatedExpenseReport),
        },
    };

    const optimisticNextStepData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    };
    const optimisticData: OnyxUpdate[] = [optimisticIOUReportData, optimisticReportActionsData, optimisticNextStepData, optimisticChatReportData];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticApprovedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                pendingFields: {
                    partial: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticApprovedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.chatReportID}`,
            value: {
                hasOutstandingChildRequest: chatReport?.hasOutstandingChildRequest,
                pendingFields: {
                    partial: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        },
    ];

    // Clear hold reason of all transactions if we approve all requests
    if (full && hasHeldExpenses) {
        const heldTransactions = getAllHeldTransactionsReportUtils(expenseReport.reportID);
        heldTransactions.forEach((heldTransaction) => {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION}${heldTransaction.transactionID}`,
                value: {
                    comment: {
                        hold: '',
                    },
                },
            });
            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION}${heldTransaction.transactionID}`,
                value: {
                    comment: {
                        hold: heldTransaction.comment?.hold,
                    },
                },
            });
        });
    }

    let optimisticHoldReportID;
    let optimisticHoldActionID;
    let optimisticHoldReportExpenseActionIDs;
    if (!full && !!chatReport && !!expenseReport) {
        const holdReportOnyxData = getReportFromHoldRequestsOnyxData(chatReport, expenseReport, {accountID: expenseReport.ownerAccountID});

        optimisticData.push(...holdReportOnyxData.optimisticData);
        successData.push(...holdReportOnyxData.successData);
        failureData.push(...holdReportOnyxData.failureData);
        optimisticHoldReportID = holdReportOnyxData.optimisticHoldReportID;
        optimisticHoldActionID = holdReportOnyxData.optimisticHoldActionID;
        optimisticHoldReportExpenseActionIDs = JSON.stringify(holdReportOnyxData.optimisticHoldReportExpenseActionIDs);
    }

    // Remove duplicates violations if we approve the report
    if (hasDuplicates) {
        const transactions = getReportTransactions(expenseReport.reportID).filter((transaction) => isDuplicate(transaction, true));
        if (!full) {
            transactions.filter((transaction) => !isOnHold(transaction));
        }

        transactions.forEach((transaction) => {
            const transactionViolations = allTransactionViolations?.[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`] ?? [];
            const newTransactionViolations = transactionViolations.filter((violation) => violation.name !== CONST.VIOLATIONS.DUPLICATED_TRANSACTION);
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
                value: newTransactionViolations,
            });

            failureData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
                value: transactionViolations,
            });
        });
    }

    const parameters: ApproveMoneyRequestParams = {
        reportID: expenseReport.reportID,
        approvedReportActionID: optimisticApprovedReportAction.reportActionID,
        full,
        optimisticHoldReportID,
        optimisticHoldActionID,
        optimisticHoldReportExpenseActionIDs,
    };

    playSound(SOUNDS.SUCCESS);
    API.write(WRITE_COMMANDS.APPROVE_MONEY_REQUEST, parameters, {optimisticData, successData, failureData});
}

function reopenReport(expenseReport: OnyxEntry<OnyxTypes.Report>) {
    if (!expenseReport) {
        return;
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;
    const optimisticReopenedReportAction = buildOptimisticReopenedReportAction();
    const predictedNextState = CONST.REPORT.STATE_NUM.OPEN;
    const predictedNextStatus = CONST.REPORT.STATUS_NUM.OPEN;

    const optimisticNextStep = buildNextStep(expenseReport, predictedNextStatus, undefined, undefined, true);
    const optimisticReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticReopenedReportAction.reportActionID]: {
                ...(optimisticReopenedReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: {
            ...expenseReport,
            lastMessageText: getReportActionText(optimisticReopenedReportAction),
            lastMessageHtml: getReportActionHtml(optimisticReopenedReportAction),
            stateNum: predictedNextState,
            statusNum: predictedNextStatus,
            pendingFields: {
                partial: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
            },
        },
    };

    const optimisticNextStepData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    };

    const optimisticData: OnyxUpdate[] = [optimisticIOUReportData, optimisticReportActionsData, optimisticNextStepData];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReopenedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                pendingFields: {
                    partial: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReopenedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                stateNum: expenseReport.stateNum,
                statusNum: expenseReport.statusNum,
            },
        },
    ];

    if (expenseReport.parentReportID && expenseReport.parentReportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: predictedNextState,
                    childStatusNum: predictedNextStatus,
                },
            },
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: expenseReport.stateNum,
                    childStatusNum: expenseReport.statusNum,
                },
            },
        });
    }

    const parameters: ReopenReportParams = {
        reportID: expenseReport.reportID,
        reportActionID: optimisticReopenedReportAction.reportActionID,
    };

    API.write(WRITE_COMMANDS.REOPEN_REPORT, parameters, {optimisticData, successData, failureData});
}

function retractReport(expenseReport: OnyxEntry<OnyxTypes.Report>) {
    if (!expenseReport) {
        return;
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;
    const optimisticRetractReportAction = buildOptimisticRetractedReportAction();
    const predictedNextState = CONST.REPORT.STATE_NUM.OPEN;
    const predictedNextStatus = CONST.REPORT.STATUS_NUM.OPEN;

    const optimisticNextStep = buildNextStep(expenseReport, predictedNextStatus);
    const optimisticReportActionsData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticRetractReportAction.reportActionID]: {
                ...(optimisticRetractReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: {
            ...expenseReport,
            lastMessageText: getReportActionText(optimisticRetractReportAction),
            lastMessageHtml: getReportActionHtml(optimisticRetractReportAction),
            stateNum: predictedNextState,
            statusNum: predictedNextStatus,
            pendingFields: {
                partial: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
            },
        },
    };

    const optimisticNextStepData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    };

    const optimisticData: OnyxUpdate[] = [optimisticIOUReportData, optimisticReportActionsData, optimisticNextStepData];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticRetractReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                pendingFields: {
                    partial: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticRetractReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                stateNum: expenseReport.stateNum,
                statusNum: expenseReport.stateNum,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        },
    ];

    if (expenseReport.parentReportID && expenseReport.parentReportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: predictedNextState,
                    childStatusNum: predictedNextStatus,
                },
            },
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: expenseReport.stateNum,
                    childStatusNum: expenseReport.statusNum,
                },
            },
        });
    }

    const parameters: RetractReportParams = {
        reportID: expenseReport.reportID,
        reportActionID: optimisticRetractReportAction.reportActionID,
    };

    API.write(WRITE_COMMANDS.RETRACT_REPORT, parameters, {optimisticData, successData, failureData});
}

function unapproveExpenseReport(expenseReport: OnyxEntry<OnyxTypes.Report>) {
    if (isEmptyObject(expenseReport)) {
        return;
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;

    const optimisticUnapprovedReportAction = buildOptimisticUnapprovedReportAction(expenseReport.total ?? 0, expenseReport.currency ?? '', expenseReport.reportID);
    const optimisticNextStep = buildNextStep(expenseReport, CONST.REPORT.STATUS_NUM.SUBMITTED, false, true);

    const optimisticReportActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticUnapprovedReportAction.reportActionID]: {
                ...(optimisticUnapprovedReportAction as OnyxTypes.ReportAction),
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticIOUReportData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: {
            ...expenseReport,
            lastMessageText: getReportActionText(optimisticUnapprovedReportAction),
            lastMessageHtml: getReportActionHtml(optimisticUnapprovedReportAction),
            stateNum: CONST.REPORT.STATE_NUM.SUBMITTED,
            statusNum: CONST.REPORT.STATUS_NUM.SUBMITTED,
            pendingFields: {
                partial: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
            },
            isCancelledIOU: false,
        },
    };

    const optimisticNextStepData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    };

    const optimisticData: OnyxUpdate[] = [optimisticIOUReportData, optimisticReportActionData, optimisticNextStepData];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticUnapprovedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                pendingFields: {
                    partial: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticUnapprovedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                pendingFields: {
                    partial: null,
                },
                isCancelledIOU: true,
            },
        },
    ];

    if (expenseReport.parentReportID && expenseReport.parentReportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: CONST.REPORT.STATE_NUM.SUBMITTED,
                    childStatusNum: CONST.REPORT.STATUS_NUM.SUBMITTED,
                },
            },
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: expenseReport.stateNum,
                    childStatusNum: expenseReport.statusNum,
                },
            },
        });
    }

    const parameters: UnapproveExpenseReportParams = {
        reportID: expenseReport.reportID,
        reportActionID: optimisticUnapprovedReportAction.reportActionID,
    };

    API.write(WRITE_COMMANDS.UNAPPROVE_EXPENSE_REPORT, parameters, {optimisticData, successData, failureData});
}

function submitReport(expenseReport?: OnyxTypes.Report) {
    if (!expenseReport) {
        return;
    }
    if (expenseReport.policyID && shouldRestrictUserBillableActions(expenseReport.policyID)) {
        Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(expenseReport.policyID));
        return;
    }

    const currentNextStep = allNextSteps[`${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`] ?? null;
    const parentReport = getReportOrDraftReport(expenseReport.parentReportID);
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const policy = getPolicy(expenseReport.policyID);
    const isCurrentUserManager = currentUserPersonalDetails?.accountID === expenseReport.managerID;
    const isSubmitAndClosePolicy = isSubmitAndClose(policy);
    const adminAccountID = policy?.role === CONST.POLICY.ROLE.ADMIN ? currentUserPersonalDetails?.accountID : undefined;
    const optimisticSubmittedReportAction = buildOptimisticSubmittedReportAction(expenseReport?.total ?? 0, expenseReport.currency ?? '', expenseReport.reportID, adminAccountID);
    const optimisticNextStep = buildNextStep(expenseReport, isSubmitAndClosePolicy ? CONST.REPORT.STATUS_NUM.CLOSED : CONST.REPORT.STATUS_NUM.SUBMITTED);
    const approvalChain = getApprovalChain(policy, expenseReport);
    const managerID = getAccountIDsByLogins(approvalChain).at(0);

    const optimisticData: OnyxUpdate[] = !isSubmitAndClosePolicy
        ? [
              {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
                  value: {
                      [optimisticSubmittedReportAction.reportActionID]: {
                          ...(optimisticSubmittedReportAction as OnyxTypes.ReportAction),
                          pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                      },
                  },
              },
              {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
                  value: {
                      ...expenseReport,
                      managerID,
                      lastMessageText: getReportActionText(optimisticSubmittedReportAction),
                      lastMessageHtml: getReportActionHtml(optimisticSubmittedReportAction),
                      stateNum: CONST.REPORT.STATE_NUM.SUBMITTED,
                      statusNum: CONST.REPORT.STATUS_NUM.SUBMITTED,
                  },
              },
          ]
        : [
              {
                  onyxMethod: Onyx.METHOD.MERGE,
                  key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
                  value: {
                      ...expenseReport,
                      stateNum: CONST.REPORT.STATE_NUM.APPROVED,
                      statusNum: CONST.REPORT.STATUS_NUM.CLOSED,
                  },
              },
          ];

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    });

    if (parentReport?.reportID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
            value: {
                ...parentReport,
                // In case its a manager who force submitted the report, they are the next user who needs to take an action
                hasOutstandingChildRequest: isCurrentUserManager,
                iouReportID: null,
            },
        });
    }

    const successData: OnyxUpdate[] = [];
    if (!isSubmitAndClosePolicy) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        });
    }

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                statusNum: CONST.REPORT.STATUS_NUM.OPEN,
                stateNum: CONST.REPORT.STATE_NUM.OPEN,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        },
    ];
    if (!isSubmitAndClosePolicy) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        });
    }

    if (parentReport?.reportID) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
            value: {
                hasOutstandingChildRequest: parentReport.hasOutstandingChildRequest,
                iouReportID: expenseReport.reportID,
            },
        });
    }

    const parameters: SubmitReportParams = {
        reportID: expenseReport.reportID,
        managerAccountID: getSubmitToAccountID(policy, expenseReport) ?? expenseReport.managerID,
        reportActionID: optimisticSubmittedReportAction.reportActionID,
    };

    API.write(WRITE_COMMANDS.SUBMIT_REPORT, parameters, {optimisticData, successData, failureData});
}

function cancelPayment(expenseReport: OnyxEntry<OnyxTypes.Report>, chatReport: OnyxTypes.Report) {
    if (isEmptyObject(expenseReport)) {
        return;
    }

    const optimisticReportAction = buildOptimisticCancelPaymentReportAction(
        expenseReport.reportID,
        -((expenseReport.total ?? 0) - (expenseReport?.nonReimbursableTotal ?? 0)),
        expenseReport.currency ?? '',
    );
    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const policy = getPolicy(chatReport.policyID);
    const approvalMode = policy?.approvalMode ?? CONST.POLICY.APPROVAL_MODE.BASIC;
    const stateNum: ValueOf<typeof CONST.REPORT.STATE_NUM> = approvalMode === CONST.POLICY.APPROVAL_MODE.OPTIONAL ? CONST.REPORT.STATE_NUM.SUBMITTED : CONST.REPORT.STATE_NUM.APPROVED;
    const statusNum: ValueOf<typeof CONST.REPORT.STATUS_NUM> = approvalMode === CONST.POLICY.APPROVAL_MODE.OPTIONAL ? CONST.REPORT.STATUS_NUM.SUBMITTED : CONST.REPORT.STATUS_NUM.APPROVED;
    const optimisticNextStep = buildNextStep(expenseReport, statusNum);
    const iouReportActions = getAllReportActions(chatReport.iouReportID);
    const expenseReportActions = getAllReportActions(expenseReport.reportID);
    const iouCreatedAction = Object.values(iouReportActions).find((action) => isCreatedAction(action));
    const expenseCreatedAction = Object.values(expenseReportActions).find((action) => isCreatedAction(action));
    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReportAction.reportActionID]: {
                    ...(optimisticReportAction as OnyxTypes.ReportAction),
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                // The report created later will become the iouReportID of the chat report
                iouReportID: (iouCreatedAction?.created ?? '') > (expenseCreatedAction?.created ?? '') ? chatReport?.iouReportID : expenseReport.reportID,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                ...expenseReport,
                isWaitingOnBankAccount: false,
                lastVisibleActionCreated: optimisticReportAction?.created,
                lastMessageText: getReportActionText(optimisticReportAction),
                lastMessageHtml: getReportActionHtml(optimisticReportAction),
                stateNum,
                statusNum,
                isCancelledIOU: true,
            },
        },
    ];

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: optimisticNextStep,
    });

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED,
                isWaitingOnBankAccount: expenseReport.isWaitingOnBankAccount,
                isCancelledIOU: false,
            },
        },
    ];

    if (expenseReport.parentReportID && expenseReport.parentReportActionID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: stateNum,
                    childStatusNum: statusNum,
                },
            },
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.parentReportID}`,
            value: {
                [expenseReport.parentReportActionID]: {
                    childStateNum: expenseReport.stateNum,
                    childStatusNum: expenseReport.statusNum,
                },
            },
        });
    }

    if (chatReport?.reportID) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                iouReportID: expenseReport.reportID,
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                hasOutstandingChildRequest: chatReport.hasOutstandingChildRequest,
                iouReportID: chatReport.iouReportID,
            },
        });
    }
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
        value: buildNextStep(expenseReport, CONST.REPORT.STATUS_NUM.REIMBURSED),
    });

    API.write(
        WRITE_COMMANDS.CANCEL_PAYMENT,
        {
            iouReportID: expenseReport.reportID,
            chatReportID: chatReport.reportID,
            managerAccountID: expenseReport.managerID ?? CONST.DEFAULT_NUMBER_ID,
            reportActionID: optimisticReportAction.reportActionID,
        },
        {optimisticData, successData, failureData},
    );
    notifyNewAction(expenseReport.reportID, userAccountID);
}

/**
 * Completes onboarding for invite link flow based on the selected payment option
 *
 * @param paymentSelected based on which we choose the onboarding choice and concierge message
 */
function completePaymentOnboarding(paymentSelected: ValueOf<typeof CONST.PAYMENT_SELECTED>, adminsChatReportID?: string, onboardingPolicyID?: string) {
    const isInviteOnboardingComplete = introSelected?.isInviteOnboardingComplete ?? false;

    if (isInviteOnboardingComplete || !introSelected?.choice || !introSelected?.inviteType) {
        return;
    }

    const session = getSession();

    const personalDetailsListValues = Object.values(getPersonalDetailsForAccountIDs(session?.accountID ? [session.accountID] : [], personalDetailsList));
    const personalDetails = personalDetailsListValues.at(0);

    let onboardingPurpose = introSelected?.choice;
    if (introSelected?.inviteType === CONST.ONBOARDING_INVITE_TYPES.IOU && paymentSelected === CONST.IOU.PAYMENT_SELECTED.BBA) {
        onboardingPurpose = CONST.ONBOARDING_CHOICES.MANAGE_TEAM;
    }

    if (introSelected?.inviteType === CONST.ONBOARDING_INVITE_TYPES.INVOICE && paymentSelected !== CONST.IOU.PAYMENT_SELECTED.BBA) {
        onboardingPurpose = CONST.ONBOARDING_CHOICES.CHAT_SPLIT;
    }
    const {onboardingMessages} = getOnboardingMessages();

    completeOnboarding({
        engagementChoice: onboardingPurpose,
        onboardingMessage: onboardingMessages[onboardingPurpose],
        firstName: personalDetails?.firstName,
        lastName: personalDetails?.lastName,
        adminsChatReportID,
        onboardingPolicyID,
        paymentSelected,
        wasInvited: true,
    });
}
function payMoneyRequest(paymentType: PaymentMethodType, chatReport: OnyxTypes.Report, iouReport: OnyxEntry<OnyxTypes.Report>, paymentPolicyID?: string, full = true) {
    if (chatReport.policyID && shouldRestrictUserBillableActions(chatReport.policyID)) {
        Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(chatReport.policyID));
        return;
    }

    const paymentSelected = paymentType === CONST.IOU.PAYMENT_TYPE.VBBA ? CONST.IOU.PAYMENT_SELECTED.BBA : CONST.IOU.PAYMENT_SELECTED.PBA;
    completePaymentOnboarding(paymentSelected);

    const recipient = {accountID: iouReport?.ownerAccountID ?? CONST.DEFAULT_NUMBER_ID};
    const {params, optimisticData, successData, failureData} = getPayMoneyRequestParams(chatReport, iouReport, recipient, paymentType, full, undefined, undefined, paymentPolicyID);

    // For now, we need to call the PayMoneyRequestWithWallet API since PayMoneyRequest was not updated to work with
    // Expensify Wallets.
    const apiCommand = paymentType === CONST.IOU.PAYMENT_TYPE.EXPENSIFY ? WRITE_COMMANDS.PAY_MONEY_REQUEST_WITH_WALLET : WRITE_COMMANDS.PAY_MONEY_REQUEST;

    playSound(SOUNDS.SUCCESS);
    API.write(apiCommand, params, {optimisticData, successData, failureData});
    notifyNewAction(Navigation.getTopmostReportId() ?? iouReport?.reportID, userAccountID);
}

function payInvoice(
    paymentMethodType: PaymentMethodType,
    chatReport: OnyxTypes.Report,
    invoiceReport: OnyxEntry<OnyxTypes.Report>,
    payAsBusiness = false,
    methodID?: number,
    paymentMethod?: PaymentMethod,
) {
    const recipient = {accountID: invoiceReport?.ownerAccountID ?? CONST.DEFAULT_NUMBER_ID};
    const {
        optimisticData,
        successData,
        failureData,
        params: {
            reportActionID,
            policyID,
            adminsChatReportID,
            adminsCreatedReportActionID,
            expenseChatReportID,
            expenseCreatedReportActionID,
            customUnitRateID,
            customUnitID,
            ownerEmail,
            policyName,
        },
    } = getPayMoneyRequestParams(chatReport, invoiceReport, recipient, paymentMethodType, true, payAsBusiness, methodID);

    const paymentSelected = paymentMethodType === CONST.IOU.PAYMENT_TYPE.VBBA ? CONST.IOU.PAYMENT_SELECTED.BBA : CONST.IOU.PAYMENT_SELECTED.PBA;
    completePaymentOnboarding(paymentSelected);

    let params: PayInvoiceParams = {
        reportID: invoiceReport?.reportID,
        reportActionID,
        paymentMethodType,
        payAsBusiness,
    };

    if (paymentMethod === CONST.PAYMENT_METHODS.PERSONAL_BANK_ACCOUNT) {
        params.bankAccountID = methodID;
    }

    if (paymentMethod === CONST.PAYMENT_METHODS.DEBIT_CARD) {
        params.fundID = methodID;
    }

    if (policyID) {
        params = {
            ...params,
            policyID,
            adminsChatReportID,
            adminsCreatedReportActionID,
            expenseChatReportID,
            expenseCreatedReportActionID,
            customUnitRateID,
            customUnitID,
            ownerEmail,
            policyName,
        };
    }

    playSound(SOUNDS.SUCCESS);
    API.write(WRITE_COMMANDS.PAY_INVOICE, params, {optimisticData, successData, failureData});
}

function detachReceipt(transactionID: string | undefined) {
    if (!transactionID) {
        return;
    }
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const expenseReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transaction?.reportID}`] ?? null;
    const policy = allPolicies?.[`${ONYXKEYS.COLLECTION.POLICY}${expenseReport?.policyID}`];
    const newTransaction = transaction
        ? {
              ...transaction,
              filename: '',
              receipt: {},
          }
        : null;

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...newTransaction,
                pendingFields: {
                    receipt: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                },
            },
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingFields: {
                    receipt: null,
                },
            },
        },
    ];
    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...(transaction ?? null),
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.receiptDeleteFailureError'),
                pendingFields: {
                    receipt: null,
                },
            },
        },
    ];

    if (policy && isPaidGroupPolicy(policy) && newTransaction) {
        const policyCategories = allPolicyCategories?.[`${ONYXKEYS.COLLECTION.POLICY_CATEGORIES}${policy.id}`];
        const policyTagList = getPolicyTagsData(policy.id);
        const currentTransactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`] ?? [];
        const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(
            newTransaction,
            currentTransactionViolations,
            policy,
            policyTagList ?? {},
            policyCategories ?? {},
            hasDependentTags(policy, policyTagList ?? {}),
            isInvoiceReportReportUtils(expenseReport),
        );
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: currentTransactionViolations,
        });
    }

    const updatedReportAction = buildOptimisticDetachReceipt(expenseReport?.reportID, transactionID, transaction?.merchant);

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${updatedReportAction?.reportID}`,
        value: {
            [updatedReportAction.reportActionID]: updatedReportAction as OnyxTypes.ReportAction,
        },
    });
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${updatedReportAction?.reportID}`,
        value: {
            lastVisibleActionCreated: updatedReportAction.created,
            lastReadTime: updatedReportAction.created,
        },
    });
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${updatedReportAction?.reportID}`,
        value: {
            lastVisibleActionCreated: expenseReport?.lastVisibleActionCreated,
            lastReadTime: expenseReport?.lastReadTime,
        },
    });
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport?.reportID}`,
        value: {
            [updatedReportAction.reportActionID]: {pendingAction: null},
        },
    });
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport?.reportID}`,
        value: {
            [updatedReportAction.reportActionID]: {
                ...(updatedReportAction as OnyxTypes.ReportAction),
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericEditFailureMessage'),
            },
        },
    });

    const parameters: DetachReceiptParams = {transactionID, reportActionID: updatedReportAction.reportActionID};

    API.write(WRITE_COMMANDS.DETACH_RECEIPT, parameters, {optimisticData, successData, failureData});
}

function replaceReceipt({transactionID, file, source}: ReplaceReceipt) {
    if (!file) {
        return;
    }

    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const expenseReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transaction?.reportID}`] ?? null;
    const policy = allPolicies?.[`${ONYXKEYS.COLLECTION.POLICY}${expenseReport?.policyID}`];
    const oldReceipt = transaction?.receipt ?? {};
    const receiptOptimistic = {
        source,
        state: CONST.IOU.RECEIPT_STATE.OPEN,
    };
    const newTransaction = transaction && {...transaction, receipt: receiptOptimistic, filename: file.name};
    const retryParams = {transactionID, file: undefined, source};
    const currentSearchQueryJSON = getCurrentSearchQueryJSON();

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: receiptOptimistic,
                filename: file.name,
                pendingFields: {
                    receipt: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                },
                errors: null,
            },
        },
    ];

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingFields: {
                    receipt: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: !isEmptyObject(oldReceipt) ? oldReceipt : null,
                filename: transaction?.filename,
                errors: getReceiptError(receiptOptimistic, file.name, undefined, undefined, CONST.IOU.ACTION_PARAMS.REPLACE_RECEIPT, retryParams),
                pendingFields: {
                    receipt: null,
                },
            },
        },
    ];

    if (policy && isPaidGroupPolicy(policy) && newTransaction) {
        const policyCategories = allPolicyCategories?.[`${ONYXKEYS.COLLECTION.POLICY_CATEGORIES}${policy.id}`];
        const policyTagList = getPolicyTagsData(policy.id);
        const currentTransactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`] ?? [];
        const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(
            newTransaction,
            currentTransactionViolations,
            policy,
            policyTagList ?? {},
            policyCategories ?? {},
            hasDependentTags(policy, policyTagList ?? {}),
            isInvoiceReportReportUtils(expenseReport),
        );
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: currentTransactionViolations,
        });
    }
    if (currentSearchQueryJSON?.hash) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${currentSearchQueryJSON.hash}`,
            value: {
                data: {
                    [`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`]: {
                        receipt: receiptOptimistic,
                        filename: file.name,
                    },
                },
            },
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${currentSearchQueryJSON.hash}`,
            value: {
                data: {
                    [`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`]: {
                        receipt: !isEmptyObject(oldReceipt) ? oldReceipt : null,
                        filename: transaction?.filename,
                    },
                },
            },
        });
    }

    const parameters: ReplaceReceiptParams = {
        transactionID,
        receipt: file,
    };

    API.write(WRITE_COMMANDS.REPLACE_RECEIPT, parameters, {optimisticData, successData, failureData});
}

/**
 * Finds the participants for an IOU based on the attached report
 * @param transactionID of the transaction to set the participants of
 * @param report attached to the transaction
 */
function getMoneyRequestParticipantsFromReport(report: OnyxEntry<OnyxTypes.Report>): Participant[] {
    // If the report is iou or expense report, we should get the chat report to set participant for request money
    const chatReport = isMoneyRequestReportReportUtils(report) ? getReportOrDraftReport(report?.chatReportID) : report;
    const currentUserAccountID = currentUserPersonalDetails?.accountID;
    const shouldAddAsReport = !isEmptyObject(chatReport) && isSelfDM(chatReport);
    let participants: Participant[] = [];

    if (isPolicyExpenseChatReportUtil(chatReport) || shouldAddAsReport) {
        participants = [{accountID: 0, reportID: chatReport?.reportID, isPolicyExpenseChat: isPolicyExpenseChatReportUtil(chatReport), selected: true}];
    } else if (isInvoiceRoom(chatReport)) {
        participants = [
            {reportID: chatReport?.reportID, selected: true},
            {
                policyID: chatReport?.policyID,
                isSender: true,
                selected: false,
            },
        ];
    } else {
        const chatReportOtherParticipants = Object.keys(chatReport?.participants ?? {})
            .map(Number)
            .filter((accountID) => accountID !== currentUserAccountID);
        participants = chatReportOtherParticipants.map((accountID) => ({accountID, selected: true}));
    }

    return participants;
}

/**
 * Sets the participants for an IOU based on the attached report
 * @param transactionID of the transaction to set the participants of
 * @param report attached to the transaction
 * @param participantsAutoAssigned whether participants were auto assigned
 */
function setMoneyRequestParticipantsFromReport(transactionID: string, report: OnyxEntry<OnyxTypes.Report>, participantsAutoAssigned = true) {
    const participants = getMoneyRequestParticipantsFromReport(report);
    return Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {
        participants,
        participantsAutoAssigned,
    });
}

function setMoneyRequestTaxRate(transactionID: string, taxCode: string | null) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxCode});
}

function setMoneyRequestTaxAmount(transactionID: string, taxAmount: number | null) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxAmount});
}

function dismissHoldUseExplanation() {
    const parameters: SetNameValuePairParams = {
        name: ONYXKEYS.NVP_DISMISSED_HOLD_USE_EXPLANATION,
        value: true,
    };

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.NVP_DISMISSED_HOLD_USE_EXPLANATION,
            value: true,
        },
    ];

    API.write(WRITE_COMMANDS.SET_NAME_VALUE_PAIR, parameters, {
        optimisticData,
    });
}

/**
 * Sets the `splitShares` map that holds individual shares of a split bill
 */
function setSplitShares(transaction: OnyxEntry<OnyxTypes.Transaction>, amount: number, currency: string, newAccountIDs: number[]) {
    if (!transaction) {
        return;
    }
    const oldAccountIDs = Object.keys(transaction.splitShares ?? {}).map((key) => Number(key));

    // Create an array containing unique IDs of the current transaction participants and the new ones
    // The current userAccountID might not be included in newAccountIDs if this is called from the participants step using Global Create
    // If this is called from an existing group chat, it'll be included. So we manually add them to account for both cases.
    const accountIDs = [...new Set<number>([userAccountID, ...newAccountIDs, ...oldAccountIDs])];

    const splitShares: SplitShares = accountIDs.reduce((acc: SplitShares, accountID): SplitShares => {
        // We want to replace the contents of splitShares to contain only `newAccountIDs` entries
        // In the case of going back to the participants page and removing a participant
        // a simple merge will have the previous participant still present in the splitShares object
        // So we manually set their entry to null
        if (!newAccountIDs.includes(accountID) && accountID !== userAccountID) {
            acc[accountID] = null;
            return acc;
        }

        const isPayer = accountID === userAccountID;
        const participantsLength = newAccountIDs.includes(userAccountID) ? newAccountIDs.length - 1 : newAccountIDs.length;
        const splitAmount = calculateIOUAmount(participantsLength, amount, currency, isPayer);
        acc[accountID] = {
            amount: splitAmount,
            isModified: false,
        };
        return acc;
    }, {});

    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction.transactionID}`, {splitShares});
}

function resetSplitShares(transaction: OnyxEntry<OnyxTypes.Transaction>, newAmount?: number, currency?: string) {
    if (!transaction) {
        return;
    }
    const accountIDs = Object.keys(transaction.splitShares ?? {}).map((key) => Number(key));
    if (!accountIDs) {
        return;
    }
    setSplitShares(transaction, newAmount ?? transaction.amount, currency ?? transaction.currency, accountIDs);
}

/**
 * Sets an individual split share of the participant accountID supplied
 */
function setIndividualShare(transactionID: string, participantAccountID: number, participantShare: number) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {
        splitShares: {
            [participantAccountID]: {amount: participantShare, isModified: true},
        },
    });
}

/**
 * Adjusts remaining unmodified shares when another share is modified
 * E.g. if total bill is $100 and split between 3 participants, when the user changes the first share to $50, the remaining unmodified shares will become $25 each.
 */
function adjustRemainingSplitShares(transaction: NonNullable<OnyxTypes.Transaction>) {
    const modifiedShares = Object.keys(transaction.splitShares ?? {}).filter((key: string) => transaction?.splitShares?.[Number(key)]?.isModified);

    if (!modifiedShares.length) {
        return;
    }

    const sumOfManualShares = modifiedShares
        .map((key: string): number => transaction?.splitShares?.[Number(key)]?.amount ?? 0)
        .reduce((prev: number, current: number): number => prev + current, 0);

    const unmodifiedSharesAccountIDs = Object.keys(transaction.splitShares ?? {})
        .filter((key: string) => !transaction?.splitShares?.[Number(key)]?.isModified)
        .map((key: string) => Number(key));

    const remainingTotal = transaction.amount - sumOfManualShares;
    if (remainingTotal < 0) {
        return;
    }

    const splitShares: SplitShares = unmodifiedSharesAccountIDs.reduce((acc: SplitShares, accountID: number, index: number): SplitShares => {
        const splitAmount = calculateIOUAmount(unmodifiedSharesAccountIDs.length - 1, remainingTotal, transaction.currency, index === 0);
        acc[accountID] = {
            amount: splitAmount,
        };
        return acc;
    }, {});

    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transaction.transactionID}`, {splitShares});
}

/**
 * Put expense on HOLD
 */
function putOnHold(transactionID: string, comment: string, reportID: string, searchHash?: number) {
    const currentTime = DateUtils.getDBTime();
    const createdReportAction = buildOptimisticHoldReportAction(currentTime);
    const createdReportActionComment = buildOptimisticHoldReportActionComment(comment, DateUtils.addMillisecondsFromDateTime(currentTime, 1));
    const newViolation = {name: CONST.VIOLATIONS.HOLD, type: CONST.VIOLATION_TYPES.VIOLATION, showInReview: true};
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`] ?? [];
    const updatedViolations = [...transactionViolations, newViolation];
    const parentReportActionOptimistic = getOptimisticDataForParentReportAction(reportID, createdReportActionComment.created, CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD);
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transaction?.reportID}`];
    const report = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${reportID}`];

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
            value: {
                [createdReportAction.reportActionID]: createdReportAction as ReportAction,
                [createdReportActionComment.reportActionID]: createdReportActionComment as ReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                comment: {
                    hold: createdReportAction.reportActionID,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: updatedViolations,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
            value: {
                lastVisibleActionCreated: createdReportActionComment.created,
            },
        },
    ];

    if (iouReport && iouReport.currency === transaction?.currency) {
        const isExpenseReportLocal = isExpenseReport(iouReport);
        const coefficient = isExpenseReportLocal ? -1 : 1;
        const transactionAmount = getAmount(transaction, isExpenseReportLocal) * coefficient;
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                unheldTotal: (iouReport.unheldTotal ?? 0) - transactionAmount,
                unheldNonReimbursableTotal: !transaction?.reimbursable ? (iouReport.unheldNonReimbursableTotal ?? 0) - transactionAmount : iouReport.unheldNonReimbursableTotal,
            },
        });
    }

    parentReportActionOptimistic.forEach((parentActionData) => {
        if (!parentActionData) {
            return;
        }
        optimisticData.push(parentActionData);
    });

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: null,
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: null,
                comment: {
                    hold: null,
                },
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericHoldExpenseFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
            value: {
                [createdReportAction.reportActionID]: null,
                [createdReportActionComment.reportActionID]: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
            value: {
                lastVisibleActionCreated: report?.lastVisibleActionCreated,
            },
        },
    ];

    // If we are holding from the search page, we optimistically update the snapshot data that search uses so that it is kept in sync
    if (searchHash) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${searchHash}`,
            value: {
                data: {
                    [`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`]: {
                        canHold: false,
                        canUnhold: true,
                    },
                },
            } as Record<string, Record<string, Partial<SearchTransaction>>>,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${searchHash}`,
            value: {
                data: {
                    [`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`]: {
                        canHold: true,
                        canUnhold: false,
                    },
                },
            } as Record<string, Record<string, Partial<SearchTransaction>>>,
        });
    }

    API.write(
        'HoldRequest',
        {
            transactionID,
            comment,
            reportActionID: createdReportAction.reportActionID,
            commentReportActionID: createdReportActionComment.reportActionID,
        },
        {optimisticData, successData, failureData},
    );

    const currentReportID = getDisplayedReportID(reportID);
    Navigation.setNavigationActionToMicrotaskQueue(() => notifyNewAction(currentReportID, userAccountID));
}

function putTransactionsOnHold(transactionsID: string[], comment: string, reportID: string) {
    transactionsID.forEach((transactionID) => {
        const {childReportID} = getIOUActionForReportID(reportID, transactionID) ?? {};
        if (!childReportID) {
            return;
        }
        putOnHold(transactionID, comment, childReportID);
    });
}

/**
 * Remove expense from HOLD
 */
function unholdRequest(transactionID: string, reportID: string) {
    const createdReportAction = buildOptimisticUnHoldReportAction();
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`];
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${transaction?.reportID}`];
    const report = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${reportID}`];

    const optimisticData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
            value: {
                [createdReportAction.reportActionID]: createdReportAction as ReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE,
                comment: {
                    hold: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: transactionViolations?.filter((violation) => violation.name !== CONST.VIOLATIONS.HOLD) ?? [],
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
            value: {
                lastVisibleActionCreated: createdReportAction.created,
            },
        },
    ];

    if (iouReport && iouReport.currency === transaction?.currency) {
        const isExpenseReportLocal = isExpenseReport(iouReport);
        const coefficient = isExpenseReportLocal ? -1 : 1;
        const transactionAmount = getAmount(transaction, isExpenseReportLocal) * coefficient;
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                unheldTotal: (iouReport.unheldTotal ?? 0) + transactionAmount,
                unheldNonReimbursableTotal: !transaction?.reimbursable ? (iouReport.unheldNonReimbursableTotal ?? 0) + transactionAmount : iouReport.unheldNonReimbursableTotal,
            },
        });
    }

    const successData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: null,
                comment: {
                    hold: null,
                },
            },
        },
    ];

    const failureData: OnyxUpdate[] = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${reportID}`,
            value: {
                [createdReportAction.reportActionID]: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingAction: null,
                errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericUnholdExpenseFailureMessage'),
                comment: {
                    hold: transaction?.comment?.hold,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
            value: transactionViolations ?? null,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${reportID}`,
            value: {
                lastVisibleActionCreated: report?.lastVisibleActionCreated,
            },
        },
    ];

    API.write(
        'UnHoldRequest',
        {
            transactionID,
            reportActionID: createdReportAction.reportActionID,
        },
        {optimisticData, successData, failureData},
    );

    const currentReportID = getDisplayedReportID(reportID);
    notifyNewAction(currentReportID, userAccountID);
}

// eslint-disable-next-line rulesdir/no-negated-variables
function navigateToStartStepIfScanFileCannotBeRead(
    receiptFilename: string | undefined,
    receiptPath: ReceiptSource | undefined,
    onSuccess: (file: File) => void,
    requestType: IOURequestType,
    iouType: IOUType,
    transactionID: string,
    reportID: string,
    receiptType: string | undefined,
    onFailureCallback?: () => void,
) {
    if (!receiptFilename || !receiptPath) {
        return;
    }

    const onFailure = () => {
        setMoneyRequestReceipt(transactionID, '', '', true);
        if (requestType === CONST.IOU.REQUEST_TYPE.MANUAL) {
            if (onFailureCallback) {
                onFailureCallback();
                return;
            }
            Navigation.navigate(ROUTES.MONEY_REQUEST_STEP_SCAN.getRoute(CONST.IOU.ACTION.CREATE, iouType, transactionID, reportID, Navigation.getActiveRouteWithoutParams()));
            return;
        }
        navigateToStartMoneyRequestStep(requestType, iouType, transactionID, reportID);
    };
    readFileAsync(receiptPath.toString(), receiptFilename, onSuccess, onFailure, receiptType);
}

function checkIfScanFileCanBeRead(
    receiptFilename: string | undefined,
    receiptPath: ReceiptSource | undefined,
    receiptType: string | undefined,
    onSuccess: (file: File) => void,
    onFailure: () => void,
) {
    if (!receiptFilename || !receiptPath) {
        return;
    }

    return readFileAsync(receiptPath.toString(), receiptFilename, onSuccess, onFailure, receiptType);
}

/** Save the preferred payment method for a policy or personal DM */
function savePreferredPaymentMethod(
    policyID: string | undefined,
    paymentMethod: string,
    type: ValueOf<typeof CONST.LAST_PAYMENT_METHOD> | undefined,
    prevPaymentMethod?: OnyxTypes.LastPaymentMethodType | string,
) {
    if (!policyID) {
        return;
    }

    // to make it easier to revert to the previous last payment method, we will save it to this key
    Onyx.merge(`${ONYXKEYS.NVP_LAST_PAYMENT_METHOD}`, {
        [policyID]: type
            ? {
                  [type]: {name: paymentMethod},
                  [CONST.LAST_PAYMENT_METHOD.LAST_USED]: {name: typeof prevPaymentMethod === 'string' ? prevPaymentMethod : (prevPaymentMethod?.lastUsed?.name ?? paymentMethod)},
              }
            : paymentMethod,
    });
}

/** Get report policy id of IOU request */
function getIOURequestPolicyID(transaction: OnyxEntry<OnyxTypes.Transaction>, report: OnyxEntry<OnyxTypes.Report>): string | undefined {
    // Workspace sender will exist for invoices
    const workspaceSender = transaction?.participants?.find((participant) => participant.isSender);
    return workspaceSender?.policyID ?? report?.policyID;
}

function getIOUActionForTransactions(transactionIDList: Array<string | undefined>, iouReportID: string | undefined): Array<ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU>> {
    return Object.values(allReportActions?.[`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReportID}`] ?? {})?.filter(
        (reportAction): reportAction is ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU> => {
            if (!isMoneyRequestAction(reportAction)) {
                return false;
            }
            const message = getOriginalMessage(reportAction);
            if (!message?.IOUTransactionID) {
                return false;
            }
            return transactionIDList.includes(message.IOUTransactionID);
        },
    );
}

/** Merge several transactions into one by updating the fields of the one we want to keep and deleting the rest */
function mergeDuplicates(params: MergeDuplicatesParams) {
    const originalSelectedTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`];

    const optimisticTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`,
        value: {
            ...originalSelectedTransaction,
            billable: params.billable,
            comment: {
                comment: params.comment,
            },
            category: params.category,
            created: params.created,
            currency: params.currency,
            modifiedMerchant: params.merchant,
            reimbursable: params.reimbursable,
            tag: params.tag,
        },
    };

    const failureTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`,
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        value: originalSelectedTransaction as OnyxTypes.Transaction,
    };

    const optimisticTransactionDuplicatesData: OnyxUpdate[] = params.transactionIDList.map((id) => ({
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${id}`,
        value: null,
    }));

    const failureTransactionDuplicatesData: OnyxUpdate[] = params.transactionIDList.map((id) => ({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${id}`,
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        value: allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${id}`] as OnyxTypes.Transaction,
    }));

    const optimisticTransactionViolations: OnyxUpdate[] = [...params.transactionIDList, params.transactionID].map((id) => {
        const violations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`] ?? [];
        return {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`,
            value: violations.filter((violation) => violation.name !== CONST.VIOLATIONS.DUPLICATED_TRANSACTION),
        };
    });

    const failureTransactionViolations: OnyxUpdate[] = [...params.transactionIDList, params.transactionID].map((id) => {
        const violations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`] ?? [];
        return {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`,
            value: violations,
        };
    });

    const duplicateTransactionTotals = params.transactionIDList.reduce((total, id) => {
        const duplicateTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${id}`];
        if (!duplicateTransaction) {
            return total;
        }
        return total + duplicateTransaction.amount;
    }, 0);

    const expenseReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${params.reportID}`];
    const expenseReportOptimisticData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${params.reportID}`,
        value: {
            total: (expenseReport?.total ?? 0) - duplicateTransactionTotals,
        },
    };
    const expenseReportFailureData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${params.reportID}`,
        value: {
            total: expenseReport?.total,
        },
    };

    const iouActionsToDelete = params.reportID ? getIOUActionForTransactions(params.transactionIDList, params.reportID) : [];

    const deletedTime = DateUtils.getDBTime();
    const expenseReportActionsOptimisticData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${params.reportID}`,
        value: iouActionsToDelete.reduce<Record<string, PartialDeep<ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU>>>>((val, reportAction) => {
            const firstMessage = Array.isArray(reportAction.message) ? reportAction.message.at(0) : null;
            // eslint-disable-next-line no-param-reassign
            val[reportAction.reportActionID] = {
                originalMessage: {
                    deleted: deletedTime,
                },
                ...(firstMessage && {
                    message: [
                        {
                            ...firstMessage,
                            deleted: deletedTime,
                        },
                        ...(Array.isArray(reportAction.message) ? reportAction.message.slice(1) : []),
                    ],
                }),
                ...(!Array.isArray(reportAction.message) && {
                    message: {
                        deleted: deletedTime,
                    },
                }),
            };
            return val;
        }, {}),
    };
    const expenseReportActionsFailureData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${params.reportID}`,
        value: iouActionsToDelete.reduce<Record<string, NullishDeep<PartialDeep<ReportAction<typeof CONST.REPORT.ACTIONS.TYPE.IOU>>>>>((val, reportAction) => {
            // eslint-disable-next-line no-param-reassign
            val[reportAction.reportActionID] = {
                originalMessage: {
                    deleted: null,
                },
                message: reportAction.message,
            };
            return val;
        }, {}),
    };

    const optimisticReportAction = buildOptimisticResolvedDuplicatesReportAction();

    const transactionThreadReportID = params.reportID ? getIOUActionForTransactions([params.transactionID], params.reportID).at(0)?.childReportID : undefined;
    const optimisticReportActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [optimisticReportAction.reportActionID]: optimisticReportAction,
        },
    };

    const failureReportActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [optimisticReportAction.reportActionID]: null,
        },
    };

    const optimisticData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    optimisticData.push(
        optimisticTransactionData,
        ...optimisticTransactionDuplicatesData,
        ...optimisticTransactionViolations,
        expenseReportOptimisticData,
        expenseReportActionsOptimisticData,
        optimisticReportActionData,
    );
    failureData.push(
        failureTransactionData,
        ...failureTransactionDuplicatesData,
        ...failureTransactionViolations,
        expenseReportFailureData,
        expenseReportActionsFailureData,
        failureReportActionData,
    );

    API.write(WRITE_COMMANDS.MERGE_DUPLICATES, {...params, reportActionID: optimisticReportAction.reportActionID}, {optimisticData, failureData});
}

function updateLastLocationPermissionPrompt() {
    Onyx.set(ONYXKEYS.NVP_LAST_LOCATION_PERMISSION_PROMPT, new Date().toISOString());
}

function setMultipleMoneyRequestParticipantsFromReport(transactionIDs: string[], reportValue: OnyxEntry<OnyxTypes.Report>) {
    const participants = getMoneyRequestParticipantsFromReport(reportValue);
    const updatedTransactions: Record<`${typeof ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${string}`, NullishDeep<OnyxTypes.Transaction>> = {};
    transactionIDs.forEach((transactionID) => {
        updatedTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`] = {
            participants,
            participantsAutoAssigned: true,
        };
    });
    return Onyx.mergeCollection(ONYXKEYS.COLLECTION.TRANSACTION_DRAFT, updatedTransactions);
}

/** Instead of merging the duplicates, it updates the transaction we want to keep and puts the others on hold without deleting them */
function resolveDuplicates(params: MergeDuplicatesParams) {
    if (!params.transactionID) {
        return;
    }

    const originalSelectedTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`];

    const optimisticTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`,
        value: {
            ...originalSelectedTransaction,
            billable: params.billable,
            comment: {
                comment: params.comment,
            },
            category: params.category,
            created: params.created,
            currency: params.currency,
            modifiedMerchant: params.merchant,
            reimbursable: params.reimbursable,
            tag: params.tag,
        },
    };

    const failureTransactionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${params.transactionID}`,
        // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
        value: originalSelectedTransaction as OnyxTypes.Transaction,
    };

    const optimisticTransactionViolations: OnyxUpdate[] = [...params.transactionIDList, params.transactionID].map((id) => {
        const violations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`] ?? [];
        const newViolation = {name: CONST.VIOLATIONS.HOLD, type: CONST.VIOLATION_TYPES.VIOLATION};
        const updatedViolations = id === params.transactionID ? violations : [...violations, newViolation];
        return {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`,
            value: updatedViolations.filter((violation) => violation.name !== CONST.VIOLATIONS.DUPLICATED_TRANSACTION),
        };
    });

    const failureTransactionViolations: OnyxUpdate[] = [...params.transactionIDList, params.transactionID].map((id) => {
        const violations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`] ?? [];
        return {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${id}`,
            value: violations,
        };
    });

    const iouActionList = params.reportID ? getIOUActionForTransactions(params.transactionIDList, params.reportID) : [];
    const orderedTransactionIDList = iouActionList
        .map((action) => {
            const message = getOriginalMessage(action);
            return message?.IOUTransactionID;
        })
        .filter((id): id is string => !!id);

    const optimisticHoldActions: OnyxUpdate[] = [];
    const failureHoldActions: OnyxUpdate[] = [];
    const reportActionIDList: string[] = [];
    const optimisticHoldTransactionActions: OnyxUpdate[] = [];
    const failureHoldTransactionActions: OnyxUpdate[] = [];
    iouActionList.forEach((action) => {
        const transactionThreadReportID = action?.childReportID;
        const createdReportAction = buildOptimisticHoldReportAction();
        reportActionIDList.push(createdReportAction.reportActionID);
        const transactionID = isMoneyRequestAction(action) ? (getOriginalMessage(action)?.IOUTransactionID ?? CONST.DEFAULT_NUMBER_ID) : CONST.DEFAULT_NUMBER_ID;
        optimisticHoldTransactionActions.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                comment: {
                    hold: createdReportAction.reportActionID,
                },
            },
        });
        failureHoldTransactionActions.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                comment: {
                    hold: null,
                },
            },
        });
        optimisticHoldActions.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
            value: {
                [createdReportAction.reportActionID]: createdReportAction,
            },
        });
        failureHoldActions.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
            value: {
                [createdReportAction.reportActionID]: {
                    errors: getMicroSecondOnyxErrorWithTranslationKey('iou.error.genericHoldExpenseFailureMessage'),
                },
            },
        });
    });

    const transactionThreadReportID = params.reportID ? getIOUActionForTransactions([params.transactionID], params.reportID).at(0)?.childReportID : undefined;
    const optimisticReportAction = buildOptimisticDismissedViolationReportAction({
        reason: 'manual',
        violationName: CONST.VIOLATIONS.DUPLICATED_TRANSACTION,
    });

    const optimisticReportActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [optimisticReportAction.reportActionID]: optimisticReportAction,
        },
    };

    const failureReportActionData: OnyxUpdate = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadReportID}`,
        value: {
            [optimisticReportAction.reportActionID]: null,
        },
    };

    const optimisticData: OnyxUpdate[] = [];
    const failureData: OnyxUpdate[] = [];

    optimisticData.push(optimisticTransactionData, ...optimisticTransactionViolations, ...optimisticHoldActions, ...optimisticHoldTransactionActions, optimisticReportActionData);
    failureData.push(failureTransactionData, ...failureTransactionViolations, ...failureHoldActions, ...failureHoldTransactionActions, failureReportActionData);
    const {reportID, transactionIDList, receiptID, ...otherParams} = params;

    const parameters: ResolveDuplicatesParams = {
        ...otherParams,
        transactionID: params.transactionID,
        reportActionIDList,
        transactionIDList: orderedTransactionIDList,
        dismissedViolationReportActionID: optimisticReportAction.reportActionID,
    };

    API.write(WRITE_COMMANDS.RESOLVE_DUPLICATES, parameters, {optimisticData, failureData});
}

const expenseReportStatusFilterMapping = {
    [CONST.SEARCH.STATUS.EXPENSE.DRAFTS]: (expenseReport: OnyxEntry<OnyxTypes.Report>) =>
        expenseReport?.stateNum === CONST.REPORT.STATE_NUM.OPEN && expenseReport?.statusNum === CONST.REPORT.STATUS_NUM.OPEN,
    [CONST.SEARCH.STATUS.EXPENSE.OUTSTANDING]: (expenseReport: OnyxEntry<OnyxTypes.Report>) =>
        expenseReport?.stateNum === CONST.REPORT.STATE_NUM.SUBMITTED && expenseReport?.statusNum === CONST.REPORT.STATUS_NUM.SUBMITTED,
    [CONST.SEARCH.STATUS.EXPENSE.APPROVED]: (expenseReport: OnyxEntry<OnyxTypes.Report>) =>
        expenseReport?.stateNum === CONST.REPORT.STATE_NUM.APPROVED && expenseReport?.statusNum === CONST.REPORT.STATUS_NUM.APPROVED,
    [CONST.SEARCH.STATUS.EXPENSE.PAID]: (expenseReport: OnyxEntry<OnyxTypes.Report>) =>
        (expenseReport?.stateNum ?? 0) >= CONST.REPORT.STATE_NUM.APPROVED && expenseReport?.statusNum === CONST.REPORT.STATUS_NUM.REIMBURSED,
    [CONST.SEARCH.STATUS.EXPENSE.DONE]: (expenseReport: OnyxEntry<OnyxTypes.Report>) =>
        expenseReport?.stateNum === CONST.REPORT.STATE_NUM.APPROVED && expenseReport?.statusNum === CONST.REPORT.STATUS_NUM.CLOSED,
    [CONST.SEARCH.STATUS.EXPENSE.UNREPORTED]: (expenseReport: OnyxEntry<OnyxTypes.Report>) => !expenseReport,
    [CONST.SEARCH.STATUS.EXPENSE.ALL]: () => true,
};

//  Determines whether the current search results should be optimistically updated
function shouldOptimisticallyUpdateSearch(currentSearchQueryJSON: SearchQueryJSON, iouReport: OnyxEntry<OnyxTypes.Report>, isInvoice: boolean | undefined) {
    if (currentSearchQueryJSON.type !== CONST.SEARCH.DATA_TYPES.INVOICE && currentSearchQueryJSON.type !== CONST.SEARCH.DATA_TYPES.EXPENSE) {
        return false;
    }
    let shouldOptimisticallyUpdateByStatus;
    const status = currentSearchQueryJSON.status;
    if (Array.isArray(status)) {
        shouldOptimisticallyUpdateByStatus = status.some((val) => {
            const expenseStatus = val as ValueOf<typeof CONST.SEARCH.STATUS.EXPENSE>;
            return expenseReportStatusFilterMapping[expenseStatus](iouReport);
        });
    } else {
        const expenseStatus = status as ValueOf<typeof CONST.SEARCH.STATUS.EXPENSE>;
        shouldOptimisticallyUpdateByStatus = expenseReportStatusFilterMapping[expenseStatus](iouReport);
    }

    if (!shouldOptimisticallyUpdateByStatus) {
        return false;
    }

    const submitQueryString = getTodoSearchQuery(CONST.SEARCH.SEARCH_KEYS.SUBMIT, userAccountID);

    const submitQueryJSON = buildSearchQueryJSON(submitQueryString);

    const approveQueryString = getTodoSearchQuery(CONST.SEARCH.SEARCH_KEYS.APPROVE, userAccountID);
    const approveQueryJSON = buildSearchQueryJSON(approveQueryString);

    const validSearchTypes =
        (!isInvoice && currentSearchQueryJSON.type === CONST.SEARCH.DATA_TYPES.EXPENSE) || (isInvoice && currentSearchQueryJSON.type === CONST.SEARCH.DATA_TYPES.INVOICE);

    return (
        shouldOptimisticallyUpdateByStatus &&
        validSearchTypes &&
        (currentSearchQueryJSON.flatFilters.length === 0 || [submitQueryJSON?.hash, approveQueryJSON?.hash].includes(currentSearchQueryJSON.hash))
    );
}

function getSearchOnyxUpdate({
    participant,
    transaction,
    iouReport,
    policy,
    transactionThreadReportID,
    isFromOneTransactionReport,
    isInvoice,
}: GetSearchOnyxUpdateParams): OnyxData | undefined {
    const toAccountID = participant?.accountID;
    const fromAccountID = currentUserPersonalDetails?.accountID;
    const currentSearchQueryJSON = getCurrentSearchQueryJSON();

    if (currentSearchQueryJSON && toAccountID != null && fromAccountID != null) {
        if (shouldOptimisticallyUpdateSearch(currentSearchQueryJSON, iouReport, isInvoice)) {
            const isOptimisticToAccountData = isOptimisticPersonalDetail(toAccountID);
            const successData = [];
            if (isOptimisticToAccountData) {
                // The optimistic personal detail is removed on the API's success data but we can't change the managerID of the transaction in the snapshot.
                // So we need to add the optimistic personal detail back to the snapshot in success data to prevent the flickering.
                // After that, it will be cleared via Search API.
                // See https://github.com/Expensify/App/issues/61310 for more information.
                successData.push({
                    onyxMethod: Onyx.METHOD.MERGE,
                    key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${currentSearchQueryJSON.hash}` as const,
                    value: {
                        data: {
                            [ONYXKEYS.PERSONAL_DETAILS_LIST]: {
                                [toAccountID]: {
                                    accountID: toAccountID,
                                    displayName: participant?.displayName,
                                    login: participant?.login,
                                },
                            },
                        },
                    },
                });
            }
            return {
                optimisticData: [
                    {
                        onyxMethod: Onyx.METHOD.MERGE,
                        key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${currentSearchQueryJSON.hash}` as const,
                        value: {
                            data: {
                                [ONYXKEYS.PERSONAL_DETAILS_LIST]: {
                                    [toAccountID]: {
                                        accountID: toAccountID,
                                        displayName: participant?.displayName,
                                        login: participant?.login,
                                    },
                                    [fromAccountID]: {
                                        accountID: fromAccountID,
                                        avatar: currentUserPersonalDetails?.avatar,
                                        displayName: currentUserPersonalDetails?.displayName,
                                        login: currentUserPersonalDetails?.login,
                                    },
                                },
                                [`${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`]: {
                                    accountID: fromAccountID,
                                    managerID: toAccountID,
                                    ...(transactionThreadReportID && {transactionThreadReportID}),
                                    ...(isFromOneTransactionReport && {isFromOneTransactionReport}),
                                    ...transaction,
                                },
                                ...(policy && {[`${ONYXKEYS.COLLECTION.POLICY}${policy.id}`]: policy}),
                                ...(iouReport && {[`${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`]: iouReport}),
                            },
                        },
                    },
                ],
                successData,
            };
        }
    }
}

/**
 * Create a draft transaction to set up split expense details for the split expense flow
 */
function initSplitExpense(transaction: OnyxEntry<OnyxTypes.Transaction>, isOpenCreatedSplit?: boolean) {
    if (!transaction) {
        return;
    }

    const reportID = transaction?.reportID ?? String(CONST.DEFAULT_NUMBER_ID);

    if (isOpenCreatedSplit) {
        const originalTransactionID = transaction.comment?.originalTransactionID;
        const originalTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`];

        const relatedTransactions = Object.values(allTransactions).filter((currentTransaction) => {
            const currentReport = allReports?.[`${ONYXKEYS.COLLECTION.REPORT}${currentTransaction?.reportID}`];
            return currentTransaction?.comment?.originalTransactionID === originalTransactionID && !!currentReport && currentReport?.stateNum !== CONST.REPORT.STATUS_NUM.CLOSED;
        });

        const transactionDetails = getTransactionDetails(originalTransaction);

        const draftTransaction = buildOptimisticTransaction({
            originalTransactionID,
            transactionParams: {
                splitExpenses: relatedTransactions.map((currentTransaction) => {
                    const currentTransactionDetails = getTransactionDetails(currentTransaction);
                    return {
                        transactionID: currentTransaction?.transactionID ?? String(CONST.DEFAULT_NUMBER_ID),
                        amount: currentTransactionDetails?.amount ?? 0,
                        description: currentTransactionDetails?.comment,
                        category: currentTransactionDetails?.category,
                        tags: currentTransactionDetails?.tag ? [currentTransactionDetails?.tag] : [],
                        created: currentTransaction?.created ?? '',
                    };
                }),
                amount: transactionDetails?.amount ?? 0,
                currency: transactionDetails?.currency ?? CONST.CURRENCY.USD,
                merchant: transactionDetails?.merchant ?? '',
                participants: transaction?.participants,
                attendees: transactionDetails?.attendees as Attendee[],
                reportID: originalTransaction?.reportID,
            },
        });

        Onyx.set(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${originalTransactionID}`, draftTransaction);

        Navigation.navigate(
            ROUTES.SPLIT_EXPENSE.getRoute(
                originalTransaction?.reportID ?? String(CONST.DEFAULT_NUMBER_ID),
                originalTransactionID,
                transaction.transactionID,
                Navigation.getActiveRouteWithoutParams(),
            ),
        );
        return;
    }

    const transactionDetails = getTransactionDetails(transaction);
    const transactionDetailsAmount = transactionDetails?.amount ?? 0;
    const defaultCreated = DateUtils.formatWithUTCTimeZone(DateUtils.getDBTime(), CONST.DATE.FNS_FORMAT_STRING);

    const draftTransaction = buildOptimisticTransaction({
        originalTransactionID: transaction.transactionID,
        transactionParams: {
            splitExpenses: [
                {
                    transactionID: NumberUtils.rand64(),
                    amount: Math.floor(transactionDetailsAmount / 2),
                    description: transactionDetails?.comment,
                    category: transactionDetails?.category,
                    tags: transaction?.tag ? [transaction?.tag] : [],
                    created: transactionDetails?.created ?? defaultCreated,
                },
                {
                    transactionID: NumberUtils.rand64(),
                    amount: Math.ceil(transactionDetailsAmount / 2),
                    description: transactionDetails?.comment,
                    category: transactionDetails?.category,
                    tags: transaction?.tag ? [transaction?.tag] : [],
                    created: transactionDetails?.created ?? defaultCreated,
                },
            ],
            amount: transactionDetailsAmount,
            currency: transactionDetails?.currency ?? CONST.CURRENCY.USD,
            merchant: transactionDetails?.merchant ?? '',
            participants: transaction?.participants,
            attendees: transactionDetails?.attendees as Attendee[],
            reportID,
        },
    });

    Onyx.set(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transaction?.transactionID}`, draftTransaction);

    Navigation.navigate(ROUTES.SPLIT_EXPENSE.getRoute(reportID ?? String(CONST.DEFAULT_NUMBER_ID), transaction.transactionID, undefined, Navigation.getActiveRoute()));
}

/**
 * Create a draft transaction to set up split expense details for edit split details
 */
function initDraftSplitExpenseDataForEdit(draftTransaction: OnyxEntry<OnyxTypes.Transaction>, splitExpenseTransactionID: string, reportID: string) {
    if (!draftTransaction || !splitExpenseTransactionID) {
        return;
    }
    const originalTransactionID = draftTransaction?.comment?.originalTransactionID;
    const originalTransaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`];
    const splitTransactionData = draftTransaction?.comment?.splitExpenses?.find((item) => item.transactionID === splitExpenseTransactionID);

    const transactionDetails = getTransactionDetails(originalTransaction);

    const editDraftTransaction = buildOptimisticTransaction({
        existingTransactionID: CONST.IOU.OPTIMISTIC_TRANSACTION_ID,
        originalTransactionID,
        transactionParams: {
            amount: Number(splitTransactionData?.amount),
            currency: transactionDetails?.currency ?? CONST.CURRENCY.USD,
            comment: splitTransactionData?.description,
            tag: splitTransactionData?.tags?.at(0),
            merchant: transactionDetails?.merchant ?? '',
            participants: draftTransaction?.participants,
            attendees: transactionDetails?.attendees as Attendee[],
            reportID,
            created: splitTransactionData?.created ?? '',
            category: splitTransactionData?.category ?? '',
        },
    });

    Onyx.set(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`, editDraftTransaction);

    Navigation.navigate(ROUTES.SPLIT_EXPENSE_EDIT.getRoute(reportID, originalTransactionID, splitTransactionData?.transactionID, Navigation.getActiveRoute()));
}

/**
 * Append a new split expense entry to the draft transaction’s splitExpenses array
 */
function addSplitExpenseField(transaction: OnyxEntry<OnyxTypes.Transaction>, draftTransaction: OnyxEntry<OnyxTypes.Transaction>) {
    if (!transaction || !draftTransaction) {
        return;
    }

    const transactionDetails = getTransactionDetails(transaction);

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transaction.transactionID}`, {
        comment: {
            splitExpenses: [
                ...(draftTransaction.comment?.splitExpenses ?? []),
                {
                    transactionID: NumberUtils.rand64(),
                    amount: 0,
                    description: transactionDetails?.comment,
                    category: transactionDetails?.category,
                    tags: transaction?.tag ? [transaction?.tag] : [],
                    created: transactionDetails?.created ?? DateUtils.formatWithUTCTimeZone(DateUtils.getDBTime(), CONST.DATE.FNS_FORMAT_STRING),
                },
            ],
        },
    });
}

function removeSplitExpenseField(draftTransaction: OnyxEntry<OnyxTypes.Transaction>, splitExpenseTransactionID: string) {
    if (!draftTransaction || !splitExpenseTransactionID) {
        return;
    }

    const originalTransactionID = draftTransaction?.comment?.originalTransactionID;

    const splitExpenses = draftTransaction.comment?.splitExpenses?.filter((item) => item.transactionID !== splitExpenseTransactionID);

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${originalTransactionID}`, {
        comment: {
            splitExpenses,
        },
    });
}

function updateSplitExpenseField(splitExpenseDraftTransaction: OnyxEntry<OnyxTypes.Transaction>, splitExpenseTransactionID: string) {
    if (!splitExpenseDraftTransaction || !splitExpenseTransactionID) {
        return;
    }

    const originalTransactionID = splitExpenseDraftTransaction?.comment?.originalTransactionID;

    const draftTransaction = allDraftSplitTransactions[`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${originalTransactionID}`];

    const splitExpenses = draftTransaction?.comment?.splitExpenses?.map((item) => {
        if (item.transactionID === splitExpenseTransactionID) {
            const transactionDetails = getTransactionDetails(splitExpenseDraftTransaction);

            return {
                ...item,
                description: transactionDetails?.comment,
                category: transactionDetails?.category,
                tags: splitExpenseDraftTransaction?.tag ? [splitExpenseDraftTransaction?.tag] : [],
                created: transactionDetails?.created ?? DateUtils.formatWithUTCTimeZone(DateUtils.getDBTime(), CONST.DATE.FNS_FORMAT_STRING),
            };
        }
        return item;
    });

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${originalTransactionID}`, {
        comment: {
            splitExpenses,
        },
    });
}

function updateSplitExpenseAmountField(draftTransaction: OnyxEntry<OnyxTypes.Transaction>, currentItemTransactionID: string, amount: number) {
    if (!draftTransaction?.transactionID || !currentItemTransactionID) {
        return;
    }

    const updatedSplitExpenses = draftTransaction.comment?.splitExpenses?.map((splitExpense) => {
        if (splitExpense.transactionID === currentItemTransactionID) {
            return {
                ...splitExpense,
                amount,
            };
        }
        return splitExpense;
    });

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${draftTransaction?.comment?.originalTransactionID}`, {
        comment: {
            splitExpenses: updatedSplitExpenses,
        },
    });
}

function saveSplitTransactions(draftTransaction: OnyxEntry<OnyxTypes.Transaction>, hash: number) {
    const transactionReport = getReportOrDraftReport(draftTransaction?.reportID);
    const parentTransactionReport = getReportOrDraftReport(transactionReport?.parentReportID);
    const expenseReport = transactionReport?.type === CONST.REPORT.TYPE.EXPENSE ? transactionReport : parentTransactionReport;

    const originalTransactionID = draftTransaction?.comment?.originalTransactionID ?? CONST.IOU.OPTIMISTIC_TRANSACTION_ID;
    const originalTransaction = allTransactions?.[`${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`];
    const iouActions = getIOUActionForTransactions([originalTransactionID], expenseReport?.reportID);

    // This will be fixed as part of https://github.com/Expensify/Expensify/issues/507850
    // eslint-disable-next-line deprecation/deprecation
    const policy = getPolicy(expenseReport?.policyID);
    const policyCategories = getPolicyCategoriesData(expenseReport?.policyID);
    const policyTags = getPolicyTagsData(expenseReport?.policyID);
    const participants = getMoneyRequestParticipantsFromReport(expenseReport);
    const splitExpenses = draftTransaction?.comment?.splitExpenses ?? [];

    const splits: SplitTransactionSplitsParam =
        splitExpenses.map((split) => {
            const currentDescription = getParsedComment(Parser.htmlToMarkdown(split.description ?? ''));
            return {
                amount: split.amount,
                category: split.category ?? '',
                tag: split.tags?.[0] ?? '',
                created: split.created,
                merchant: draftTransaction?.merchant ?? '',
                transactionID: split.transactionID,
                comment: {
                    comment: currentDescription,
                },
            };
        }) ?? [];

    const successData = [] as OnyxUpdate[];
    const failureData = [] as OnyxUpdate[];
    const optimisticData = [] as OnyxUpdate[];

    splitExpenses.forEach((splitExpense, index) => {
        const requestMoneyInformation = {
            report: expenseReport,
            participantParams: {
                participant: participants.at(0) ?? ({} as Participant),
                payeeEmail: currentUserPersonalDetails?.login ?? '',
                payeeAccountID: currentUserPersonalDetails?.accountID ?? CONST.DEFAULT_NUMBER_ID,
            },
            policyParams: {
                policy,
                policyCategories,
                policyTags,
            },
            transactionParams: {
                amount: splitExpense.amount ?? 0,
                currency: draftTransaction?.currency ?? CONST.CURRENCY.USD,
                created: splitExpense.created,
                merchant: draftTransaction?.merchant ?? '',
                comment: splitExpense.description,
                category: splitExpense.category,
                tag: splitExpense.tags?.[0],
                originalTransactionID,
                attendees: draftTransaction?.comment?.attendees,
                source: CONST.IOU.TYPE.SPLIT,
            },
        };

        const {report, participantParams, policyParams, transactionParams} = requestMoneyInformation;
        const parsedComment = getParsedComment(Parser.htmlToMarkdown(transactionParams.comment ?? ''));
        transactionParams.comment = parsedComment;

        const currentChatReport = getReportOrDraftReport(report?.chatReportID);
        const parentChatReport = getReportOrDraftReport(currentChatReport?.parentReportID);

        const existingTransactionID = splitExpense.transactionID;

        const {transactionThreadReportID, createdReportActionIDForThread, onyxData, iouAction} = getMoneyRequestInformation({
            participantParams,
            parentChatReport,
            policyParams,
            transactionParams,
            moneyRequestReportID: report?.reportID,
            existingTransaction: originalTransaction,
            existingTransactionID,
            isSplitExpense: true,
        });

        const split = splits.at(index);
        if (split) {
            // For request params we need to have the transactionThreadReportID, createdReportActionIDForThread and splitReportActionID which we get from moneyRequestInformation
            split.transactionThreadReportID = transactionThreadReportID;
            split.createdReportActionIDForThread = createdReportActionIDForThread;
            split.splitReportActionID = iouAction.reportActionID;
        }

        optimisticData.push(...(onyxData.optimisticData ?? []));
        successData.push(...(onyxData.successData ?? []));
        failureData.push(...(onyxData.failureData ?? []));
    });

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`,
        value: {
            ...originalTransaction,
            reportID: CONST.REPORT.SPLIT_REPORT_ID,
        },
    });

    const firstIOU = iouActions.at(0);
    if (firstIOU) {
        const {updatedReportAction, iouReport, transactionThread} = prepareToCleanUpMoneyRequest(originalTransactionID, firstIOU);
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${firstIOU?.childReportID}`,
            value: null,
        });
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: updatedReportAction,
        });

        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport?.reportID}`,
            value: {
                [firstIOU.reportActionID]: {
                    ...firstIOU,
                    pendingAction: null,
                },
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${firstIOU?.childReportID}`,
            value: transactionThread,
        });
    }

    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`,
        value: originalTransaction,
    });

    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`,
        value: {
            data: {
                [`${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`]: null,
            },
        },
    });

    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.SNAPSHOT}${hash}`,
        value: {
            data: {
                [`${ONYXKEYS.COLLECTION.TRANSACTION}${originalTransactionID}`]: originalTransaction,
            },
        },
    });

    // Prepare splitApiParams for the Transaction_Split API call which requires a specific format for the splits
    // The format is: splits[0][amount], splits[0][category], splits[0][tag], etc.
    const splitApiParams = {} as Record<string, string | number>;
    splits.forEach((split, i) => {
        Object.entries(split).forEach(([key, value]) => {
            const formattedValue = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
            splitApiParams[`splits[${i}][${key}]`] = formattedValue;
        });
    });

    const parameters: SplitTransactionParams = {
        ...splitApiParams,
        isReverseSplitOperation: false,
        transactionID: originalTransactionID,
    };

    API.write(WRITE_COMMANDS.SPLIT_TRANSACTION, parameters, {optimisticData, successData, failureData});
    InteractionManager.runAfterInteractions(() => removeDraftSplitTransaction(originalTransactionID));
    const isSearchPageTopmostFullScreenRoute = isSearchTopmostFullScreenRoute();
    if (isSearchPageTopmostFullScreenRoute || !transactionReport?.parentReportID) {
        Navigation.dismissModal();
        return;
    }
    Navigation.dismissModalWithReport({reportID: expenseReport?.reportID ?? String(CONST.DEFAULT_NUMBER_ID)});
}

export {
    adjustRemainingSplitShares,
    approveMoneyRequest,
    canApproveIOU,
    canUnapproveIOU,
    cancelPayment,
    canIOUBePaid,
    canCancelPayment,
    cleanUpMoneyRequest,
    clearMoneyRequest,
    completeSplitBill,
    createDistanceRequest,
    createDraftTransaction,
    deleteMoneyRequest,
    deleteTrackExpense,
    detachReceipt,
    dismissHoldUseExplanation,
    getIOURequestPolicyID,
    initMoneyRequest,
    checkIfScanFileCanBeRead,
    dismissModalAndOpenReportInInboxTab,
    navigateToStartStepIfScanFileCannotBeRead,
    completePaymentOnboarding,
    convertBulkTrackedExpensesToIOU,
    payInvoice,
    payMoneyRequest,
    putOnHold,
    putTransactionsOnHold,
    replaceReceipt,
    requestMoney,
    resetSplitShares,
    resetDraftTransactionsCustomUnit,
    savePreferredPaymentMethod,
    sendInvoice,
    sendMoneyElsewhere,
    sendMoneyWithWallet,
    setCustomUnitRateID,
    setCustomUnitID,
    removeSubrate,
    addSubrate,
    updateSubrate,
    clearSubrates,
    setDraftSplitTransaction,
    setIndividualShare,
    setMoneyRequestAmount,
    setMoneyRequestAttendees,
    setMoneyRequestAccountant,
    setMoneyRequestBillable,
    setMoneyRequestCategory,
    setMoneyRequestCreated,
    setMoneyRequestDateAttribute,
    setMoneyRequestCurrency,
    setMoneyRequestDescription,
    setMoneyRequestDistanceRate,
    setMoneyRequestMerchant,
    setMoneyRequestParticipants,
    setMoneyRequestParticipantsFromReport,
    getMoneyRequestParticipantsFromReport,
    setMoneyRequestPendingFields,
    setMultipleMoneyRequestParticipantsFromReport,
    setMoneyRequestReceipt,
    setMoneyRequestTag,
    setMoneyRequestTaxAmount,
    setMoneyRequestTaxRate,
    setSplitPayer,
    setSplitShares,
    splitBill,
    splitBillAndOpenReport,
    startMoneyRequest,
    startSplitBill,
    submitReport,
    trackExpense,
    unapproveExpenseReport,
    unholdRequest,
    updateMoneyRequestAttendees,
    updateMoneyRequestAmountAndCurrency,
    updateMoneyRequestBillable,
    updateMoneyRequestCategory,
    updateMoneyRequestDate,
    updateMoneyRequestDescription,
    updateMoneyRequestDistance,
    updateMoneyRequestDistanceRate,
    updateMoneyRequestMerchant,
    updateMoneyRequestTag,
    updateMoneyRequestTaxAmount,
    updateMoneyRequestTaxRate,
    mergeDuplicates,
    updateLastLocationPermissionPrompt,
    resolveDuplicates,
    getIOUReportActionToApproveOrPay,
    getNavigationUrlOnMoneyRequestDelete,
    getNavigationUrlAfterTrackExpenseDelete,
    canSubmitReport,
    submitPerDiemExpense,
    calculateDiffAmount,
    computePerDiemExpenseAmount,
    initSplitExpense,
    addSplitExpenseField,
    updateSplitExpenseAmountField,
    saveSplitTransactions,
    initDraftSplitExpenseDataForEdit,
    removeSplitExpenseField,
    updateSplitExpenseField,
    reopenReport,
    retractReport,
    startDistanceRequest,
};
export type {GPSPoint as GpsPoint, IOURequestType, StartSplitBilActionParams, CreateTrackExpenseParams, RequestMoneyInformation, ReplaceReceipt};
