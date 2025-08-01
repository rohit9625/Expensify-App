import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import type {ValueOf} from 'type-fest';
import CONST from '@src/CONST';
import type {Policy, Report, ReportAction, ReportNameValuePairs, Transaction, TransactionViolation} from '@src/types/onyx';
import {isApprover as isApproverUtils} from './actions/Policy/Member';
import {getCurrentUserAccountID} from './actions/Report';
import {
    arePaymentsEnabled as arePaymentsEnabledUtils,
    getCorrectedAutoReportingFrequency,
    getSubmitToAccountID,
    getValidConnectedIntegration,
    hasIntegrationAutoSync,
    isPreferredExporter,
} from './PolicyUtils';
import {getAllReportActions, getOneTransactionThreadReportID, isMoneyRequestAction} from './ReportActionsUtils';
import {
    canAddTransaction as canAddTransactionUtil,
    canHoldUnholdReportAction,
    getMoneyRequestSpendBreakdown,
    getParentReport,
    hasExportError as hasExportErrorUtil,
    hasOnlyHeldExpenses,
    hasReportBeenReopened as hasReportBeenReopenedUtils,
    isArchivedReport,
    isClosedReport as isClosedReportUtils,
    isCurrentUserSubmitter,
    isExpenseReport as isExpenseReportUtils,
    isExported as isExportedUtil,
    isHoldCreator,
    isInvoiceReport as isInvoiceReportUtils,
    isIOUReport as isIOUReportUtils,
    isOpenReport as isOpenReportUtils,
    isPayer,
    isProcessingReport as isProcessingReportUtils,
    isReportApproved as isReportApprovedUtils,
    isReportManager,
    isSettled,
} from './ReportUtils';
import {getSession} from './SessionUtils';
import {
    allHavePendingRTERViolation,
    hasPendingRTERViolation as hasPendingRTERViolationTransactionUtils,
    isDuplicate,
    isOnHold as isOnHoldTransactionUtils,
    isPending,
    isScanning,
    shouldShowBrokenConnectionViolationForMultipleTransactions,
    shouldShowBrokenConnectionViolation as shouldShowBrokenConnectionViolationTransactionUtils,
} from './TransactionUtils';

type GetReportPrimaryActionParams = {
    report: Report;
    chatReport: OnyxEntry<Report>;
    reportTransactions: Transaction[];
    violations: OnyxCollection<TransactionViolation[]>;
    policy?: Policy;
    reportNameValuePairs?: ReportNameValuePairs;
    reportActions?: ReportAction[];
    isChatReportArchived: boolean;
    invoiceReceiverPolicy?: Policy;
};

function isAddExpenseAction(report: Report, reportTransactions: Transaction[], isChatReportArchived: boolean) {
    if (isChatReportArchived) {
        return false;
    }

    const isExpenseReport = isExpenseReportUtils(report);
    const canAddTransaction = canAddTransactionUtil(report);

    return isExpenseReport && canAddTransaction && reportTransactions.length === 0;
}

function isSubmitAction(report: Report, reportTransactions: Transaction[], policy?: Policy, reportNameValuePairs?: ReportNameValuePairs, reportActions?: ReportAction[]) {
    if (isArchivedReport(reportNameValuePairs)) {
        return false;
    }

    const isExpenseReport = isExpenseReportUtils(report);
    const isReportSubmitter = isCurrentUserSubmitter(report);
    const isOpenReport = isOpenReportUtils(report);
    const isManualSubmitEnabled = getCorrectedAutoReportingFrequency(policy) === CONST.POLICY.AUTO_REPORTING_FREQUENCIES.MANUAL;
    const transactionAreComplete = reportTransactions.every((transaction) => transaction.amount !== 0 || transaction.modifiedAmount !== 0);

    if (reportTransactions.length > 0 && reportTransactions.every((transaction) => isPending(transaction))) {
        return false;
    }

    const isAnyReceiptBeingScanned = reportTransactions?.some((transaction) => isScanning(transaction));
    const hasReportBeenReopened = hasReportBeenReopenedUtils(reportActions);

    if (isAnyReceiptBeingScanned) {
        return false;
    }

    const submitToAccountID = getSubmitToAccountID(policy, report);

    if (submitToAccountID === report.ownerAccountID && policy?.preventSelfApproval) {
        return false;
    }

    const baseIsSubmit = isExpenseReport && isReportSubmitter && isOpenReport && reportTransactions.length !== 0 && transactionAreComplete;
    if (hasReportBeenReopened && baseIsSubmit) {
        return true;
    }

    return isManualSubmitEnabled && baseIsSubmit;
}

