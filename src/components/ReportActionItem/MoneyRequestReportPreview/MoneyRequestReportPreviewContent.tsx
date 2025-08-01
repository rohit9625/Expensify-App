import React, {useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, View} from 'react-native';
import type {ListRenderItemInfo, ViewToken} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming} from 'react-native-reanimated';
import Button from '@components/Button';
import {getButtonRole} from '@components/Button/utils';
import ButtonWithDropdownMenu from '@components/ButtonWithDropdownMenu';
import {DelegateNoAccessContext} from '@components/DelegateNoAccessModalProvider';
import Icon from '@components/Icon';
import * as Expensicons from '@components/Icon/Expensicons';
import ImageSVG from '@components/ImageSVG';
import MoneyReportHeaderStatusBarSkeleton from '@components/MoneyReportHeaderStatusBarSkeleton';
import OfflineWithFeedback from '@components/OfflineWithFeedback';
import {PressableWithFeedback} from '@components/Pressable';
import PressableWithoutFeedback from '@components/Pressable/PressableWithoutFeedback';
import ProcessMoneyReportHoldMenu from '@components/ProcessMoneyReportHoldMenu';
import type {ActionHandledType} from '@components/ProcessMoneyReportHoldMenu';
import ExportWithDropdownMenu from '@components/ReportActionItem/ExportWithDropdownMenu';
import AnimatedSettlementButton from '@components/SettlementButton/AnimatedSettlementButton';
import {showContextMenuForReport} from '@components/ShowContextMenuContext';
import Text from '@components/Text';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useOnyx from '@hooks/useOnyx';
import usePaymentAnimations from '@hooks/usePaymentAnimations';
import useReportIsArchived from '@hooks/useReportIsArchived';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useStyleUtils from '@hooks/useStyleUtils';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import {openUnreportedExpense} from '@libs/actions/Report';
import ControlSelection from '@libs/ControlSelection';
import {convertToDisplayString} from '@libs/CurrencyUtils';
import {canUseTouchScreen} from '@libs/DeviceCapabilities';
import {getTotalAmountForIOUReportPreviewButton} from '@libs/MoneyRequestReportUtils';
import Navigation from '@libs/Navigation/Navigation';
import Performance from '@libs/Performance';
import {getConnectedIntegration} from '@libs/PolicyUtils';
import {getReportPreviewAction} from '@libs/ReportPreviewActionUtils';
import {
    areAllRequestsBeingSmartScanned as areAllRequestsBeingSmartScannedReportUtils,
    getDisplayNameForParticipant,
    getInvoicePayerName,
    getMoneyReportPreviewName,
    getMoneyRequestSpendBreakdown,
    getNonHeldAndFullAmount,
    getPolicyName,
    getReportStatusTranslation,
    getTransactionsWithReceipts,
    hasHeldExpenses as hasHeldExpensesReportUtils,
    hasNonReimbursableTransactions as hasNonReimbursableTransactionsReportUtils,
    hasOnlyHeldExpenses as hasOnlyHeldExpensesReportUtils,
    hasOnlyTransactionsWithPendingRoutes as hasOnlyTransactionsWithPendingRoutesReportUtils,
    hasUpdatedTotal,
    isInvoiceReport as isInvoiceReportUtils,
    isInvoiceRoom as isInvoiceRoomReportUtils,
    isPolicyExpenseChat as isPolicyExpenseChatReportUtils,
    isReportApproved,
    isSettled,
    isTripRoom as isTripRoomReportUtils,
    isWaitingForSubmissionFromCurrentUser as isWaitingForSubmissionFromCurrentUserReportUtils,
} from '@libs/ReportUtils';
import shouldAdjustScroll from '@libs/shouldAdjustScroll';
import {shouldRestrictUserBillableActions} from '@libs/SubscriptionUtils';
import {hasPendingUI, isCardTransaction, isPending} from '@libs/TransactionUtils';
import colors from '@styles/theme/colors';
import variables from '@styles/variables';
import {approveMoneyRequest, canIOUBePaid as canIOUBePaidIOUActions, payInvoice, payMoneyRequest, startMoneyRequest, submitReport} from '@userActions/IOU';
import Timing from '@userActions/Timing';
import CONST from '@src/CONST';
import type {TranslationPaths} from '@src/languages/types';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import type {Transaction} from '@src/types/onyx';
import type {PaymentMethodType} from '@src/types/onyx/OriginalMessage';
import EmptyMoneyRequestReportPreview from './EmptyMoneyRequestReportPreview';
import type {MoneyRequestReportPreviewContentProps} from './types';