function isApproveAction(report: Report, reportTransactions: Transaction[], policy?: Policy) {
    const isAnyReceiptBeingScanned = reportTransactions?.some((transaction) => isScanning(transaction));

    if (isAnyReceiptBeingScanned) {
        return false;
    }

    const currentUserAccountID = getCurrentUserAccountID();
    const managerID = report?.managerID ?? CONST.DEFAULT_NUMBER_ID;
    const isCurrentUserManager = managerID === currentUserAccountID;
    if (!isCurrentUserManager) {
        return false;
    }
    const isExpenseReport = isExpenseReportUtils(report);
    const isApprovalEnabled = policy?.approvalMode && policy.approvalMode !== CONST.POLICY.APPROVAL_MODE.OPTIONAL;

    if (!isExpenseReport || !isApprovalEnabled || reportTransactions.length === 0) {
        return false;
    }

    if (reportTransactions.length > 0 && reportTransactions.every((transaction) => isPending(transaction))) {
        return false;
    }

    const isPreventSelfApprovalEnabled = policy?.preventSelfApproval;
    const isReportSubmitter = isCurrentUserSubmitter(report);

    if (isPreventSelfApprovalEnabled && isReportSubmitter) {
        return false;
    }

    return isProcessingReportUtils(report);
}

function isPrimaryPayAction(report: Report, policy?: Policy, reportNameValuePairs?: ReportNameValuePairs, isChatReportArchived?: boolean, invoiceReceiverPolicy?: Policy) {
    if (isArchivedReport(reportNameValuePairs) || isChatReportArchived) {
        return false;
    }
    const isExpenseReport = isExpenseReportUtils(report);
    const isReportPayer = isPayer(getSession(), report, false, policy);
    const arePaymentsEnabled = arePaymentsEnabledUtils(policy);
    const isReportApproved = isReportApprovedUtils({report});
    const isReportClosed = isClosedReportUtils(report);
    const isProcessingReport = isProcessingReportUtils(report);

    const isApprovalEnabled = policy ? policy.approvalMode && policy.approvalMode !== CONST.POLICY.APPROVAL_MODE.OPTIONAL : false;
    const isSubmittedWithoutApprovalsEnabled = !isApprovalEnabled && isProcessingReport;

    const isReportFinished = (isReportApproved && !report.isWaitingOnBankAccount) || isSubmittedWithoutApprovalsEnabled || isReportClosed;
    const {reimbursableSpend} = getMoneyRequestSpendBreakdown(report);

    if (isReportPayer && isExpenseReport && arePaymentsEnabled && isReportFinished && reimbursableSpend > 0) {
        return true;
    }

    if (!isProcessingReport) {
        return false;
    }

    const isIOUReport = isIOUReportUtils(report);

    if (isIOUReport && isReportPayer && reimbursableSpend > 0) {
        return true;
    }

    const isInvoiceReport = isInvoiceReportUtils(report);

    if (!isInvoiceReport) {
        return false;
    }

    const parentReport = getParentReport(report);
    if (parentReport?.invoiceReceiver?.type === CONST.REPORT.INVOICE_RECEIVER_TYPE.INDIVIDUAL && reimbursableSpend > 0) {
        return parentReport?.invoiceReceiver?.accountID === getCurrentUserAccountID();
    }

    return invoiceReceiverPolicy?.role === CONST.POLICY.ROLE.ADMIN && reimbursableSpend > 0;
}

function isExportAction(report: Report, policy?: Policy, reportActions?: ReportAction[]) {
    if (!policy) {
        return false;
    }

    const connectedIntegration = getValidConnectedIntegration(policy);
    const isInvoiceReport = isInvoiceReportUtils(report);

    if (!connectedIntegration || isInvoiceReport) {
        return false;
    }

    const isReportExporter = isPreferredExporter(policy);
    if (!isReportExporter) {
        return false;
    }

    const syncEnabled = hasIntegrationAutoSync(policy, connectedIntegration);
    const isExported = isExportedUtil(reportActions);
    if (isExported) {
        return false;
    }

    const hasExportError = hasExportErrorUtil(reportActions);
    if (syncEnabled && !hasExportError) {
        return false;
    }

    if (report.isWaitingOnBankAccount) {
        return false;
    }

    const isReportReimbursed = isSettled(report);
    const isReportApproved = isReportApprovedUtils({report});
    const isReportClosed = isClosedReportUtils(report);

    if (isReportApproved || isReportReimbursed || isReportClosed) {
        return true;
    }

    return false;
}

function isRemoveHoldAction(report: Report, chatReport: OnyxEntry<Report>, reportTransactions: Transaction[]) {
    const isReportOnHold = reportTransactions.some(isOnHoldTransactionUtils);

    if (!isReportOnHold) {
        return false;
    }

    const reportActions = getAllReportActions(report.reportID);
    const transactionThreadReportID = getOneTransactionThreadReportID(report, chatReport, reportActions);

    if (!transactionThreadReportID) {
        return false;
    }

    // Transaction is attached to expense report but hold action is attached to transaction thread report
    const isHolder = reportTransactions.some((transaction) => isHoldCreator(transaction, transactionThreadReportID));

    return isHolder;
}

function isReviewDuplicatesAction(report: Report, reportTransactions: Transaction[]) {
    const hasDuplicates = reportTransactions.some((transaction) => isDuplicate(transaction));

    if (!hasDuplicates) {
        return false;
    }

    const isReportApprover = isReportManager(report);
    const isReportSubmitter = isCurrentUserSubmitter(report);
    const isProcessingReport = isProcessingReportUtils(report);
    const isReportOpen = isOpenReportUtils(report);

    const isSubmitterOrApprover = isReportSubmitter || isReportApprover;
    const isReportActive = isReportOpen || isProcessingReport;

    if (isSubmitterOrApprover && isReportActive) {
        return true;
    }

    return false;
}

function isMarkAsCashAction(report: Report, reportTransactions: Transaction[], violations: OnyxCollection<TransactionViolation[]>, policy?: Policy) {
    const isOneExpenseReport = isExpenseReportUtils(report) && reportTransactions.length === 1;

    if (!isOneExpenseReport) {
        return false;
    }

    const transactionIDs = reportTransactions.map((t) => t.transactionID);
    const hasAllPendingRTERViolations = allHavePendingRTERViolation(reportTransactions, violations);

    if (hasAllPendingRTERViolations) {
        return true;
    }

    const isReportSubmitter = isCurrentUserSubmitter(report);
    const isReportApprover = isApproverUtils(policy, getCurrentUserAccountID());
    const isAdmin = policy?.role === CONST.POLICY.ROLE.ADMIN;

    const shouldShowBrokenConnectionViolation = shouldShowBrokenConnectionViolationForMultipleTransactions(transactionIDs, report, policy, violations);
    const userControlsReport = isReportSubmitter || isReportApprover || isAdmin;
    return userControlsReport && shouldShowBrokenConnectionViolation;
}

function getAllExpensesToHoldIfApplicable(report?: Report, reportActions?: ReportAction[]) {
    if (!report || !reportActions || !hasOnlyHeldExpenses(report?.reportID)) {
        return [];
    }

    return reportActions?.filter((action) => isMoneyRequestAction(action) && action.childType === CONST.REPORT.TYPE.CHAT && canHoldUnholdReportAction(action).canUnholdRequest);
}