function MoneyRequestReportPreviewContent({
    iouReportID,
    chatReportID,
    action,
    containerStyles,
    contextMenuAnchor,
    isHovered = false,
    isWhisper = false,
    checkIfContextMenuActive = () => {},
    onPaymentOptionsShow,
    onPaymentOptionsHide,
    chatReport,
    invoiceReceiverPolicy,
    iouReport,
    transactions,
    violations,
    policy,
    invoiceReceiverPersonalDetail,
    lastTransactionViolations,
    renderTransactionItem,
    onCarouselLayout,
    onWrapperLayout,
    currentWidth,
    reportPreviewStyles,
    shouldDisplayContextMenu = true,
    isInvoice,
    shouldShowBorder = false,
    onPress,
}: MoneyRequestReportPreviewContentProps) {
    const [chatReportMetadata] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_METADATA}${chatReportID}`, {canBeMissing: true, allowStaleData: true});
    const shouldShowLoading = !chatReportMetadata?.hasOnceLoadedReportActions && transactions.length === 0 && !chatReportMetadata?.isOptimisticReport;
    // `hasOnceLoadedReportActions` becomes true before transactions populate fully,
    // so we defer the loading state update to ensure transactions are loaded
    const shouldShowLoadingDeferred = useDeferredValue(shouldShowLoading);
    const lastTransaction = transactions?.at(0);
    const shouldShowSkeleton = shouldShowLoading && transactions.length === 0;
    const shouldShowEmptyPlaceholder = transactions.length === 0 && !shouldShowLoading;
    const showStatusAndSkeleton = !shouldShowEmptyPlaceholder;
    const theme = useTheme();
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const {translate} = useLocalize();
    const {isOffline} = useNetwork();
    const {shouldUseNarrowLayout} = useResponsiveLayout();

    const {areAllRequestsBeingSmartScanned, hasNonReimbursableTransactions} = useMemo(
        () => ({
            areAllRequestsBeingSmartScanned: areAllRequestsBeingSmartScannedReportUtils(iouReportID, action),
            hasOnlyTransactionsWithPendingRoutes: hasOnlyTransactionsWithPendingRoutesReportUtils(iouReportID),
            hasNonReimbursableTransactions: hasNonReimbursableTransactionsReportUtils(iouReportID),
        }),
        // When transactions get updated these values may have changed, so that is a case where we also want to recompute them
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
        [transactions, iouReportID, action],
    );

    const {isPaidAnimationRunning, isApprovedAnimationRunning, stopAnimation, startAnimation, startApprovedAnimation} = usePaymentAnimations();
    const [isHoldMenuVisible, setIsHoldMenuVisible] = useState(false);
    const [requestType, setRequestType] = useState<ActionHandledType>();
    const [paymentType, setPaymentType] = useState<PaymentMethodType>();
    const isIouReportArchived = useReportIsArchived(iouReportID);
    const isChatReportArchived = useReportIsArchived(chatReport?.reportID);

    const getCanIOUBePaid = useCallback(
        (shouldShowOnlyPayElsewhere = false, shouldCheckApprovedState = true) =>
            canIOUBePaidIOUActions(iouReport, chatReport, policy, transactions, shouldShowOnlyPayElsewhere, undefined, undefined, shouldCheckApprovedState),
        [iouReport, chatReport, policy, transactions],
    );

    const canIOUBePaid = useMemo(() => getCanIOUBePaid(), [getCanIOUBePaid]);
    const onlyShowPayElsewhere = useMemo(() => !canIOUBePaid && getCanIOUBePaid(true), [canIOUBePaid, getCanIOUBePaid]);
    const shouldShowPayButton = isPaidAnimationRunning || canIOUBePaid || onlyShowPayElsewhere;

    const {nonHeldAmount, fullAmount, hasValidNonHeldAmount} = getNonHeldAndFullAmount(iouReport, shouldShowPayButton);
    const canIOUBePaidAndApproved = useMemo(() => getCanIOUBePaid(false, false), [getCanIOUBePaid]);
    const connectedIntegration = getConnectedIntegration(policy);
    const hasOnlyHeldExpenses = hasOnlyHeldExpensesReportUtils(iouReport?.reportID);

    const managerID = iouReport?.managerID ?? action.childManagerAccountID ?? CONST.DEFAULT_NUMBER_ID;
    const {totalDisplaySpend} = getMoneyRequestSpendBreakdown(iouReport);

    const iouSettled = isSettled(iouReportID) || action?.childStatusNum === CONST.REPORT.STATUS_NUM.REIMBURSED;
    const previewMessageOpacity = useSharedValue(1);
    const previewMessageStyle = useAnimatedStyle(() => ({
        opacity: previewMessageOpacity.get(),
    }));
    const checkMarkScale = useSharedValue(iouSettled ? 1 : 0);

    const isApproved = isReportApproved({report: iouReport, parentReportAction: action});
    const thumbsUpScale = useSharedValue(isApproved ? 1 : 0);

    const isPolicyExpenseChat = isPolicyExpenseChatReportUtils(chatReport);
    const isInvoiceRoom = isInvoiceRoomReportUtils(chatReport);
    const isTripRoom = isTripRoomReportUtils(chatReport);

    const canAllowSettlement = hasUpdatedTotal(iouReport, policy);
    const numberOfRequests = transactions?.length ?? 0;
    const transactionsWithReceipts = getTransactionsWithReceipts(iouReportID);
    const numberOfPendingRequests = transactionsWithReceipts.filter((transaction) => isPending(transaction) && isCardTransaction(transaction)).length;

    const shouldShowRTERViolationMessage = numberOfRequests === 1 && hasPendingUI(lastTransaction, lastTransactionViolations);
    const shouldShowOnlyPayElsewhere = useMemo(() => !canIOUBePaid && getCanIOUBePaid(true), [canIOUBePaid, getCanIOUBePaid]);

    const hasReceipts = transactionsWithReceipts.length > 0;
    const isScanning = hasReceipts && areAllRequestsBeingSmartScanned;

    // The submit button should be success green color only if the user is submitter and the policy does not have Scheduled Submit turned on
    const isWaitingForSubmissionFromCurrentUser = useMemo(() => isWaitingForSubmissionFromCurrentUserReportUtils(chatReport, policy), [chatReport, policy]);
    const {isDelegateAccessRestricted, showDelegateNoAccessModal} = useContext(DelegateNoAccessContext);
    const [reportActions] = useOnyx(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReportID}`, {canBeMissing: true});
    const confirmPayment = useCallback(
        (type: PaymentMethodType | undefined, payAsBusiness?: boolean) => {
            if (!type) {
                return;
            }
            setPaymentType(type);
            setRequestType(CONST.IOU.REPORT_ACTION_TYPE.PAY);
            if (isDelegateAccessRestricted) {
                showDelegateNoAccessModal();
            } else if (hasHeldExpensesReportUtils(iouReport?.reportID)) {
                setIsHoldMenuVisible(true);
            } else if (chatReport && iouReport) {
                startAnimation();
                if (isInvoiceReportUtils(iouReport)) {
                    payInvoice(type, chatReport, iouReport, payAsBusiness);
                } else {
                    payMoneyRequest(type, chatReport, iouReport);
                }
            }
        },
        [chatReport, iouReport, isDelegateAccessRestricted, showDelegateNoAccessModal, startAnimation],
    );

    const confirmApproval = () => {
        setRequestType(CONST.IOU.REPORT_ACTION_TYPE.APPROVE);
        if (isDelegateAccessRestricted) {
            showDelegateNoAccessModal();
        } else if (hasHeldExpensesReportUtils(iouReport?.reportID)) {
            setIsHoldMenuVisible(true);
        } else {
            startApprovedAnimation();
            approveMoneyRequest(iouReport, true);
        }
    };

    const previewMessage = useMemo(() => {
        if (isScanning) {
            return totalDisplaySpend ? `${translate('common.receipt')} ${CONST.DOT_SEPARATOR} ${translate('common.scanning')}` : `${translate('common.receipt')}`;
        }
        if (numberOfPendingRequests === 1 && numberOfRequests === 1) {
            return `${translate('common.receipt')} ${CONST.DOT_SEPARATOR} ${translate('iou.pending')}`;
        }
        if (shouldShowRTERViolationMessage) {
            return `${translate('common.receipt')} ${CONST.DOT_SEPARATOR} ${translate('iou.pendingMatch')}`;
        }

        let payerOrApproverName;
        if (isPolicyExpenseChat || isTripRoom) {
            payerOrApproverName = getPolicyName({report: chatReport, policy});
        } else if (isInvoiceRoom) {
            payerOrApproverName = getInvoicePayerName(chatReport, invoiceReceiverPolicy, invoiceReceiverPersonalDetail);
        } else {
            payerOrApproverName = getDisplayNameForParticipant({accountID: managerID, shouldUseShortForm: true});
        }

        if (isApproved) {
            return translate('iou.managerApproved', {manager: payerOrApproverName});
        }
        let paymentVerb: TranslationPaths = 'iou.payerOwes';
        if (iouSettled || iouReport?.isWaitingOnBankAccount) {
            paymentVerb = 'iou.payerPaid';
        } else if (hasNonReimbursableTransactions) {
            paymentVerb = 'iou.payerSpent';
            payerOrApproverName = getDisplayNameForParticipant({accountID: chatReport?.ownerAccountID, shouldUseShortForm: true});
        }
        return translate(paymentVerb, {payer: payerOrApproverName});
    }, [
        isScanning,
        numberOfPendingRequests,
        numberOfRequests,
        shouldShowRTERViolationMessage,
        isPolicyExpenseChat,
        isTripRoom,
        isInvoiceRoom,
        isApproved,
        iouSettled,
        iouReport?.isWaitingOnBankAccount,
        hasNonReimbursableTransactions,
        translate,
        totalDisplaySpend,
        chatReport,
        policy,
        invoiceReceiverPolicy,
        invoiceReceiverPersonalDetail,
        managerID,
    ]);

    /*
     Show subtitle if at least one of the expenses is not being smart scanned, and either:
     - There is more than one expense – in this case, the "X expenses, Y scanning" subtitle is shown;
     - There is only one expense, it has a receipt and is not being smart scanned – in this case, the expense merchant or description is shown;

     * There is an edge case when there is only one distance expense with a pending route and amount = 0.
       In this case, we don't want to show the merchant or description because it says: "Pending route...", which is already displayed in the amount field.
     */
    const expenseCount = useMemo(
        () =>
            translate('iou.expenseCount', {
                count: numberOfRequests,
            }),
        [translate, numberOfRequests],
    );

    const reportStatus = useMemo(() => getReportStatusTranslation(iouReport?.stateNum, iouReport?.statusNum), [iouReport?.stateNum, iouReport?.statusNum]);

    const totalAmountStyle = shouldUseNarrowLayout ? [styles.flexColumnReverse, styles.alignItemsStretch] : [styles.flexRow, styles.alignItemsCenter];

    useEffect(() => {
        if (!isPaidAnimationRunning || isApprovedAnimationRunning) {
            return;
        }

        previewMessageOpacity.set(
            withTiming(0.75, {duration: CONST.ANIMATION_PAID_DURATION / 2}, () => {
                previewMessageOpacity.set(withTiming(1, {duration: CONST.ANIMATION_PAID_DURATION / 2}));
            }),
        );
        // We only want to animate the text when the text changes
        // eslint-disable-next-line react-compiler/react-compiler, react-hooks/exhaustive-deps
    }, [previewMessage, previewMessageOpacity]);

    useEffect(() => {
        if (!iouSettled) {
            return;
        }

        checkMarkScale.set(isPaidAnimationRunning ? withDelay(CONST.ANIMATION_PAID_CHECKMARK_DELAY, withSpring(1, {duration: CONST.ANIMATION_PAID_DURATION})) : 1);
    }, [isPaidAnimationRunning, iouSettled, checkMarkScale]);

    useEffect(() => {
        if (!isApproved) {
            return;
        }

        thumbsUpScale.set(isApprovedAnimationRunning ? withDelay(CONST.ANIMATION_THUMBS_UP_DELAY, withSpring(1, {duration: CONST.ANIMATION_THUMBS_UP_DURATION})) : 1);
    }, [isApproved, isApprovedAnimationRunning, thumbsUpScale]);

    const carouselTransactions = transactions.slice(0, 11);
    const prevCarouselTransactionLength = useRef(0);

    useEffect(() => {
        return () => {
            prevCarouselTransactionLength.current = carouselTransactions.length;
        };
    }, [carouselTransactions.length]);

    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentVisibleItems, setCurrentVisibleItems] = useState([0]);
    const [footerWidth, setFooterWidth] = useState(0);
    // optimisticIndex - value for index we are scrolling to with an arrow button or undefined after scroll is completed
    // value ensures that disabled state is applied instantly and not overridden by onViewableItemsChanged when scrolling
    // undefined makes arrow buttons react on currentIndex changes when scrolling manually
    const [optimisticIndex, setOptimisticIndex] = useState<number | undefined>(undefined);
    const carouselRef = useRef<FlatList<Transaction> | null>(null);
    const visibleItemsOnEndCount = useMemo(() => {
        const lastItemWidth = transactions.length > 10 ? footerWidth : reportPreviewStyles.transactionPreviewCarouselStyle.width;
        const lastItemWithGap = lastItemWidth + styles.gap2.gap;
        const itemWithGap = reportPreviewStyles.transactionPreviewCarouselStyle.width + styles.gap2.gap;
        return Math.floor((currentWidth - 2 * styles.pl2.paddingLeft - lastItemWithGap) / itemWithGap) + 1;
    }, [transactions.length, footerWidth, reportPreviewStyles.transactionPreviewCarouselStyle.width, styles.gap2.gap, styles.pl2.paddingLeft, currentWidth]);
    const viewabilityConfig = useMemo(() => {
        return {itemVisiblePercentThreshold: 100};
    }, []);

    // eslint-disable-next-line react-compiler/react-compiler
    const onViewableItemsChanged = useRef(({viewableItems}: {viewableItems: ViewToken[]; changed: ViewToken[]}) => {
        const newIndex = viewableItems.at(0)?.index;
        if (typeof newIndex === 'number') {
            setCurrentIndex(newIndex);
        }
        const viewableItemsIndexes = viewableItems.map((item) => item.index).filter((item): item is number => item !== null);
        setCurrentVisibleItems(viewableItemsIndexes);
    }).current;

    const handleChange = (index: number) => {
        if (index > carouselTransactions.length - visibleItemsOnEndCount) {
            setOptimisticIndex(carouselTransactions.length - visibleItemsOnEndCount);
            carouselRef.current?.scrollToIndex({index: carouselTransactions.length - visibleItemsOnEndCount, animated: true, viewOffset: 2 * styles.gap2.gap});
            return;
        }
        if (index < 0) {
            setOptimisticIndex(0);
            carouselRef.current?.scrollToIndex({index: 0, animated: true, viewOffset: 2 * styles.gap2.gap});
            return;
        }
        setOptimisticIndex(index);
        carouselRef.current?.scrollToIndex({index, animated: true, viewOffset: 2 * styles.gap2.gap});
    };

    const renderFlatlistItem = (itemInfo: ListRenderItemInfo<Transaction>) => {
        if (itemInfo.index > 9) {
            return (
                <View
                    style={[styles.flex1, styles.p5, styles.justifyContentCenter]}
                    onLayout={(e) => setFooterWidth(e.nativeEvent.layout.width)}
                >
                    <Text style={{color: colors.blue600}}>
                        +{transactions.length - 10} {translate('common.more').toLowerCase()}
                    </Text>
                </View>
            );
        }
        return renderTransactionItem(itemInfo);
    };

    // The button should expand up to transaction width
    const buttonMaxWidth =
        !shouldUseNarrowLayout && reportPreviewStyles.transactionPreviewCarouselStyle.width >= CONST.REPORT.TRANSACTION_PREVIEW.CAROUSEL.MIN_WIDE_WIDTH
            ? {maxWidth: reportPreviewStyles.transactionPreviewCarouselStyle.width}
            : {};

    // We also show icons in case of Approved or Paid report for easier identification at glance
    const isIconNeeded = useMemo(() => {
        return iouSettled || isApproved;
    }, [iouSettled, isApproved]);

    const approvedOrSettledIcon = isIconNeeded && (
        <ImageSVG
            src={isApproved ? Expensicons.ThumbsUp : Expensicons.Checkmark}
            fill={isApproved ? theme.icon : theme.iconSuccessFill}
            width={variables.iconSizeExtraSmall}
            height={variables.iconSizeExtraSmall}
            contentFit="cover"
        />
    );

    useEffect(() => {
        if (
            optimisticIndex === undefined ||
            optimisticIndex !== currentIndex ||
            // currentIndex is still the same as target (f.ex. 0), but not yet scrolled to the far left
            (currentVisibleItems.at(0) !== optimisticIndex && optimisticIndex !== undefined) ||
            // currentIndex reached, but not scrolled to the end
            (optimisticIndex === carouselTransactions.length - visibleItemsOnEndCount && currentVisibleItems.length !== visibleItemsOnEndCount)
        ) {
            return;
        }
        setOptimisticIndex(undefined);
    }, [carouselTransactions.length, currentIndex, currentVisibleItems, currentVisibleItems.length, optimisticIndex, visibleItemsOnEndCount]);

    const openReportFromPreview = useCallback(() => {
        if (!iouReportID) {
            return;
        }
        Performance.markStart(CONST.TIMING.OPEN_REPORT_FROM_PREVIEW);
        Timing.start(CONST.TIMING.OPEN_REPORT_FROM_PREVIEW);
        Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(iouReportID, undefined, undefined, undefined, undefined, Navigation.getActiveRoute()));
    }, [iouReportID]);

    const reportPreviewAction = useMemo(() => {
        // It's necessary to allow payment animation to finish before button is changed
        if (isPaidAnimationRunning) {
            return CONST.REPORT.REPORT_PREVIEW_ACTIONS.PAY;
        }
        return getReportPreviewAction(violations, isIouReportArchived || isChatReportArchived, iouReport, policy, transactions, invoiceReceiverPolicy);
    }, [isPaidAnimationRunning, violations, iouReport, policy, transactions, isIouReportArchived, invoiceReceiverPolicy, isChatReportArchived]);

    const addExpenseDropdownOptions = useMemo(
        () => [
            {
                value: CONST.REPORT.ADD_EXPENSE_OPTIONS.CREATE_NEW_EXPENSE,
                text: translate('iou.createExpense'),
                icon: Expensicons.Plus,
                onSelected: () => {
                    if (!iouReport?.reportID) {
                        return;
                    }
                    if (policy && shouldRestrictUserBillableActions(policy.id)) {
                        Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(policy.id));
                        return;
                    }
                    startMoneyRequest(CONST.IOU.TYPE.SUBMIT, iouReport?.reportID, undefined, false, chatReportID);
                },
            },
            {
                value: CONST.REPORT.ADD_EXPENSE_OPTIONS.ADD_UNREPORTED_EXPENSE,
                text: translate('iou.addUnreportedExpense'),
                icon: Expensicons.ReceiptPlus,
                onSelected: () => {
                    if (policy && shouldRestrictUserBillableActions(policy.id)) {
                        Navigation.navigate(ROUTES.RESTRICTED_ACTION.getRoute(policy.id));
                        return;
                    }
                    openUnreportedExpense(iouReport?.reportID, iouReport?.parentReportID);
                },
            },
        ],
        [chatReportID, iouReport?.parentReportID, iouReport?.reportID, policy, translate],
    );

    const isReportDeleted = action?.pendingAction === CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE;
    const formattedAmount = getTotalAmountForIOUReportPreviewButton(iouReport, policy, reportPreviewAction);

    const reportPreviewActions = {
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.SUBMIT]: (
            <Button
                success={isWaitingForSubmissionFromCurrentUser}
                text={translate('common.submit')}
                onPress={() => submitReport(iouReport)}
            />
        ),
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.APPROVE]: (
            <Button
                text={translate('iou.approve')}
                success
                onPress={() => confirmApproval()}
            />
        ),
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.PAY]: (
            <AnimatedSettlementButton
                onlyShowPayElsewhere={shouldShowOnlyPayElsewhere}
                isPaidAnimationRunning={isPaidAnimationRunning}
                isApprovedAnimationRunning={isApprovedAnimationRunning}
                canIOUBePaid={canIOUBePaidAndApproved || isPaidAnimationRunning}
                onAnimationFinish={stopAnimation}
                chatReportID={chatReportID}
                policyID={policy?.id}
                iouReport={iouReport}
                currency={iouReport?.currency}
                wrapperStyle={buttonMaxWidth}
                onPress={confirmPayment}
                onPaymentOptionsShow={onPaymentOptionsShow}
                onPaymentOptionsHide={onPaymentOptionsHide}
                formattedAmount={formattedAmount}
                confirmApproval={confirmApproval}
                enablePaymentsRoute={ROUTES.ENABLE_PAYMENTS}
                shouldHidePaymentOptions={!shouldShowPayButton}
                kycWallAnchorAlignment={{
                    horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.LEFT,
                    vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
                }}
                paymentMethodDropdownAnchorAlignment={{
                    horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.RIGHT,
                    vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
                }}
                isDisabled={isOffline && !canAllowSettlement}
                isLoading={!isOffline && !canAllowSettlement}
            />
        ),
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.EXPORT_TO_ACCOUNTING]: connectedIntegration ? (
            <ExportWithDropdownMenu
                report={iouReport}
                reportActions={reportActions}
                connectionName={connectedIntegration}
                wrapperStyle={styles.flexReset}
                dropdownAnchorAlignment={{
                    horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.RIGHT,
                    vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
                }}
            />
        ) : null,
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.REVIEW]: (
            <Button
                icon={Expensicons.DotIndicator}
                iconFill={theme.danger}
                iconHoverFill={theme.danger}
                text={translate('common.review')}
                onPress={() => openReportFromPreview()}
            />
        ),
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.VIEW]: (
            <Button
                text={translate('common.view')}
                onPress={() => {
                    openReportFromPreview();
                }}
            />
        ),
        [CONST.REPORT.REPORT_PREVIEW_ACTIONS.ADD_EXPENSE]: (
            <ButtonWithDropdownMenu
                onPress={() => {}}
                shouldAlwaysShowDropdownMenu
                customText={translate('iou.addExpense')}
                options={addExpenseDropdownOptions}
                isSplitButton={false}
                anchorAlignment={{
                    horizontal: CONST.MODAL.ANCHOR_ORIGIN_HORIZONTAL.RIGHT,
                    vertical: CONST.MODAL.ANCHOR_ORIGIN_VERTICAL.BOTTOM,
                }}
            />
        ),
    };

    const adjustScroll = useCallback(() => {
        // Workaround for a known React Native bug on Android (https://github.com/facebook/react-native/issues/27504):
        // When the FlatList is scrolled to the end and the last item is deleted, a blank space is left behind.
        // To fix this, we detect when onEndReached is triggered due to an item deletion,
        // and programmatically scroll to the end to fill the space.
        if (carouselTransactions.length >= prevCarouselTransactionLength.current || !shouldAdjustScroll) {
            return;
        }
        prevCarouselTransactionLength.current = carouselTransactions.length;
        carouselRef.current?.scrollToEnd();
    }, [carouselTransactions.length]);

    return (
        <View
            onLayout={onWrapperLayout}
            testID="MoneyRequestReportPreviewContent-wrapper"
        >
            <OfflineWithFeedback
                pendingAction={iouReport?.pendingFields?.preview}
                shouldDisableOpacity={!!(action.pendingAction ?? action.isOptimisticAction)}
                needsOffscreenAlphaCompositing
                style={styles.mt1}
            >
                <View
                    style={[styles.chatItemMessage, isReportDeleted && [styles.cursorDisabled, styles.pointerEventsAuto], containerStyles]}
                    onLayout={onCarouselLayout}
                    testID="carouselWidthSetter"
                >
                    <PressableWithoutFeedback
                        onPress={onPress}
                        onPressIn={() => canUseTouchScreen() && ControlSelection.block()}
                        onPressOut={() => ControlSelection.unblock()}
                        onLongPress={(event) => {
                            if (!shouldDisplayContextMenu) {
                                return;
                            }
                            showContextMenuForReport(event, contextMenuAnchor, chatReportID, action, checkIfContextMenuActive);
                        }}
                        shouldUseHapticsOnLongPress
                        style={[
                            styles.flexRow,
                            styles.justifyContentBetween,
                            StyleUtils.getBackgroundColorStyle(theme.cardBG),
                            shouldShowBorder ? styles.borderedContentCardLarge : styles.reportContainerBorderRadius,
                            isReportDeleted && styles.pointerEventsNone,
                        ]}
                        role={getButtonRole(true)}
                        isNested
                        accessibilityLabel={translate('iou.viewDetails')}
                    >
                        <View
                            style={[
                                StyleUtils.getBackgroundColorStyle(theme.cardBG),
                                styles.reportContainerBorderRadius,
                                styles.w100,
                                (isHovered || isScanning || isWhisper) && styles.reportPreviewBoxHoverBorder,
                            ]}
                        >
                            <View style={[reportPreviewStyles.wrapperStyle]}>
                                <View style={[reportPreviewStyles.contentContainerStyle, styles.gap4]}>
                                    <View style={[styles.expenseAndReportPreviewTextContainer, styles.overflowHidden]}>
                                        <View style={[styles.flexRow, styles.justifyContentBetween, styles.flexShrink1, styles.gap1]}>
                                            <View style={[styles.flexColumn, styles.gap1, styles.flexShrink1]}>
                                                <View style={[styles.flexRow, styles.mw100, styles.flexShrink1]}>
                                                    <Animated.View style={[styles.flexRow, styles.alignItemsCenter, previewMessageStyle, styles.flexShrink1]}>
                                                        <Text
                                                            style={[styles.headerText]}
                                                            testID="MoneyRequestReportPreview-reportName"
                                                        >
                                                            {getMoneyReportPreviewName(action, iouReport, isInvoice)}
                                                        </Text>
                                                    </Animated.View>
                                                </View>
                                                {showStatusAndSkeleton && shouldShowSkeleton ? (
                                                    <MoneyReportHeaderStatusBarSkeleton />
                                                ) : (
                                                    !shouldShowEmptyPlaceholder && (
                                                        <View style={[styles.flexRow, styles.justifyContentStart, styles.alignItemsCenter]}>
                                                            {isIconNeeded && <View style={[styles.alignItemsCenter, styles.lh16, styles.mr1]}>{approvedOrSettledIcon}</View>}
                                                            <Text style={[styles.textLabelSupporting, styles.lh16]}>{`${reportStatus} ${CONST.DOT_SEPARATOR} ${expenseCount}`}</Text>
                                                        </View>
                                                    )
                                                )}
                                            </View>
                                            {!shouldUseNarrowLayout && transactions.length > 2 && reportPreviewStyles.expenseCountVisible && (
                                                <View style={[styles.flexRow, styles.alignItemsCenter]}>
                                                    <PressableWithFeedback
                                                        accessibilityRole="button"
                                                        accessible
                                                        accessibilityLabel="button"
                                                        style={[styles.reportPreviewArrowButton, {backgroundColor: theme.buttonDefaultBG}]}
                                                        onPress={() => handleChange(currentIndex - 1)}
                                                        disabled={optimisticIndex !== undefined ? optimisticIndex === 0 : currentIndex === 0 && currentVisibleItems.at(0) === 0}
                                                        disabledStyle={[styles.cursorDefault, styles.buttonOpacityDisabled]}
                                                    >
                                                        <Icon
                                                            src={Expensicons.BackArrow}
                                                            small
                                                            fill={theme.icon}
                                                            isButtonIcon
                                                        />
                                                    </PressableWithFeedback>
                                                    <PressableWithFeedback
                                                        accessibilityRole="button"
                                                        accessible
                                                        accessibilityLabel="button"
                                                        style={[styles.reportPreviewArrowButton, {backgroundColor: theme.buttonDefaultBG}]}
                                                        onPress={() => handleChange(currentIndex + 1)}
                                                        disabled={
                                                            optimisticIndex
                                                                ? optimisticIndex + visibleItemsOnEndCount >= carouselTransactions.length
                                                                : currentVisibleItems.at(-1) === carouselTransactions.length - 1
                                                        }
                                                        disabledStyle={[styles.cursorDefault, styles.buttonOpacityDisabled]}
                                                    >
                                                        <Icon
                                                            src={Expensicons.ArrowRight}
                                                            small
                                                            fill={theme.icon}
                                                            isButtonIcon
                                                        />
                                                    </PressableWithFeedback>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    {!currentWidth || shouldShowLoading || shouldShowLoadingDeferred ? (
                                        <View
                                            style={[
                                                {
                                                    height: CONST.REPORT.TRANSACTION_PREVIEW.CAROUSEL.WIDE_HEIGHT,
                                                    minWidth: shouldUseNarrowLayout
                                                        ? CONST.REPORT.TRANSACTION_PREVIEW.CAROUSEL.MIN_NARROW_WIDTH
                                                        : CONST.REPORT.TRANSACTION_PREVIEW.CAROUSEL.MIN_WIDE_WIDTH,
                                                },
                                                styles.justifyContentCenter,
                                                styles.mtn1,
                                            ]}
                                        >
                                            <ActivityIndicator
                                                color={theme.spinner}
                                                size={40}
                                            />
                                        </View>
                                    ) : (
                                        <View style={[styles.flex1, styles.flexColumn, styles.overflowVisible]}>
                                            <FlatList
                                                snapToAlignment="start"
                                                decelerationRate="fast"
                                                snapToInterval={reportPreviewStyles.transactionPreviewCarouselStyle.width + styles.gap2.gap}
                                                horizontal
                                                data={carouselTransactions}
                                                ref={carouselRef}
                                                nestedScrollEnabled
                                                bounces={false}
                                                keyExtractor={(item) => `${item.transactionID}_${reportPreviewStyles.transactionPreviewCarouselStyle.width}`}
                                                contentContainerStyle={[styles.gap2]}
                                                style={reportPreviewStyles.flatListStyle}
                                                showsHorizontalScrollIndicator={false}
                                                renderItem={renderFlatlistItem}
                                                onViewableItemsChanged={onViewableItemsChanged}
                                                onEndReached={adjustScroll}
                                                viewabilityConfig={viewabilityConfig}
                                                ListFooterComponent={<View style={styles.pl2} />}
                                                ListHeaderComponent={<View style={styles.pr2} />}
                                            />
                                            {shouldShowEmptyPlaceholder && <EmptyMoneyRequestReportPreview />}
                                        </View>
                                    )}
                                    <View style={[styles.expenseAndReportPreviewTextContainer]}>
                                        <View style={[totalAmountStyle, styles.justifyContentBetween, styles.gap4, StyleUtils.getMinimumHeight(variables.h28)]}>
                                            {/* height is needed to avoid flickering on animation */}
                                            <View style={[buttonMaxWidth, styles.flex1, {height: variables.h40}]}>{reportPreviewActions[reportPreviewAction]}</View>
                                            {transactions.length > 1 && (
                                                <View style={[styles.flexRow, shouldUseNarrowLayout ? styles.justifyContentBetween : styles.gap2, styles.alignItemsCenter]}>
                                                    <Text
                                                        style={[styles.textLabelSupporting]}
                                                        numberOfLines={1}
                                                    >
                                                        {translate('common.total')}
                                                    </Text>
                                                    <Text style={[styles.headerText]}>{convertToDisplayString(totalDisplaySpend, iouReport?.currency)}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                    </PressableWithoutFeedback>
                </View>
                {isHoldMenuVisible && !!iouReport && !!requestType && (
                    <ProcessMoneyReportHoldMenu
                        nonHeldAmount={!hasOnlyHeldExpenses && hasValidNonHeldAmount ? nonHeldAmount : undefined}
                        requestType={requestType}
                        fullAmount={fullAmount}
                        onClose={() => setIsHoldMenuVisible(false)}
                        isVisible={isHoldMenuVisible}
                        paymentType={paymentType}
                        chatReport={chatReport}
                        moneyRequestReport={iouReport}
                        transactionCount={numberOfRequests}
                        startAnimation={() => {
                            if (requestType === CONST.IOU.REPORT_ACTION_TYPE.APPROVE) {
                                startApprovedAnimation();
                            } else {
                                startAnimation();
                            }
                        }}
                    />
                )}
            </OfflineWithFeedback>
        </View>
    );
}

MoneyRequestReportPreviewContent.displayName = 'MoneyRequestReportPreviewContent';

export default MoneyRequestReportPreviewContent;