function getReportPrimaryAction(params: GetReportPrimaryActionParams): ValueOf<typeof CONST.REPORT.PRIMARY_ACTIONS> | '' {
    const {report, reportTransactions, violations, policy, reportNameValuePairs, reportActions, isChatReportArchived, chatReport, invoiceReceiverPolicy} = params;

    const isPayActionWithAllExpensesHeld = isPrimaryPayAction(report, policy, reportNameValuePairs, isChatReportArchived) && hasOnlyHeldExpenses(report?.reportID);

    if (isAddExpenseAction(report, reportTransactions, isChatReportArchived)) {
        return CONST.REPORT.PRIMARY_ACTIONS.ADD_EXPENSE;
    }

    if (isMarkAsCashAction(report, reportTransactions, violations, policy)) {
        return CONST.REPORT.PRIMARY_ACTIONS.MARK_AS_CASH;
    }

    if (isReviewDuplicatesAction(report, reportTransactions)) {
        return CONST.REPORT.PRIMARY_ACTIONS.REVIEW_DUPLICATES;
    }

    if (isRemoveHoldAction(report, chatReport, reportTransactions) || isPayActionWithAllExpensesHeld) {
        return CONST.REPORT.PRIMARY_ACTIONS.REMOVE_HOLD;
    }

    if (isSubmitAction(report, reportTransactions, policy, reportNameValuePairs, reportActions)) {
        return CONST.REPORT.PRIMARY_ACTIONS.SUBMIT;
    }

    if (isApproveAction(report, reportTransactions, policy)) {
        return CONST.REPORT.PRIMARY_ACTIONS.APPROVE;
    }

    if (isPrimaryPayAction(report, policy, reportNameValuePairs, isChatReportArchived, invoiceReceiverPolicy)) {
        return CONST.REPORT.PRIMARY_ACTIONS.PAY;
    }

    if (isExportAction(report, policy, reportActions)) {
        return CONST.REPORT.PRIMARY_ACTIONS.EXPORT_TO_ACCOUNTING;
    }

    if (getAllExpensesToHoldIfApplicable(report, reportActions).length) {
        return CONST.REPORT.PRIMARY_ACTIONS.REMOVE_HOLD;
    }

    return '';
}

function isMarkAsCashActionForTransaction(parentReport: Report, violations: TransactionViolation[], policy?: Policy): boolean {
    const hasPendingRTERViolation = hasPendingRTERViolationTransactionUtils(violations);

    if (hasPendingRTERViolation) {
        return true;
    }

    const shouldShowBrokenConnectionViolation = shouldShowBrokenConnectionViolationTransactionUtils(parentReport, policy, violations);

    if (!shouldShowBrokenConnectionViolation) {
        return false;
    }

    const isReportSubmitter = isCurrentUserSubmitter(parentReport);
    const isReportApprover = isApproverUtils(policy, getCurrentUserAccountID());
    const isAdmin = policy?.role === CONST.POLICY.ROLE.ADMIN;

    return isReportSubmitter || isReportApprover || isAdmin;
}

function getTransactionThreadPrimaryAction(
    transactionThreadReport: Report,
    parentReport: Report,
    reportTransaction: Transaction,
    violations: TransactionViolation[],
    policy?: Policy,
): ValueOf<typeof CONST.REPORT.TRANSACTION_PRIMARY_ACTIONS> | '' {
    if (isHoldCreator(reportTransaction, transactionThreadReport.reportID)) {
        return CONST.REPORT.TRANSACTION_PRIMARY_ACTIONS.REMOVE_HOLD;
    }

    if (isReviewDuplicatesAction(parentReport, [reportTransaction])) {
        return CONST.REPORT.TRANSACTION_PRIMARY_ACTIONS.REVIEW_DUPLICATES;
    }

    if (isMarkAsCashActionForTransaction(parentReport, violations, policy)) {
        return CONST.REPORT.TRANSACTION_PRIMARY_ACTIONS.MARK_AS_CASH;
    }

    return '';
}

export {getReportPrimaryAction, getTransactionThreadPrimaryAction, isAddExpenseAction, isPrimaryPayAction, isExportAction, getAllExpensesToHoldIfApplicable, isReviewDuplicatesAction};
